import { logger } from '../utils/logger.js';

/**
 * Entry Strategy Module
 * Determines when and how to enter positions based on analysis
 */

export class EntryStrategy {
  constructor(config) {
    this.config = config;
    this.pendingEntries = new Map();
  }

  /**
   * Evaluate if token meets entry criteria
   */
  async evaluateEntry(tokenInfo, analysis) {
    logger.info(`Evaluating entry for ${tokenInfo.tokenSymbol || tokenInfo.tokenMint}`);

    const {
      rugAnalysis,
      holderAnalysis,
      socialAnalysis,
      liquidityAnalysis
    } = analysis;

    const criteria = [];
    let score = 0;
    const maxScore = 100;

    // 1. Safety check (40 points)
    const safetyScore = rugAnalysis?.safetyScore || 0;
    const safetyPoints = (safetyScore / 100) * 40;
    score += safetyPoints;
    
    const minSafetyThreshold = this.config.entry?.minSafetyScore || 40;
    const safetyPassed = safetyScore >= minSafetyThreshold;
    logger.info(`🔍 Safety check: score=${safetyScore}, threshold=${minSafetyThreshold}, passed=${safetyPassed}`);

    criteria.push({
      name: 'Safety Score',
      value: safetyScore,
      points: safetyPoints,
      weight: 40,
      passed: safetyPassed
    });

    // 2. Holder distribution (20 points)
    const holderHealth = holderAnalysis?.healthScore || 0;
    const holderPoints = (holderHealth / 100) * 20;
    score += holderPoints;

    const minHolderHealth = this.config.entry?.minHolderHealth || 60;
    const holderPassed = holderHealth >= minHolderHealth;
    logger.info(`🔍 Holder health check: score=${holderHealth}, threshold=${minHolderHealth}, passed=${holderPassed}`);

    criteria.push({
      name: 'Holder Distribution',
      value: holderHealth,
      points: holderPoints,
      weight: 20,
      passed: holderPassed
    });

    // 3. Liquidity (20 points)
    const liquiditySol = liquidityAnalysis?.liquiditySol || 0;
    const minLiquidity = this.config.entry?.minLiquidity || 5;
    const liquidityPassed = liquiditySol >= minLiquidity;
    const liquidityPoints = liquidityPassed ? 20 : 0;
    score += liquidityPoints;

    criteria.push({
      name: 'Liquidity',
      value: liquiditySol,
      points: liquidityPoints,
      weight: 20,
      passed: liquidityPassed
    });

    // 4. Social sentiment (20 points)
    const socialScore = socialAnalysis?.overallScore || 50;
    const socialPoints = (socialScore / 100) * 20;
    score += socialPoints;

    criteria.push({
      name: 'Social Sentiment',
      value: socialScore,
      points: socialPoints,
      weight: 20,
      passed: socialScore >= 50
    });

    // Determine if entry should be taken (lowered to 50 for paper trading practice)
    const minScore = this.config.entry?.minEntryScore || 50;
    const shouldEnter = score >= minScore;

    // Check for critical failures (safety score and holder health are critical)
    const criticalFailures = criteria.filter(c =>
      (c.name === 'Safety Score' || c.name === 'Holder Distribution') && !c.passed
    );

    const result = {
      shouldEnter: shouldEnter && criticalFailures.length === 0,
      score,
      maxScore,
      criteria,
      criticalFailures,
      recommendation: this.getRecommendation(score, criticalFailures.length > 0),
      timestamp: Date.now()
    };

    logger.info(`Entry evaluation: ${result.recommendation} (score: ${score}/${maxScore}) | shouldEnter: ${shouldEnter} | criticalFailures: ${criticalFailures.length} | final: ${result.shouldEnter}`);
    if (criticalFailures.length > 0) {
      logger.warn(`⚠️ Critical failures detected: ${criticalFailures.map(c => `${c.name}=${c.value}`).join(', ')}`);
    }

    return result;
  }

  /**
   * Get entry recommendation
   */
  getRecommendation(score, hasCriticalFailures) {
    if (hasCriticalFailures) return 'REJECT';
    if (score >= 80) return 'STRONG_BUY';
    if (score >= 60) return 'BUY';
    if (score >= 40) return 'MARGINAL';
    return 'REJECT';
  }

  /**
   * Calculate optimal entry price and timing
   */
  async calculateOptimalEntry(tokenMint, currentPrice, priceHistory = []) {
    // Simple strategy: enter at current market price
    // More advanced: wait for pullback, support levels, etc.

    const strategy = this.config.entry?.strategy || 'market';

    switch (strategy) {
      case 'market':
        return {
          strategy: 'MARKET',
          price: currentPrice,
          timing: 'IMMEDIATE',
          slippageTolerance: this.config.entry?.slippageBps || 300
        };

      case 'limit':
        // Place limit order slightly below current price
        const limitPrice = currentPrice * 0.98; // 2% below
        return {
          strategy: 'LIMIT',
          price: limitPrice,
          timing: 'WAIT',
          timeout: 300000 // 5 minutes
        };

      case 'dca':
        // Dollar-cost averaging over time
        return this.calculateDCAEntry(currentPrice);

      default:
        return {
          strategy: 'MARKET',
          price: currentPrice,
          timing: 'IMMEDIATE'
        };
    }
  }

  /**
   * Calculate DCA entry strategy
   */
  calculateDCAEntry(currentPrice) {
    const dcaConfig = this.config.entry?.dca || {};
    const intervals = dcaConfig.intervals || 3;
    const totalAmount = dcaConfig.totalAmount || 0.3;
    const intervalTime = dcaConfig.intervalTimeMs || 60000; // 1 minute

    const amountPerInterval = totalAmount / intervals;

    const entries = [];
    for (let i = 0; i < intervals; i++) {
      entries.push({
        amount: amountPerInterval,
        delay: i * intervalTime,
        maxPrice: currentPrice * 1.05 // Don't buy if price rises >5%
      });
    }

    return {
      strategy: 'DCA',
      entries,
      totalAmount,
      timing: 'SCHEDULED'
    };
  }

  /**
   * Check for entry signals based on price action
   */
  checkPriceActionSignals(priceHistory) {
    if (!priceHistory || priceHistory.length < 10) {
      return {
        hasSignal: false,
        reason: 'Insufficient price history'
      };
    }

    // Simple momentum check
    const recentPrices = priceHistory.slice(-5);
    const olderPrices = priceHistory.slice(-10, -5);

    const recentAvg = recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;
    const olderAvg = olderPrices.reduce((sum, p) => sum + p, 0) / olderPrices.length;

    const momentum = (recentAvg - olderAvg) / olderAvg;

    // Bullish signal if positive momentum
    if (momentum > 0.05) { // 5% positive momentum
      return {
        hasSignal: true,
        signal: 'BULLISH_MOMENTUM',
        strength: momentum,
        confidence: 0.6
      };
    }

    // Bearish signal
    if (momentum < -0.05) {
      return {
        hasSignal: true,
        signal: 'BEARISH_MOMENTUM',
        strength: momentum,
        confidence: 0.6
      };
    }

    return {
      hasSignal: false,
      reason: 'No clear signal',
      momentum
    };
  }

  /**
   * Create entry plan
   */
  createEntryPlan(params) {
    const {
      tokenMint,
      tokenSymbol,
      evaluation,
      positionSize,
      entryMethod
    } = params;

    const plan = {
      id: this.generatePlanId(),
      tokenMint,
      tokenSymbol,
      evaluation,
      positionSize,
      entryMethod: entryMethod || this.calculateOptimalEntry(tokenMint, evaluation.currentPrice),
      status: 'PENDING',
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.config.entry?.planExpiryMs || 300000) // 5 min
    };

    this.pendingEntries.set(plan.id, plan);

    logger.info(`Entry plan created: ${tokenSymbol} | Size: ${positionSize} SOL`);

    return plan;
  }

  /**
   * Execute entry plan
   */
  async executeEntryPlan(planId, executor) {
    const plan = this.pendingEntries.get(planId);

    if (!plan) {
      throw new Error(`Entry plan ${planId} not found`);
    }

    if (plan.status !== 'PENDING') {
      throw new Error(`Entry plan ${planId} is not pending (status: ${plan.status})`);
    }

    // Check if expired
    if (Date.now() > plan.expiresAt) {
      plan.status = 'EXPIRED';
      throw new Error(`Entry plan ${planId} has expired`);
    }

    try {
      plan.status = 'EXECUTING';

      logger.info(`Executing entry plan: ${plan.tokenSymbol}`);

      // Execute via order executor
      const result = await executor.executeBuy({
        tokenMint: plan.tokenMint,
        amount: plan.positionSize,
        slippageBps: plan.entryMethod.slippageTolerance || 300
      });

      plan.status = 'COMPLETED';
      plan.result = result;
      plan.completedAt = Date.now();

      logger.info(`✅ Entry plan executed: ${plan.tokenSymbol}`);

      return result;

    } catch (error) {
      plan.status = 'FAILED';
      plan.error = error.message;

      logger.error(`Entry plan failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel entry plan
   */
  cancelEntryPlan(planId) {
    const plan = this.pendingEntries.get(planId);

    if (!plan) {
      throw new Error(`Entry plan ${planId} not found`);
    }

    plan.status = 'CANCELLED';
    plan.cancelledAt = Date.now();

    logger.info(`Entry plan cancelled: ${plan.tokenSymbol}`);

    return plan;
  }

  /**
   * Clean up expired plans
   */
  cleanupExpiredPlans() {
    const now = Date.now();
    let cleaned = 0;

    for (const [planId, plan] of this.pendingEntries.entries()) {
      if (now > plan.expiresAt && plan.status === 'PENDING') {
        plan.status = 'EXPIRED';
        cleaned++;
      }

      // Remove old completed/failed plans
      if (plan.status !== 'PENDING' &&
          plan.completedAt &&
          now - plan.completedAt > 3600000) { // 1 hour
        this.pendingEntries.delete(planId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired/old entry plans`);
    }

    return cleaned;
  }

  /**
   * Get pending entry plans
   */
  getPendingPlans() {
    return Array.from(this.pendingEntries.values())
      .filter(p => p.status === 'PENDING');
  }

  /**
   * Generate plan ID
   */
  generatePlanId() {
    return `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
