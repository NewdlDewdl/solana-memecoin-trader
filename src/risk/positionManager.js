import { logger } from '../utils/logger.js';

/**
 * Position Management Module
 * Manages all trading positions, size limits, and exposure tracking
 */

export class PositionManager {
  constructor(config, walletManager) {
    this.config = config;
    this.walletManager = walletManager;
    this.positions = new Map();
    this.positionHistory = [];
  }

  /**
   * Calculate position size based on risk parameters
   */
  calculatePositionSize(tokenMint, entryPrice, analysis) {
    const maxPositionSol = this.config.risk?.maxPositionPerToken || 0.1;
    const riskPerTrade = this.config.risk?.riskPerTrade || 0.02; // 2% of portfolio

    // Get portfolio value
    const portfolioValue = this.getTotalPortfolioValue();

    // Calculate based on risk percentage
    const riskBasedSize = portfolioValue * riskPerTrade;

    // Adjust based on token safety score
    const safetyMultiplier = analysis?.safetyScore ?
      (analysis.safetyScore / 100) : 0.5;

    let positionSize = Math.min(
      riskBasedSize * safetyMultiplier,
      maxPositionSol
    );

    // Ensure minimum position
    const minPosition = this.config.risk?.minPositionSize || 0.01;
    positionSize = Math.max(positionSize, minPosition);

    logger.info(`Calculated position size: ${positionSize} SOL (safety: ${safetyMultiplier})`);

    return positionSize;
  }

  /**
   * Check if new position can be opened
   */
  canOpenPosition(tokenMint, positionSizeSol) {
    // Check maximum concurrent positions
    const maxConcurrent = this.config.risk?.maxConcurrentPositions || 5;
    const currentPositions = this.getActivePositions().length;

    if (currentPositions >= maxConcurrent) {
      logger.warn(`Cannot open position: max concurrent (${maxConcurrent}) reached`);
      return {
        allowed: false,
        reason: 'MAX_CONCURRENT_POSITIONS'
      };
    }

    // Check total exposure
    const maxExposure = this.config.risk?.maxTotalExposureSol || 1.0;
    const currentExposure = this.getTotalExposure();

    if (currentExposure + positionSizeSol > maxExposure) {
      logger.warn(`Cannot open position: would exceed max exposure (${maxExposure} SOL)`);
      return {
        allowed: false,
        reason: 'MAX_EXPOSURE_EXCEEDED'
      };
    }

    // Check if already have position in this token
    if (this.hasPosition(tokenMint)) {
      logger.warn(`Cannot open position: already have position in ${tokenMint}`);
      return {
        allowed: false,
        reason: 'DUPLICATE_POSITION'
      };
    }

    // Check available funds
    const availableFunds = this.getAvailableFunds();
    if (positionSizeSol > availableFunds) {
      logger.warn(`Cannot open position: insufficient funds (need ${positionSizeSol}, have ${availableFunds})`);
      return {
        allowed: false,
        reason: 'INSUFFICIENT_FUNDS'
      };
    }

    return {
      allowed: true
    };
  }

  /**
   * Open new position
   */
  openPosition(params) {
    const {
      tokenMint,
      tokenSymbol,
      entryPrice,
      entryAmount, // SOL amount
      tokenAmount, // Token quantity received
      walletPublicKey,
      signature
    } = params;

    // Validate
    const validation = this.canOpenPosition(tokenMint, entryAmount);
    if (!validation.allowed) {
      throw new Error(`Cannot open position: ${validation.reason}`);
    }

    const positionId = this.generatePositionId();

    const position = {
      id: positionId,
      tokenMint,
      tokenSymbol,
      entryPrice,
      entryAmount,
      tokenAmount,
      walletPublicKey,
      entrySignature: signature,
      entryTime: Date.now(),
      status: 'OPEN',
      stopLoss: null,
      takeProfit: null,
      currentPrice: entryPrice,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0
    };

    // Store position
    this.positions.set(positionId, position);

    // Track in wallet manager
    this.walletManager.addPosition(walletPublicKey, position);

    logger.info(`✅ Position opened: ${tokenSymbol} | Entry: ${entryPrice} | Amount: ${entryAmount} SOL`);

    return position;
  }

  /**
   * Close position
   */
  closePosition(positionId, params) {
    const position = this.positions.get(positionId);

    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    const {
      exitPrice,
      exitAmount, // SOL received
      signature,
      reason = 'MANUAL'
    } = params;

    // Calculate P&L
    const pnl = exitAmount - position.entryAmount;
    const pnlPercent = (pnl / position.entryAmount) * 100;

    // Update position
    position.status = 'CLOSED';
    position.exitPrice = exitPrice;
    position.exitAmount = exitAmount;
    position.exitSignature = signature;
    position.exitTime = Date.now();
    position.exitReason = reason;
    position.realizedPnl = pnl;
    position.realizedPnlPercent = pnlPercent;
    position.holdTime = position.exitTime - position.entryTime;

    // Move to history
    this.positionHistory.push(position);
    this.positions.delete(positionId);

    // Remove from wallet
    this.walletManager.removePosition(position.walletPublicKey, positionId);

    const emoji = pnl > 0 ? '💰' : '📉';
    logger.info(`${emoji} Position closed: ${position.tokenSymbol} | P&L: ${pnl.toFixed(4)} SOL (${pnlPercent.toFixed(2)}%) | Reason: ${reason}`);

    return position;
  }

  /**
   * Update position price and P&L
   */
  updatePosition(positionId, currentPrice) {
    const position = this.positions.get(positionId);

    if (!position) {
      logger.warn(`Position ${positionId} not found`);
      return null;
    }

    position.currentPrice = currentPrice;

    // Calculate unrealized P&L
    const currentValue = (position.tokenAmount * currentPrice);
    const unrealizedPnl = currentValue - position.entryAmount;
    const unrealizedPnlPercent = (unrealizedPnl / position.entryAmount) * 100;

    position.unrealizedPnl = unrealizedPnl;
    position.unrealizedPnlPercent = unrealizedPnlPercent;
    position.lastUpdate = Date.now();

    return position;
  }

  /**
   * Set stop-loss for position
   */
  setStopLoss(positionId, stopLossPrice) {
    const position = this.positions.get(positionId);

    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    position.stopLoss = stopLossPrice;

    const stopLossPercent = ((stopLossPrice - position.entryPrice) / position.entryPrice) * 100;

    logger.info(`Stop-loss set for ${position.tokenSymbol}: ${stopLossPrice} (${stopLossPercent.toFixed(2)}%)`);

    return position;
  }

  /**
   * Set take-profit for position
   */
  setTakeProfit(positionId, takeProfitPrice) {
    const position = this.positions.get(positionId);

    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    position.takeProfit = takeProfitPrice;

    const profitPercent = ((takeProfitPrice - position.entryPrice) / position.entryPrice) * 100;

    logger.info(`Take-profit set for ${position.tokenSymbol}: ${takeProfitPrice} (${profitPercent.toFixed(2)}%)`);

    return position;
  }

  /**
   * Check if position should be closed (stop-loss/take-profit hit)
   */
  checkExitConditions(positionId, currentPrice) {
    const position = this.positions.get(positionId);

    if (!position) return null;

    const conditions = [];

    // Check stop-loss
    if (position.stopLoss && currentPrice <= position.stopLoss) {
      conditions.push({
        type: 'STOP_LOSS',
        triggered: true,
        targetPrice: position.stopLoss,
        currentPrice
      });
    }

    // Check take-profit
    if (position.takeProfit && currentPrice >= position.takeProfit) {
      conditions.push({
        type: 'TAKE_PROFIT',
        triggered: true,
        targetPrice: position.takeProfit,
        currentPrice
      });
    }

    return conditions.length > 0 ? conditions : null;
  }

  /**
   * Get active positions
   */
  getActivePositions() {
    return Array.from(this.positions.values());
  }

  /**
   * Get position by ID
   */
  getPosition(positionId) {
    return this.positions.get(positionId);
  }

  /**
   * Check if has position in token
   */
  hasPosition(tokenMint) {
    return Array.from(this.positions.values())
      .some(p => p.tokenMint === tokenMint);
  }

  /**
   * Get total exposure (sum of all position values)
   */
  getTotalExposure() {
    return Array.from(this.positions.values())
      .reduce((sum, p) => sum + p.entryAmount, 0);
  }

  /**
   * Get total unrealized P&L
   */
  getTotalUnrealizedPnl() {
    return Array.from(this.positions.values())
      .reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);
  }

  /**
   * Get portfolio statistics
   */
  getPortfolioStats() {
    const activePositions = this.getActivePositions();
    const totalExposure = this.getTotalExposure();
    const totalUnrealizedPnl = this.getTotalUnrealizedPnl();

    // Calculate realized P&L from history
    const totalRealizedPnl = this.positionHistory
      .reduce((sum, p) => sum + (p.realizedPnl || 0), 0);

    const winningTrades = this.positionHistory.filter(p => p.realizedPnl > 0).length;
    const losingTrades = this.positionHistory.filter(p => p.realizedPnl < 0).length;
    const totalTrades = this.positionHistory.length;

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    return {
      activePositions: activePositions.length,
      totalExposure,
      totalUnrealizedPnl,
      totalRealizedPnl,
      totalPnl: totalUnrealizedPnl + totalRealizedPnl,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      averagePnl: totalTrades > 0 ? totalRealizedPnl / totalTrades : 0
    };
  }

  /**
   * Get available funds for new positions
   */
  getAvailableFunds() {
    const maxExposure = this.config.risk?.maxTotalExposureSol || 1.0;
    const currentExposure = this.getTotalExposure();
    return Math.max(0, maxExposure - currentExposure);
  }

  /**
   * Get total portfolio value
   */
  getTotalPortfolioValue() {
    // This should be integrated with WalletManager
    // For now, return configured max exposure as proxy
    return this.config.risk?.maxTotalExposureSol || 1.0;
  }

  /**
   * Generate unique position ID
   */
  generatePositionId() {
    return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get position history
   */
  getHistory(limit = 50) {
    return this.positionHistory
      .slice(-limit)
      .reverse();
  }

  /**
   * Export positions data for analysis
   */
  exportData() {
    return {
      active: this.getActivePositions(),
      history: this.positionHistory,
      stats: this.getPortfolioStats()
    };
  }
}
