import { ComputeBudgetProgram } from '@solana/web3.js';
import { logger } from '../utils/logger.js';

/**
 * Gas Optimization Module
 * Dynamically calculates and optimizes transaction fees and compute units
 */

export class GasOptimizer {
  constructor(connection, config) {
    this.connection = connection;
    this.config = config;
    this.feeHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Get current network priority fees
   */
  async getCurrentPriorityFee() {
    try {
      // Get recent prioritization fees
      const recentFees = await this.connection.getRecentPrioritizationFees();

      if (!recentFees || recentFees.length === 0) {
        return this.config.execution?.defaultPriorityFee || 10000;
      }

      // Calculate percentiles
      const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);

      const p50 = fees[Math.floor(fees.length * 0.5)];
      const p75 = fees[Math.floor(fees.length * 0.75)];
      const p90 = fees[Math.floor(fees.length * 0.9)];

      logger.debug(`Priority fees - P50: ${p50}, P75: ${p75}, P90: ${p90}`);

      // Return 75th percentile for reliable inclusion
      return p75 || 10000;

    } catch (error) {
      logger.error('Error getting priority fees:', error);
      return this.config.execution?.defaultPriorityFee || 10000;
    }
  }

  /**
   * Calculate dynamic priority fee based on urgency
   */
  async calculateDynamicFee(urgency = 'medium') {
    const baseFee = await this.getCurrentPriorityFee();
    const maxFee = this.config.execution?.maxPriorityFeeLamports || 100000;

    let multiplier;
    switch (urgency) {
      case 'low':
        multiplier = 0.8;
        break;
      case 'medium':
        multiplier = 1.0;
        break;
      case 'high':
        multiplier = 1.5;
        break;
      case 'critical':
        multiplier = 2.0;
        break;
      default:
        multiplier = 1.0;
    }

    const fee = Math.min(Math.floor(baseFee * multiplier), maxFee);

    logger.debug(`Dynamic fee calculated: ${fee} (urgency: ${urgency})`);

    return fee;
  }

  /**
   * Optimize compute units for transaction
   */
  async optimizeComputeUnits(transaction, signers) {
    try {
      // Simulate transaction to get actual compute units
      const simulation = await this.connection.simulateTransaction(
        transaction,
        signers
      );

      if (simulation.value.err) {
        logger.warn('Simulation failed:', simulation.value.err);
        return {
          units: 200000, // Default fallback
          estimated: false
        };
      }

      const unitsConsumed = simulation.value.unitsConsumed || 100000;

      // Add 20% buffer for safety
      const optimalUnits = Math.ceil(unitsConsumed * 1.2);

      // Cap at max compute units (1.4M)
      const cappedUnits = Math.min(optimalUnits, 1400000);

      logger.debug(`Compute units optimized: ${unitsConsumed} consumed -> ${cappedUnits} limit`);

      return {
        units: cappedUnits,
        consumed: unitsConsumed,
        estimated: true
      };

    } catch (error) {
      logger.error('Error optimizing compute units:', error);
      return {
        units: 200000,
        estimated: false,
        error: error.message
      };
    }
  }

  /**
   * Add optimized compute budget instructions
   */
  addOptimizedComputeBudget(transaction, computeUnits, priorityFee) {
    // Remove existing compute budget instructions
    transaction.instructions = transaction.instructions.filter(ix => {
      const programId = ix.programId.toBase58();
      return programId !== ComputeBudgetProgram.programId.toBase58();
    });

    // Add optimized instructions at the beginning
    transaction.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
    );

    return transaction;
  }

  /**
   * Estimate total transaction cost
   */
  async estimateTotalCost(transaction, priorityFee, computeUnits) {
    try {
      // Base transaction fee (5000 lamports per signature)
      const baseFee = 5000 * (transaction.signatures.length || 1);

      // Priority fee cost
      const priorityCost = Math.floor((priorityFee * computeUnits) / 1000000);

      const totalCost = baseFee + priorityCost;

      logger.debug(`Transaction cost estimate: ${totalCost} lamports (base: ${baseFee}, priority: ${priorityCost})`);

      return {
        totalCost,
        baseFee,
        priorityCost,
        costInSol: totalCost / 1e9
      };

    } catch (error) {
      logger.error('Error estimating cost:', error);
      return {
        totalCost: 10000,
        estimated: false
      };
    }
  }

  /**
   * Track fee history for analytics
   */
  trackFee(fee, success, slot) {
    this.feeHistory.push({
      fee,
      success,
      slot,
      timestamp: Date.now()
    });

    // Trim history
    if (this.feeHistory.length > this.maxHistorySize) {
      this.feeHistory.shift();
    }
  }

  /**
   * Get fee statistics from history
   */
  getFeeStats() {
    if (this.feeHistory.length === 0) {
      return {
        averageFee: 0,
        successRate: 0,
        sampleSize: 0
      };
    }

    const successfulTxs = this.feeHistory.filter(f => f.success);
    const totalFees = this.feeHistory.reduce((sum, f) => sum + f.fee, 0);

    return {
      averageFee: totalFees / this.feeHistory.length,
      successRate: successfulTxs.length / this.feeHistory.length,
      sampleSize: this.feeHistory.length,
      averageSuccessfulFee: successfulTxs.length > 0
        ? successfulTxs.reduce((sum, f) => sum + f.fee, 0) / successfulTxs.length
        : 0
    };
  }

  /**
   * Recommend fee based on success rate
   */
  async recommendFee(targetSuccessRate = 0.9) {
    const stats = this.getFeeStats();

    if (stats.sampleSize < 10) {
      // Not enough data, use dynamic calculation
      return await this.calculateDynamicFee('medium');
    }

    if (stats.successRate < targetSuccessRate) {
      // Increase fee to improve success rate
      const increaseFactor = 1 + (targetSuccessRate - stats.successRate);
      return Math.floor(stats.averageFee * increaseFactor);
    }

    // Current fees are working well
    return Math.floor(stats.averageSuccessfulFee);
  }

  /**
   * Check if network is congested
   */
  async isNetworkCongested() {
    try {
      const recentPerf = await this.connection.getRecentPerformanceSamples(10);

      if (!recentPerf || recentPerf.length === 0) {
        return false;
      }

      // Calculate average TPS
      const avgTps = recentPerf.reduce((sum, s) => sum + s.numTransactions, 0) /
                     recentPerf.reduce((sum, s) => sum + s.samplePeriodSecs, 0);

      // Solana can handle ~2000-3000 TPS typically
      const congestionThreshold = 2500;

      const isCongested = avgTps > congestionThreshold;

      logger.debug(`Network TPS: ${avgTps.toFixed(0)}, Congested: ${isCongested}`);

      return isCongested;

    } catch (error) {
      logger.error('Error checking network congestion:', error);
      return false;
    }
  }

  /**
   * Adjust fees based on network conditions
   */
  async adjustForNetworkConditions(baseFee) {
    const isCongested = await this.isNetworkCongested();

    if (isCongested) {
      // Increase fee by 50% during congestion
      const adjustedFee = Math.floor(baseFee * 1.5);
      logger.info(`Network congested - increasing fee to ${adjustedFee}`);
      return adjustedFee;
    }

    return baseFee;
  }

  /**
   * Full optimization pipeline
   */
  async optimizeTransaction(transaction, wallet, options = {}) {
    const {
      urgency = 'medium',
      adjustForNetwork = true
    } = options;

    try {
      // 1. Calculate priority fee
      let priorityFee = await this.calculateDynamicFee(urgency);

      // 2. Adjust for network conditions
      if (adjustForNetwork) {
        priorityFee = await this.adjustForNetworkConditions(priorityFee);
      }

      // 3. Optimize compute units
      const computeResult = await this.optimizeComputeUnits(
        transaction,
        [wallet.keypair]
      );

      // 4. Add optimized instructions
      this.addOptimizedComputeBudget(
        transaction,
        computeResult.units,
        priorityFee
      );

      // 5. Estimate total cost
      const costEstimate = await this.estimateTotalCost(
        transaction,
        priorityFee,
        computeResult.units
      );

      logger.info(`Transaction optimized - Fee: ${priorityFee}, Units: ${computeResult.units}, Cost: ${costEstimate.totalCost} lamports`);

      return {
        transaction,
        priorityFee,
        computeUnits: computeResult.units,
        estimatedCost: costEstimate,
        optimized: true
      };

    } catch (error) {
      logger.error('Error in optimization pipeline:', error);

      // Fallback to defaults
      this.addOptimizedComputeBudget(transaction, 200000, 10000);

      return {
        transaction,
        priorityFee: 10000,
        computeUnits: 200000,
        optimized: false,
        error: error.message
      };
    }
  }
}
