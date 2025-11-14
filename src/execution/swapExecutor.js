import { 
  Connection, 
  PublicKey, 
  Transaction, 
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import bs58 from 'bs58';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Swap Executor
 * Handles real swap execution with dual DEX support (Jupiter + Raydium)
 */
export class SwapExecutor {
  constructor(connection, wallet, config = {}) {
    this.connection = connection;
    this.wallet = wallet;
    this.config = {
      jupiterEnabled: config.jupiterEnabled !== false,
      raydiumEnabled: config.raydiumEnabled !== false,
      preferredDex: config.preferredDex || 'jupiter',
      slippageBps: config.slippageBps || 100, // 1% default
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      priorityFeeMicroLamports: config.priorityFeeMicroLamports || 50000,
      computeUnitLimit: config.computeUnitLimit || 200000
    };
    
    // Stats tracking
    this.stats = {
      jupiterSwaps: 0,
      raydiumSwaps: 0,
      successfulSwaps: 0,
      failedSwaps: 0,
      totalSlippage: 0,
      totalFees: 0
    };
    
    logger.info('🔄 Swap Executor initialized');
    logger.info(`   Jupiter: ${this.config.jupiterEnabled ? '✅' : '❌'}`);
    logger.info(`   Raydium: ${this.config.raydiumEnabled ? '✅' : '❌'}`);
    logger.info(`   Preferred: ${this.config.preferredDex}`);
    logger.info(`   Slippage: ${this.config.slippageBps / 100}%`);
  }

  /**
   * Execute best swap (automatically chooses best DEX)
   * @param {string} inputMint - Input token mint address
   * @param {string} outputMint - Output token mint address
   * @param {number} amount - Amount in smallest unit
   * @param {string} side - 'buy' or 'sell'
   * @returns {Promise<Object>} Swap result with signature
   */
  async executeBestSwap(inputMint, outputMint, amount, side = 'buy') {
    try {
      logger.info(`🔄 Executing ${side.toUpperCase()}: ${amount} units of ${inputMint.slice(0, 8)}... → ${outputMint.slice(0, 8)}...`);
      
      // Get quotes from enabled DEXs
      const quotes = [];
      
      if (this.config.jupiterEnabled) {
        try {
          const jupiterQuote = await this.getJupiterQuote(inputMint, outputMint, amount);
          if (jupiterQuote) {
            quotes.push({
              dex: 'jupiter',
              ...jupiterQuote
            });
          }
        } catch (error) {
          logger.debug('Jupiter quote failed:', error.message);
        }
      }
      
      if (this.config.raydiumEnabled) {
        try {
          const raydiumQuote = await this.getRaydiumQuote(inputMint, outputMint, amount);
          if (raydiumQuote) {
            quotes.push({
              dex: 'raydium',
              ...raydiumQuote
            });
          }
        } catch (error) {
          logger.debug('Raydium quote failed:', error.message);
        }
      }
      
      if (quotes.length === 0) {
        throw new Error('No quotes available from any DEX');
      }
      
      // Choose best quote (highest output amount)
      const bestQuote = quotes.sort((a, b) => 
        parseInt(b.outAmount) - parseInt(a.outAmount)
      )[0];
      
      logger.info(`   Best route: ${bestQuote.dex.toUpperCase()} (${bestQuote.outAmount} units out)`);
      
      // Execute swap with best DEX
      if (bestQuote.dex === 'jupiter') {
        return await this.executeJupiterSwap(inputMint, outputMint, amount, bestQuote);
      } else {
        return await this.executeRaydiumSwap(inputMint, outputMint, amount, bestQuote);
      }
      
    } catch (error) {
      logger.error('Swap execution failed:', error);
      this.stats.failedSwaps++;
      throw error;
    }
  }

  /**
   * Get quote from Jupiter
   */
  async getJupiterQuote(inputMint, outputMint, amount) {
    try {
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${this.config.slippageBps}`;
      
      const response = await axios.get(quoteUrl, {
        timeout: 5000
      });
      
      if (response.data) {
        return {
          inAmount: response.data.inAmount,
          outAmount: response.data.outAmount,
          priceImpactPct: response.data.priceImpactPct,
          routePlan: response.data.routePlan,
          otherAmountThreshold: response.data.otherAmountThreshold,
          swapMode: response.data.swapMode,
          slippageBps: this.config.slippageBps
        };
      }
      
      return null;
      
    } catch (error) {
      logger.debug('Jupiter quote error:', error.message);
      return null;
    }
  }

  /**
   * Get quote from Raydium
   * Note: This is a placeholder - full Raydium SDK integration would go here
   */
  async getRaydiumQuote(inputMint, outputMint, amount) {
    // For now, Raydium quotes are not implemented
    // Would require loading pool keys, calculating CPMM math, etc.
    logger.debug('Raydium quotes not yet implemented');
    return null;
  }

  /**
   * Execute swap via Jupiter
   */
  async executeJupiterSwap(inputMint, outputMint, amount, quote) {
    let retries = 0;
    let lastError;
    
    while (retries <= this.config.maxRetries) {
      try {
        if (retries > 0) {
          logger.info(`   Retry ${retries}/${this.config.maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
        
        // Step 1: Get swap transaction from Jupiter API
        logger.debug('   Building Jupiter swap transaction...');
        
        const swapResponse = await axios.post(
          'https://quote-api.jup.ag/v6/swap',
          {
            quoteResponse: quote,
            userPublicKey: this.wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: this.config.priorityFeeMicroLamports
          },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        if (!swapResponse.data || !swapResponse.data.swapTransaction) {
          throw new Error('Invalid swap response from Jupiter');
        }
        
        // Step 2: Deserialize and sign transaction
        const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        
        logger.debug('   Signing transaction...');
        transaction.sign([this.wallet]);
        
        // Step 3: Simulate transaction first
        logger.debug('   Simulating transaction...');
        const simulation = await this.connection.simulateTransaction(transaction);
        
        if (simulation.value.err) {
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        
        logger.debug('   Simulation successful');
        
        // Step 4: Send transaction
        logger.debug('   Sending transaction...');
        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: true,
            maxRetries: 0
          }
        );
        
        logger.info(`   Transaction sent: ${signature}`);
        
        // Step 5: Confirm transaction
        logger.debug('   Confirming transaction...');
        const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        // Success!
        this.stats.jupiterSwaps++;
        this.stats.successfulSwaps++;
        
        const result = {
          success: true,
          signature,
          dex: 'jupiter',
          inputMint,
          outputMint,
          amountIn: quote.inAmount,
          amountOut: quote.outAmount,
          priceImpact: quote.priceImpactPct,
          slippage: this.config.slippageBps / 10000,
          timestamp: Date.now()
        };
        
        logger.info(`✅ Swap successful! Signature: ${signature}`);
        logger.info(`   View on Solscan: https://solscan.io/tx/${signature}`);
        
        return result;
        
      } catch (error) {
        lastError = error;
        logger.warn(`   Swap attempt ${retries + 1} failed: ${error.message}`);
        retries++;
      }
    }
    
    // All retries exhausted
    this.stats.failedSwaps++;
    throw new Error(`Jupiter swap failed after ${this.config.maxRetries} retries: ${lastError.message}`);
  }

  /**
   * Execute swap via Raydium
   * Note: This is a placeholder - full Raydium SDK integration would go here
   */
  async executeRaydiumSwap(inputMint, outputMint, amount, quote) {
    logger.warn('Raydium swaps not yet implemented');
    throw new Error('Raydium swap execution not implemented');
  }

  /**
   * Create token account if it doesn't exist
   */
  async ensureTokenAccount(mint) {
    try {
      const mintPubkey = new PublicKey(mint);
      const ata = await getAssociatedTokenAddress(
        mintPubkey,
        this.wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      // Check if account exists
      const accountInfo = await this.connection.getAccountInfo(ata);
      
      if (!accountInfo) {
        logger.info(`   Creating token account for ${mint.slice(0, 8)}...`);
        
        // Create instruction
        const instruction = createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          ata,
          this.wallet.publicKey,
          mintPubkey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        // Build and send transaction
        const transaction = new Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(
          transaction,
          [this.wallet],
          { skipPreflight: false }
        );
        
        await this.connection.confirmTransaction(signature);
        logger.info(`   Token account created: ${ata.toString()}`);
      }
      
      return ata;
      
    } catch (error) {
      logger.error('Error ensuring token account:', error);
      throw error;
    }
  }

  /**
   * Get swap statistics
   */
  getStats() {
    const totalSwaps = this.stats.successfulSwaps + this.stats.failedSwaps;
    const successRate = totalSwaps > 0 
      ? (this.stats.successfulSwaps / totalSwaps * 100).toFixed(1) 
      : '0.0';
    
    return {
      ...this.stats,
      totalSwaps,
      successRate: successRate + '%',
      avgSlippage: this.stats.successfulSwaps > 0 
        ? (this.stats.totalSlippage / this.stats.successfulSwaps).toFixed(4) 
        : '0.0000'
    };
  }

  /**
   * Log statistics
   */
  logStats() {
    const stats = this.getStats();
    logger.info('📊 Swap Executor Stats:', {
      totalSwaps: stats.totalSwaps,
      successful: stats.successfulSwaps,
      failed: stats.failedSwaps,
      successRate: stats.successRate,
      jupiterSwaps: stats.jupiterSwaps,
      raydiumSwaps: stats.raydiumSwaps,
      avgSlippage: stats.avgSlippage
    });
  }
}

export default SwapExecutor;

