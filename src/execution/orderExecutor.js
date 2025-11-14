import { Connection, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { logger } from '../utils/logger.js';

/**
 * Order Executor Module
 * Executes buy and sell orders with retry logic and error handling
 */

export class OrderExecutor {
  constructor(connection, config, transactionBuilder, gasOptimizer) {
    this.connection = connection;
    this.config = config;
    this.transactionBuilder = transactionBuilder;
    this.gasOptimizer = gasOptimizer;
    this.executionHistory = [];
  }

  /**
   * Execute buy order (SOL -> Token)
   */
  async executeBuy(params) {
    const {
      wallet,
      tokenMint,
      amount, // SOL amount
      slippageBps = 300,
      urgency = 'medium'
    } = params;

    logger.info(`🔵 Executing BUY: ${amount} SOL -> ${tokenMint}`);

    try {
      // 1. Build swap transaction
      const swapData = await this.transactionBuilder.buildBuyTransaction(
        wallet,
        tokenMint,
        amount,
        slippageBps
      );

      // 2. Optimize transaction
      const optimized = await this.gasOptimizer.optimizeTransaction(
        swapData.transaction,
        wallet,
        { urgency }
      );

      // 3. Sign and send transaction
      const result = await this.sendTransaction(
        optimized.transaction,
        wallet,
        { urgency }
      );

      // 4. Record execution
      const execution = {
        type: 'BUY',
        tokenMint,
        inputAmount: amount,
        outputAmount: swapData.estimatedOutput,
        signature: result.signature,
        slot: result.slot,
        success: true,
        timestamp: Date.now()
      };

      this.executionHistory.push(execution);

      logger.info(`✅ BUY executed: ${result.signature}`);

      return {
        success: true,
        signature: result.signature,
        tokenAmount: swapData.estimatedOutput,
        price: amount / swapData.estimatedOutput,
        slippage: swapData.priceImpact,
        ...result
      };

    } catch (error) {
      logger.error(`❌ BUY failed: ${error.message}`);

      this.executionHistory.push({
        type: 'BUY',
        tokenMint,
        inputAmount: amount,
        success: false,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  /**
   * Execute sell order (Token -> SOL)
   */
  async executeSell(params) {
    const {
      wallet,
      tokenMint,
      tokenAmount,
      slippageBps = 500, // Higher slippage for sells
      urgency = 'high'
    } = params;

    logger.info(`🔴 Executing SELL: ${tokenAmount} ${tokenMint} -> SOL`);

    try {
      // 1. Build swap transaction
      const swapData = await this.transactionBuilder.buildSellTransaction(
        wallet,
        tokenMint,
        tokenAmount,
        slippageBps
      );

      // 2. Optimize transaction
      const optimized = await this.gasOptimizer.optimizeTransaction(
        swapData.transaction,
        wallet,
        { urgency }
      );

      // 3. Sign and send transaction
      const result = await this.sendTransaction(
        optimized.transaction,
        wallet,
        { urgency }
      );

      // 4. Record execution
      const execution = {
        type: 'SELL',
        tokenMint,
        inputAmount: tokenAmount,
        outputAmount: swapData.estimatedOutput,
        signature: result.signature,
        slot: result.slot,
        success: true,
        timestamp: Date.now()
      };

      this.executionHistory.push(execution);

      const solReceived = swapData.estimatedOutput / 1e9;

      logger.info(`✅ SELL executed: ${solReceived} SOL received | ${result.signature}`);

      return {
        success: true,
        signature: result.signature,
        amountReceived: solReceived,
        price: solReceived / tokenAmount,
        slippage: swapData.priceImpact,
        ...result
      };

    } catch (error) {
      logger.error(`❌ SELL failed: ${error.message}`);

      this.executionHistory.push({
        type: 'SELL',
        tokenMint,
        inputAmount: tokenAmount,
        success: false,
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  }

  /**
   * Send transaction with retry logic
   */
  async sendTransaction(transaction, wallet, options = {}) {
    const {
      urgency = 'medium',
      maxRetries = 3,
      retryDelay = 2000
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Sending transaction (attempt ${attempt}/${maxRetries})`);

        // Get latest blockhash
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.keypair.publicKey;

        // Sign transaction
        transaction.sign(wallet.keypair);

        // Send transaction
        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            maxRetries: 0
          }
        );

        logger.debug(`Transaction sent: ${signature}`);

        // Confirm transaction
        const confirmation = await this.connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        const slot = confirmation.context.slot;

        logger.info(`✅ Transaction confirmed in slot ${slot}`);

        // Track fee for optimization
        this.gasOptimizer.trackFee(
          transaction.signatures.length * 5000,
          true,
          slot
        );

        return {
          signature,
          slot,
          confirmed: true
        };

      } catch (error) {
        lastError = error;
        logger.warn(`Transaction attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = retryDelay * Math.pow(2, attempt - 1);
          logger.debug(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    throw new Error(`Transaction failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Send transaction using Jito bundles for MEV protection
   */
  async sendJitoBundle(transactions, tipLamports = 10000) {
    try {
      logger.info('Sending Jito bundle for MEV protection...');

      const bundle = await this.transactionBuilder.buildJitoBundle(
        transactions,
        tipLamports
      );

      // Send to Jito block engine
      const jitoEndpoint = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

      const serializedTransactions = bundle.bundle.map(tx =>
        Buffer.from(tx.serialize()).toString('base64')
      );

      const response = await fetch(jitoEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serializedTransactions]
        })
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(`Jito bundle failed: ${result.error.message}`);
      }

      logger.info(`✅ Jito bundle sent: ${result.result}`);

      return result.result;

    } catch (error) {
      logger.error('Jito bundle failed, falling back to standard transaction');
      throw error;
    }
  }

  /**
   * Execute multiple orders in parallel
   */
  async executeParallel(orders, wallets) {
    logger.info(`Executing ${orders.length} orders in parallel`);

    const promises = orders.map((order, index) => {
      const wallet = wallets[index];

      if (order.type === 'BUY') {
        return this.executeBuy({ ...order, wallet });
      } else if (order.type === 'SELL') {
        return this.executeSell({ ...order, wallet });
      }

      return Promise.reject(new Error(`Unknown order type: ${order.type}`));
    });

    const results = await Promise.allSettled(promises);

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info(`Parallel execution complete: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Get execution statistics
   */
  getExecutionStats() {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => e.success).length;
    const failed = this.executionHistory.filter(e => !e.success).length;

    const buys = this.executionHistory.filter(e => e.type === 'BUY');
    const sells = this.executionHistory.filter(e => e.type === 'SELL');

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      totalBuys: buys.length,
      successfulBuys: buys.filter(b => b.success).length,
      totalSells: sells.length,
      successfulSells: sells.filter(s => s.success).length
    };
  }

  /**
   * Get recent execution history
   */
  getRecentExecutions(limit = 10) {
    return this.executionHistory
      .slice(-limit)
      .reverse();
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
