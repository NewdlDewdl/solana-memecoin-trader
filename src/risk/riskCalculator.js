import { logger } from '../utils/logger.js';

/**
 * Risk Calculator Module
 * Calculates various risk metrics and position sizing recommendations
 */

export class RiskCalculator {
  constructor(config) {
    this.config = config;
  }

  /**
   * Calculate Kelly Criterion position size
   */
  calculateKellyCriterion(winRate, avgWin, avgLoss) {
    if (avgLoss === 0) return 0;

    const winLossRatio = avgWin / Math.abs(avgLoss);
    const kelly = (winRate * winLossRatio - (1 - winRate)) / winLossRatio;

    // Use fraction of Kelly (usually 0.25-0.5 for safety)
    const fractionalKelly = kelly * (this.config.risk?.kellyFraction || 0.25);

    return Math.max(0, Math.min(fractionalKelly, 0.2)); // Cap at 20% of portfolio
  }

  /**
   * Calculate position size based on risk
   */
  calculatePositionSize(params) {
    const {
      portfolioValue,
      riskPercent = 2, // Risk 2% of portfolio per trade
      entryPrice,
      stopLossPrice,
      safetyScore = 50
    } = params;

    // Risk amount in SOL
    const riskAmount = portfolioValue * (riskPercent / 100);

    // Price risk per unit
    const priceRisk = entryPrice - stopLossPrice;

    if (priceRisk <= 0) {
      logger.warn('Invalid stop-loss price (not below entry)');
      return 0;
    }

    // Units to buy based on risk
    const units = riskAmount / priceRisk;

    // Position size in SOL
    let positionSize = units * entryPrice;

    // Adjust for safety score (0-100)
    const safetyMultiplier = safetyScore / 100;
    positionSize *= safetyMultiplier;

    // Apply maximum position limit
    const maxPosition = this.config.risk?.maxPositionPerToken || 0.5;
    positionSize = Math.min(positionSize, maxPosition);

    logger.debug(`Position size calculated: ${positionSize} SOL (risk: ${riskPercent}%, safety: ${safetyScore})`);

    return positionSize;
  }

  /**
   * Calculate risk-reward ratio
   */
  calculateRiskReward(entryPrice, stopLossPrice, targetPrice) {
    const risk = entryPrice - stopLossPrice;
    const reward = targetPrice - entryPrice;

    if (risk <= 0) return 0;

    const ratio = reward / risk;

    logger.debug(`Risk-reward ratio: ${ratio.toFixed(2)}:1`);

    return ratio;
  }

  /**
   * Assess if trade meets risk-reward requirements
   */
  assessTrade(params) {
    const {
      entryPrice,
      stopLossPrice,
      targetPrice,
      safetyScore
    } = params;

    const riskReward = this.calculateRiskReward(entryPrice, stopLossPrice, targetPrice);
    const minRiskReward = this.config.risk?.minRiskReward || 2.0;

    const assessment = {
      riskReward,
      meetsMinimum: riskReward >= minRiskReward,
      safetyScore,
      isSafe: safetyScore >= (this.config.entry?.minSafetyScore || 60),
      recommendation: 'REJECT'
    };

    // Determine recommendation
    if (assessment.meetsMinimum && assessment.isSafe) {
      assessment.recommendation = 'ACCEPT';
    } else if (assessment.meetsMinimum || assessment.isSafe) {
      assessment.recommendation = 'MARGINAL';
    }

    logger.debug(`Trade assessment: ${assessment.recommendation} (R:R=${riskReward.toFixed(2)}, Safety=${safetyScore})`);

    return assessment;
  }

  /**
   * Calculate portfolio heat (total risk exposure)
   */
  calculatePortfolioHeat(positions) {
    let totalHeat = 0;

    for (const position of positions) {
      if (!position.stopLoss) continue;

      const potentialLoss = position.entryAmount - (position.tokenAmount * position.stopLoss);
      totalHeat += Math.abs(potentialLoss);
    }

    logger.debug(`Portfolio heat: ${totalHeat} SOL at risk`);

    return totalHeat;
  }

  /**
   * Calculate maximum portfolio heat allowed
   */
  getMaxPortfolioHeat(portfolioValue) {
    const maxHeatPercent = this.config.risk?.maxPortfolioHeat || 10; // 10% max
    return portfolioValue * (maxHeatPercent / 100);
  }

  /**
   * Check if new position would exceed portfolio heat limit
   */
  wouldExceedHeat(currentPositions, newPositionRisk, portfolioValue) {
    const currentHeat = this.calculatePortfolioHeat(currentPositions);
    const maxHeat = this.getMaxPortfolioHeat(portfolioValue);

    const newTotalHeat = currentHeat + newPositionRisk;

    const wouldExceed = newTotalHeat > maxHeat;

    if (wouldExceed) {
      logger.warn(`New position would exceed heat limit: ${newTotalHeat} > ${maxHeat}`);
    }

    return {
      wouldExceed,
      currentHeat,
      newTotalHeat,
      maxHeat,
      heatUtilization: (newTotalHeat / maxHeat) * 100
    };
  }

  /**
   * Calculate Value at Risk (VaR)
   */
  calculateVaR(positions, confidenceLevel = 0.95) {
    if (positions.length === 0) return 0;

    // Simplified VaR based on position values and assumed volatility
    const volatility = 0.3; // 30% assumed daily volatility for memecoins

    // Calculate total portfolio value
    const totalValue = positions.reduce((sum, p) => {
      return sum + (p.tokenAmount * p.currentPrice || p.entryAmount);
    }, 0);

    // Z-score for confidence level
    const zScore = confidenceLevel === 0.95 ? 1.65 : 2.33;

    // VaR = Portfolio Value × Volatility × Z-score
    const var95 = totalValue * volatility * zScore;

    logger.debug(`VaR (${confidenceLevel * 100}%): ${var95} SOL at risk`);

    return var95;
  }

  /**
   * Calculate Sharpe ratio from trade history
   */
  calculateSharpeRatio(tradeHistory, riskFreeRate = 0) {
    if (tradeHistory.length < 2) return 0;

    // Calculate returns
    const returns = tradeHistory.map(trade => {
      return (trade.exitAmount - trade.entryAmount) / trade.entryAmount;
    });

    // Calculate average return
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Calculate standard deviation
    const variance = returns.reduce((sum, r) => {
      return sum + Math.pow(r - avgReturn, 2);
    }, 0) / returns.length;

    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Sharpe ratio = (Average Return - Risk Free Rate) / Standard Deviation
    const sharpe = (avgReturn - riskFreeRate) / stdDev;

    logger.debug(`Sharpe ratio: ${sharpe.toFixed(2)}`);

    return sharpe;
  }

  /**
   * Calculate maximum drawdown
   */
  calculateMaxDrawdown(tradeHistory) {
    if (tradeHistory.length === 0) return 0;

    let peak = 0;
    let maxDrawdown = 0;
    let currentValue = 0;

    for (const trade of tradeHistory) {
      currentValue += (trade.realizedPnl || 0);

      if (currentValue > peak) {
        peak = currentValue;
      }

      const drawdown = (peak - currentValue) / peak;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    logger.debug(`Max drawdown: ${(maxDrawdown * 100).toFixed(2)}%`);

    return maxDrawdown;
  }

  /**
   * Calculate correlation risk (multiple positions in correlated tokens)
   */
  calculateCorrelationRisk(positions) {
    // Simplified: assume all memecoins are 70% correlated
    const correlation = 0.7;

    const totalPositions = positions.length;

    if (totalPositions <= 1) return 0;

    // Correlation risk increases with number of positions
    const correlationRisk = (totalPositions - 1) * correlation;

    logger.debug(`Correlation risk: ${correlationRisk.toFixed(2)} (${totalPositions} positions)`);

    return correlationRisk;
  }

  /**
   * Calculate overall portfolio risk score (0-100)
   */
  calculatePortfolioRisk(params) {
    const {
      positions,
      portfolioValue,
      tradeHistory = []
    } = params;

    let riskScore = 0;

    // Heat risk (40 points max)
    const heat = this.calculatePortfolioHeat(positions);
    const maxHeat = this.getMaxPortfolioHeat(portfolioValue);
    const heatRisk = (heat / maxHeat) * 40;
    riskScore += heatRisk;

    // Concentration risk (30 points max)
    const maxPositions = this.config.risk?.maxConcurrentPositions || 5;
    const concentrationRisk = (positions.length / maxPositions) * 30;
    riskScore += concentrationRisk;

    // Correlation risk (20 points max)
    const corrRisk = this.calculateCorrelationRisk(positions) * 20;
    riskScore += Math.min(corrRisk, 20);

    // Historical performance risk (10 points max)
    if (tradeHistory.length > 10) {
      const maxDD = this.calculateMaxDrawdown(tradeHistory);
      const ddRisk = maxDD * 10;
      riskScore += Math.min(ddRisk, 10);
    }

    riskScore = Math.min(100, riskScore);

    const riskLevel = riskScore < 40 ? 'LOW' :
                     riskScore < 70 ? 'MEDIUM' : 'HIGH';

    logger.info(`Portfolio risk score: ${riskScore.toFixed(0)}/100 (${riskLevel})`);

    return {
      score: riskScore,
      level: riskLevel,
      components: {
        heat: heatRisk,
        concentration: concentrationRisk,
        correlation: corrRisk
      }
    };
  }

  /**
   * Get recommended action based on risk
   */
  getRecommendedAction(riskScore) {
    if (riskScore >= 80) {
      return {
        action: 'REDUCE',
        message: 'Portfolio risk is very high - consider closing positions'
      };
    } else if (riskScore >= 60) {
      return {
        action: 'HOLD',
        message: 'Portfolio risk is elevated - avoid opening new positions'
      };
    } else {
      return {
        action: 'NORMAL',
        message: 'Portfolio risk is acceptable - normal operations'
      };
    }
  }
}
