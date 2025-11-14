/**
 * Throttled Connection Wrapper
 * 
 * Wraps Solana Connection to throttle ALL RPC calls automatically
 * Prevents rate limiting by queuing requests
 */

import { Connection } from '@solana/web3.js';
import RequestQueue from './requestQueue.js';
import { logger } from './logger.js';

class ThrottledConnection extends Connection {
  constructor(endpoint, commitmentOrConfig) {
    super(endpoint, commitmentOrConfig);

    // Read throttling config from environment (optimized for Helius Developer 50 RPS)
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5;
    const delayMs = parseInt(process.env.REQUEST_DELAY_MS) || 20;

    // Create request queue with environment-based settings
    this.requestQueue = new RequestQueue(maxConcurrent, delayMs);

    // Track stats
    this.stats = {
      totalRequests: 0,
      queuedRequests: 0,
      completedRequests: 0
    };

    // Log stats every 2 minutes
    setInterval(() => {
      const queueStats = this.requestQueue.getStats();
      if (queueStats.total > 0) {
        logger.info(`🔌 RPC Stats: ${queueStats.completed} completed | ${queueStats.queued} queued | ${queueStats.active} active | ${queueStats.failed} failed`);
      }
    }, 120000);

    logger.info(`🔒 Throttled Connection initialized (max ${maxConcurrent} concurrent, ${delayMs}ms delay)`);
  }

  /**
   * Wrap any RPC method to use the queue
   */
  _throttle(methodName, args) {
    return this.requestQueue.add(() => {
      return super[methodName](...args);
    });
  }

  // Override common RPC methods to use throttling
  getAccountInfo(...args) {
    return this._throttle('getAccountInfo', args);
  }

  getParsedAccountInfo(...args) {
    return this._throttle('getParsedAccountInfo', args);
  }

  getBalance(...args) {
    return this._throttle('getBalance', args);
  }

  getTransaction(...args) {
    return this._throttle('getTransaction', args);
  }

  getParsedTransaction(...args) {
    return this._throttle('getParsedTransaction', args);
  }

  getSignaturesForAddress(...args) {
    return this._throttle('getSignaturesForAddress', args);
  }

  getParsedProgramAccounts(...args) {
    return this._throttle('getParsedProgramAccounts', args);
  }

  getLatestBlockhash(...args) {
    return this._throttle('getLatestBlockhash', args);
  }

  getRecentPrioritizationFees(...args) {
    return this._throttle('getRecentPrioritizationFees', args);
  }

  getRecentPerformanceSamples(...args) {
    return this._throttle('getRecentPerformanceSamples', args);
  }

  getFeeForMessage(...args) {
    return this._throttle('getFeeForMessage', args);
  }

  getTokenAccountBalance(...args) {
    return this._throttle('getTokenAccountBalance', args);
  }

  getMultipleAccountsInfo(...args) {
    return this._throttle('getMultipleAccountsInfo', args);
  }

  getProgramAccounts(...args) {
    return this._throttle('getProgramAccounts', args);
  }

  getSlot(...args) {
    return this._throttle('getSlot', args);
  }

  getBlockHeight(...args) {
    return this._throttle('getBlockHeight', args);
  }

  getVersion(...args) {
    return this._throttle('getVersion', args);
  }

  getMinimumBalanceForRentExemption(...args) {
    return this._throttle('getMinimumBalanceForRentExemption', args);
  }

  sendTransaction(...args) {
    return this._throttle('sendTransaction', args);
  }

  simulateTransaction(...args) {
    return this._throttle('simulateTransaction', args);
  }

  getConfirmedTransaction(...args) {
    return this._throttle('getConfirmedTransaction', args);
  }

  // onLogs is event-based, don't throttle the subscription itself
  // but the callbacks will use throttled methods
}

export default ThrottledConnection;

