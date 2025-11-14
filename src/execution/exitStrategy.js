import { logger } from '../utils/logger.js';

/**
 * Exit Strategy Module
 * Determines when and how to exit positions for optimal profit/loss management
 */

export class ExitStrategy {
  constructor(config) {
    this.config = config;
    this.exitSignals = new Map();
  }

  /**
   * Evaluate exit conditions for a position
   */
  evaluateExit(position, currentPrice, analysis = {}) {
    logger.debug(`Evaluating exit for ${position.tokenSymbol}`);

    const signals = [];

    // 1. Profit target hit
    if (position.takeProfit && currentPrice >= position.takeProfit) {
      signals.push({
        type: 'TAKE_PROFIT',
        priority: 'HIGH',
        reason: `Price ${currentPrice} reached take-profit ${position.takeProfit}`,
        shouldExit: true
      });
    }

    // 2. Stop-loss hit
    if (position.stopLoss && currentPrice <= position.stopLoss) {
      signals.push({
        type: 'STOP_LOSS',
        priority: 'CRITICAL',
        reason: `Price ${currentPrice} hit stop-loss ${position.stopLoss}`,
        shouldExit: true
      });
    }

    // 3. Time-based exit
    const maxHoldTime = this.config.exit?.maxHoldTimeMs || 3600000; // 1 hour
    const holdTime = Date.now() - position.entryTime;

    if (holdTime >= maxHoldTime) {
      signals.push({
        type: 'TIME_BASED',
        priority: 'MEDIUM',
        reason: `Max hold time reached (${Math.floor(holdTime / 1000)}s)`,
        shouldExit: true
      });
    }

    // 4. Profit target percentage
    const profitTarget = this.config.exit?.profitTarget || 2.0; // 100% default
    const currentProfitPercent = position.unrealizedPnlPercent || 0;

    if (currentProfitPercent >= profitTarget * 100) {
      signals.push({
        type: 'PROFIT_TARGET',
        priority: 'HIGH',
        reason: `Profit target ${profitTarget * 100}% reached (current: ${currentProfitPercent.toFixed(2)}%)`,
        shouldExit: true
      });
    }

    // 5. Social sentiment reversal
    if (analysis.socialAnalysis?.overallScore < 30) {
      signals.push({
        type: 'SENTIMENT_REVERSAL',
        priority: 'MEDIUM',
        reason: 'Social sentiment turned negative',
        shouldExit: true
      });
    }

    // 6. Liquidity dried up
    if (analysis.liquidityAnalysis?.liquiditySol < 5) {
      signals.push({
        type: 'LIQUIDITY_RISK',
        priority: 'HIGH',
        reason: 'Liquidity critically low',
        shouldExit: true
      });
    }

    // 7. Rug pull indicators
    if (analysis.rugAnalysis?.safetyScore < 40) {
      signals.push({
        type: 'RUG_RISK',
        priority: 'CRITICAL',
        reason: 'Rug pull indicators detected',
        shouldExit: true
      });
    }

    // Determine if should exit
    const criticalSignals = signals.filter(s => s.priority === 'CRITICAL');
    const highSignals = signals.filter(s => s.priority === 'HIGH');

    const shouldExit = criticalSignals.length > 0 || highSignals.length > 0;

    const result = {
      shouldExit,
      signals,
      urgency: criticalSignals.length > 0 ? 'CRITICAL' :
               highSignals.length > 0 ? 'HIGH' : 'MEDIUM',
      currentPrice,
      position
    };

    if (shouldExit) {
      logger.info(`🚨 Exit signal for ${position.tokenSymbol}: ${signals[0].reason}`);
    }

    return result;
  }

  /**
   * Calculate optimal exit price
   */
  calculateOptimalExit(position, currentPrice, urgency = 'MEDIUM') {
    const baseSlippage = this.config.exit?.slippageBps || 500; // 5% for exits

    // Increase slippage for urgent exits
    let slippageBps = baseSlippage;
    if (urgency === 'CRITICAL') {
      slippageBps = baseSlippage * 2; // 10% for critical
    } else if (urgency === 'HIGH') {
      slippageBps = baseSlippage * 1.5; // 7.5% for high
    }

    // Calculate minimum acceptable price
    const minPrice = currentPrice * (1 - (slippageBps / 10000));

    return {
      targetPrice: currentPrice,
      minAcceptablePrice: minPrice,
      slippageBps,
      urgency
    };
  }

  /**
   * Create exit plan
   */
  createExitPlan(position, exitEvaluation) {
    const {
      currentPrice,
      urgency,
      signals
    } = exitEvaluation;

    const optimalExit = this.calculateOptimalExit(position, currentPrice, urgency);

    const plan = {
      id: this.generatePlanId(),
      positionId: position.id,
      tokenMint: position.tokenMint,
      tokenSymbol: position.tokenSymbol,
      exitReason: signals[0]?.type || 'MANUAL',
      currentPrice,
      targetPrice: optimalExit.targetPrice,
      slippageBps: optimalExit.slippageBps,
      urgency,
      status: 'PENDING',
      createdAt: Date.now(),
      expiresAt: Date.now() + (urgency === 'CRITICAL' ? 30000 : 60000) // 30s-1min
    };

    this.exitSignals.set(plan.id, plan);

    logger.info(`Exit plan created: ${position.tokenSymbol} | Reason: ${plan.exitReason} | Urgency: ${urgency}`);

    return plan;
  }

  /**
   * Execute exit plan
   */
  async executeExitPlan(planId, executor, positionManager) {
    const plan = this.exitSignals.get(planId);

    if (!plan) {
      throw new Error(`Exit plan ${planId} not found`);
    }

    if (plan.status !== 'PENDING') {
      throw new Error(`Exit plan ${planId} is not pending (status: ${plan.status})`);
    }

    try {
      plan.status = 'EXECUTING';

      const position = positionManager.getPosition(plan.positionId);

      if (!position) {
        throw new Error(`Position ${plan.positionId} not found`);
      }

      logger.info(`Executing exit plan: ${plan.tokenSymbol} | Reason: ${plan.exitReason}`);

      // Execute sell via order executor
      const result = await executor.executeSell({
        tokenMint: plan.tokenMint,
        tokenAmount: position.tokenAmount,
        slippageBps: plan.slippageBps,
        urgency: plan.urgency
      });

      // Close position
      positionManager.closePosition(plan.positionId, {
        exitPrice: result.price,
        exitAmount: result.amountReceived,
        signature: result.signature,
        reason: plan.exitReason
      });

      plan.status = 'COMPLETED';
      plan.result = result;
      plan.completedAt = Date.now();

      logger.info(`✅ Exit plan executed: ${plan.tokenSymbol} | P&L: ${result.pnl} SOL`);

      return result;

    } catch (error) {
      plan.status = 'FAILED';
      plan.error = error.message;

      logger.error(`Exit plan failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate trailing stop exit
   */
  calculateTrailingStopExit(position, currentPrice) {
    const trailingDistance = this.config.exit?.trailingStopDistance || 0.2; // 20%
    const highestPrice = position.highestPrice || position.entryPrice;

    // Update highest price if needed
    if (currentPrice > highestPrice) {
      position.highestPrice = currentPrice;
    }

    const trailingStopPrice = position.highestPrice * (1 - trailingDistance);

    return {
      trailingStopPrice,
      highestPrice: position.highestPrice,
      currentPrice,
      isTriggered: currentPrice <= trailingStopPrice
    };
  }

  /**
   * Partial exit strategy
   */
  calculatePartialExit(position, currentPrice, percentage = 0.5) {
    const exitAmount = position.tokenAmount * percentage;
    const remainingAmount = position.tokenAmount - exitAmount;

    return {
      exitAmount,
      remainingAmount,
      percentage,
      estimatedValue: exitAmount * currentPrice
    };
  }

  /**
   * Scale out strategy (take profits in stages)
   */
  createScaleOutPlan(position, currentPrice) {
    const stages = this.config.exit?.scaleOutStages || [
      { profit: 0.5, exit: 0.25 },  // 50% profit: sell 25%
      { profit: 1.0, exit: 0.25 },  // 100% profit: sell another 25%
      { profit: 2.0, exit: 0.5 }    // 200% profit: sell remaining 50%
    ];

    const plan = {
      positionId: position.id,
      stages: stages.map(stage => {
        const targetPrice = position.entryPrice * (1 + stage.profit);
        const exitAmount = position.tokenAmount * stage.exit;

        return {
          targetPrice,
          exitPercentage: stage.exit,
          exitAmount,
          triggered: currentPrice >= targetPrice,
          status: currentPrice >= targetPrice ? 'READY' : 'PENDING'
        };
      })
    };

    return plan;
  }

  /**
   * Emergency exit (liquidate immediately)
   */
  async emergencyExit(position, executor, positionManager) {
    logger.warn(`🚨 EMERGENCY EXIT: ${position.tokenSymbol}`);

    const plan = {
      id: this.generatePlanId(),
      positionId: position.id,
      tokenMint: position.tokenMint,
      exitReason: 'EMERGENCY',
      slippageBps: 1000, // 10% slippage tolerance for emergency
      urgency: 'CRITICAL'
    };

    return await this.executeExitPlan(plan.id, executor, positionManager);
  }

  /**
   * Get pending exit plans
   */
  getPendingPlans() {
    return Array.from(this.exitSignals.values())
      .filter(p => p.status === 'PENDING');
  }

  /**
   * Cancel exit plan
   */
  cancelExitPlan(planId) {
    const plan = this.exitSignals.get(planId);

    if (!plan) {
      throw new Error(`Exit plan ${planId} not found`);
    }

    plan.status = 'CANCELLED';
    plan.cancelledAt = Date.now();

    logger.info(`Exit plan cancelled: ${plan.tokenSymbol}`);

    return plan;
  }

  /**
   * Generate plan ID
   */
  generatePlanId() {
    return `exit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
