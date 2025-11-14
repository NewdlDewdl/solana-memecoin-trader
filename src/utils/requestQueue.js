/**
 * Request Queue
 * 
 * Throttles RPC requests to avoid rate limiting
 */

import { logger } from './logger.js';

class RequestQueue {
  constructor(maxConcurrent = 5, delayMs = 100) {
    this.maxConcurrent = maxConcurrent;
    this.delayMs = delayMs;
    this.queue = [];
    this.activeRequests = 0;
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      queued: 0
    };
  }

  /**
   * Add request to queue
   */
  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.stats.queued++;
      this.stats.total++;
      this.processQueue();
    });
  }

  /**
   * Process queued requests with throttling
   */
  async processQueue() {
    if (this.activeRequests >= this.maxConcurrent) {
      return; // Already at max concurrent requests
    }

    const item = this.queue.shift();
    if (!item) {
      return; // Queue is empty
    }

    this.activeRequests++;
    this.stats.queued--;

    try {
      // Add delay between requests
      if (this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }

      const result = await item.fn();
      item.resolve(result);
      this.stats.completed++;
    } catch (error) {
      item.reject(error);
      this.stats.failed++;
    } finally {
      this.activeRequests--;
      
      // Process next item in queue
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Get queue stats
   */
  getStats() {
    return {
      ...this.stats,
      active: this.activeRequests,
      queued: this.queue.length
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    this.stats.queued = 0;
  }
}

export default RequestQueue;

