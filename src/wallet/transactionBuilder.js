import {
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  ComputeBudgetProgram,
  PublicKey
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { logger } from '../utils/logger.js';

/**
 * Transaction Builder Module
 * Constructs optimized transactions for trading operations
 */

export class TransactionBuilder {
  constructor(connection, config) {
    this.connection = connection;
    this.config = config;
  }

  /**
   * Build swap transaction using Jupiter API
   */
  async buildSwapTransaction(wallet, params) {
    const {
      inputMint,
      outputMint,
      amount,
      slippageBps = 300, // 3% default
      priorityFeeLamports = 10000
    } = params;

    try {
      logger.info(`Building swap: ${amount} ${inputMint} -> ${outputMint}`);

      // Get Jupiter quote
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${amount}&` +
        `slippageBps=${slippageBps}`;

      const quoteResponse = await fetch(quoteUrl);
      const quote = await quoteResponse.json();

      if (!quote || quote.error) {
        throw new Error(`Jupiter quote failed: ${quote?.error || 'Unknown error'}`);
      }

      // Get swap transaction from Jupiter
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.publicKey,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: priorityFeeLamports
        })
      });

      const swapData = await swapResponse.json();

      if (!swapData.swapTransaction) {
        throw new Error('Failed to get swap transaction from Jupiter');
      }

      // Deserialize transaction
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = Transaction.from(swapTransactionBuf);

      // Add compute budget instructions if not present
      transaction.instructions.unshift(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFeeLamports
        })
      );

      logger.info(`Swap transaction built: ${quote.inAmount} -> ${quote.outAmount}`);

      return {
        transaction,
        quote,
        estimatedOutput: quote.outAmount,
        priceImpact: quote.priceImpactPct
      };

    } catch (error) {
      logger.error('Error building swap transaction:', error);
      throw error;
    }
  }

  /**
   * Build buy transaction (SOL -> Token)
   */
  async buildBuyTransaction(wallet, tokenMint, solAmount, slippageBps = 300) {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    // Convert SOL to lamports
    const lamports = Math.floor(solAmount * 1e9);

    return await this.buildSwapTransaction(wallet, {
      inputMint: SOL_MINT,
      outputMint: tokenMint,
      amount: lamports,
      slippageBps
    });
  }

  /**
   * Build sell transaction (Token -> SOL)
   */
  async buildSellTransaction(wallet, tokenMint, tokenAmount, slippageBps = 300) {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    return await this.buildSwapTransaction(wallet, {
      inputMint: tokenMint,
      outputMint: SOL_MINT,
      amount: tokenAmount,
      slippageBps
    });
  }

  /**
   * Build transaction to create associated token account if needed
   */
  async buildCreateTokenAccountTx(wallet, tokenMint) {
    try {
      const walletPubkey = new PublicKey(wallet.publicKey);
      const mintPubkey = new PublicKey(tokenMint);

      const associatedTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        walletPubkey
      );

      // Check if account exists
      const accountInfo = await this.connection.getAccountInfo(associatedTokenAccount);

      if (accountInfo) {
        logger.debug('Token account already exists');
        return null; // Account exists
      }

      // Create transaction
      const transaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          walletPubkey, // payer
          associatedTokenAccount, // associated token account
          walletPubkey, // owner
          mintPubkey // mint
        )
      );

      // Add compute budget
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 })
      );

      logger.info('Token account creation transaction built');
      return transaction;

    } catch (error) {
      logger.error('Error building create token account tx:', error);
      throw error;
    }
  }

  /**
   * Build transaction with Jito bundle for MEV protection
   */
  async buildJitoBundle(transactions, tipLamports = 10000) {
    try {
      // Add tip instruction to first transaction
      const tipInstruction = SystemProgram.transfer({
        fromPubkey: transactions[0].feePayer,
        toPubkey: new PublicKey('Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY'), // Jito tip account
        lamports: tipLamports
      });

      transactions[0].add(tipInstruction);

      logger.info(`Jito bundle built with ${transactions.length} transactions, tip: ${tipLamports} lamports`);

      return {
        bundle: transactions,
        tipLamports
      };

    } catch (error) {
      logger.error('Error building Jito bundle:', error);
      throw error;
    }
  }

  /**
   * Estimate transaction fee
   */
  async estimateFee(transaction) {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      const fee = await this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      );

      return fee.value || 5000; // Default 5000 lamports

    } catch (error) {
      logger.error('Error estimating fee:', error);
      return 5000; // Default fallback
    }
  }

  /**
   * Optimize transaction with dynamic compute units
   */
  async optimizeTransaction(transaction, wallet) {
    try {
      // Simulate transaction to get compute units used
      const simulation = await this.connection.simulateTransaction(
        transaction,
        [wallet.keypair]
      );

      if (simulation.value.err) {
        logger.warn('Transaction simulation failed:', simulation.value.err);
        return transaction;
      }

      const computeUnits = simulation.value.unitsConsumed;

      if (computeUnits) {
        // Add 20% buffer to computed units
        const optimalUnits = Math.ceil(computeUnits * 1.2);

        // Replace or add compute unit limit instruction
        transaction.instructions.unshift(
          ComputeBudgetProgram.setComputeUnitLimit({ units: optimalUnits })
        );

        logger.debug(`Transaction optimized: ${computeUnits} units -> ${optimalUnits} limit`);
      }

      return transaction;

    } catch (error) {
      logger.error('Error optimizing transaction:', error);
      return transaction;
    }
  }

  /**
   * Add priority fee to transaction
   */
  addPriorityFee(transaction, microLamports = 10000) {
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
    );
    return transaction;
  }

  /**
   * Build multi-transaction sequence (for complex operations)
   */
  async buildTransactionSequence(wallet, operations) {
    const transactions = [];

    for (const op of operations) {
      let tx;

      switch (op.type) {
        case 'createTokenAccount':
          tx = await this.buildCreateTokenAccountTx(wallet, op.tokenMint);
          break;

        case 'swap':
          tx = (await this.buildSwapTransaction(wallet, op.params)).transaction;
          break;

        case 'transfer':
          // Build transfer transaction
          tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: new PublicKey(wallet.publicKey),
              toPubkey: new PublicKey(op.to),
              lamports: op.amount
            })
          );
          break;

        default:
          logger.warn(`Unknown operation type: ${op.type}`);
          continue;
      }

      if (tx) {
        transactions.push(tx);
      }
    }

    logger.info(`Built sequence of ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Build versioned transaction (v0) with recent blockhash
   * @param {Array} instructions - Transaction instructions
   * @param {PublicKey} payer - Payer public key
   * @param {Array} addressLookupTableAccounts - Optional address lookup tables
   * @returns {Promise<VersionedTransaction>} Versioned transaction
   */
  async buildVersionedTransaction(instructions, payer, addressLookupTableAccounts = []) {
    try {
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
      
      // Create v0 message
      const messageV0 = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions: instructions
      }).compileToV0Message(addressLookupTableAccounts);
      
      // Create versioned transaction
      const transaction = new VersionedTransaction(messageV0);
      
      logger.debug('Versioned transaction created', {
        blockhash: blockhash.slice(0, 8) + '...',
        lastValidBlockHeight,
        numInstructions: instructions.length
      });
      
      return transaction;
      
    } catch (error) {
      logger.error('Error building versioned transaction:', error);
      throw error;
    }
  }

  /**
   * Simulate versioned transaction before sending
   * @param {VersionedTransaction} transaction - Transaction to simulate
   * @returns {Promise<Object>} Simulation result
   */
  async simulateVersionedTransaction(transaction) {
    try {
      const simulation = await this.connection.simulateTransaction(transaction, {
        sigVerify: false,
        replaceRecentBlockhash: true
      });
      
      if (simulation.value.err) {
        logger.error('Transaction simulation failed:', simulation.value.err);
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      
      logger.debug('Simulation successful', {
        computeUnitsConsumed: simulation.value.unitsConsumed,
        logs: simulation.value.logs?.slice(0, 3)
      });
      
      return simulation.value;
      
    } catch (error) {
      logger.error('Error simulating transaction:', error);
      throw error;
    }
  }

  /**
   * Get priority fees dynamically from Helius
   * @returns {Promise<number>} Priority fee in micro-lamports
   */
  async getDynamicPriorityFee() {
    try {
      // Try to get priority fees from Helius API
      const rpcUrl = this.connection.rpcEndpoint;
      
      if (rpcUrl.includes('helius')) {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getRecentPrioritizationFees',
            params: []
          })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.length > 0) {
          // Get 75th percentile fee
          const fees = data.result.map(f => f.prioritizationFee).sort((a, b) => a - b);
          const p75Index = Math.floor(fees.length * 0.75);
          const recommendedFee = fees[p75Index] || 50000;
          
          logger.debug(`Dynamic priority fee: ${recommendedFee} micro-lamports`);
          return recommendedFee;
        }
      }
      
      // Fallback to default
      return 50000; // 50k micro-lamports default
      
    } catch (error) {
      logger.debug('Error getting dynamic priority fee:', error.message);
      return 50000; // Fallback
    }
  }

  /**
   * Add compute budget instructions to transaction
   * @param {Transaction|Array} transactionOrInstructions - Transaction or instruction array
   * @param {number} priorityFeeMicroLamports - Priority fee
   * @param {number} computeUnitLimit - Compute unit limit
   * @returns {Transaction|Array} Modified transaction or instructions
   */
  addComputeBudget(transactionOrInstructions, priorityFeeMicroLamports, computeUnitLimit = 200000) {
    const budgetInstructions = [
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFeeMicroLamports
      }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit
      })
    ];
    
    if (Array.isArray(transactionOrInstructions)) {
      // It's an instruction array
      return [...budgetInstructions, ...transactionOrInstructions];
    } else {
      // It's a Transaction object
      budgetInstructions.forEach(ix => {
        transactionOrInstructions.add(ix);
      });
      return transactionOrInstructions;
    }
  }

  /**
   * Get recent blockhash with retry logic
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<Object>} Blockhash info
   */
  async getRecentBlockhash(maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const blockhashInfo = await this.connection.getLatestBlockhash('finalized');
        return blockhashInfo;
      } catch (error) {
        lastError = error;
        logger.warn(`Failed to get blockhash (attempt ${i + 1}/${maxRetries}):`, error.message);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        }
      }
    }
    
    throw new Error(`Failed to get recent blockhash after ${maxRetries} attempts: ${lastError.message}`);
  }
}
