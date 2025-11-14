import { logger } from '../utils/logger.js';

/**
 * Stop-Loss Module
 * Implements various stop-loss strategies (fixed, trailing, time-based)
 */

export class StopLoss {
  constructor(config, positionManager) {
    this.config = config;
    this.positionManager = positionManager;
    this.monitoringIntervals = new Map();
  }

  /**
   * Calculate stop-loss price based on strategy
   */
  calculateStopLoss(position, strategy = 'fixed') {
    const entryPrice = position.entryPrice;
    const stopLossPercent = this.config.exit?.stopLoss || 0.5; // 50% loss default

    switch (strategy) {
      case 'fixed':
        return this.calculateFixedStopLoss(entryPrice, stopLossPercent);

      case 'trailing':
        return this.calculateTrailingStopLoss(position);

      case 'atr':
        // ATR-based stop-loss (requires price history)
        return this.calculateATRStopLoss(position);

      case 'time':
        // Time-based exit (no specific price)
        return null;

      default:
        return this.calculateFixedStopLoss(entryPrice, stopLossPercent);
    }
  }

  /**
   * Fixed percentage stop-loss
   */
  calculateFixedStopLoss(entryPrice, stopLossPercent = 0.5) {
    const stopLossPrice = entryPrice * (1 - stopLossPercent);

    logger.debug(`Fixed stop-loss: ${stopLossPrice} (${stopLossPercent * 100}% below entry)`);

    return stopLossPrice;
  }

  /**
   * Trailing stop-loss
   */
  calculateTrailingStopLoss(position) {
    const trailingDistance = this.config.exit?.trailingStopDistance || 0.2; // 20% default
    const highestPrice = position.highestPrice || position.entryPrice;

    const stopLossPrice = highestPrice * (1 - trailingDistance);

    logger.debug(`Trailing stop-loss: ${stopLossPrice} (${trailingDistance * 100}% below highest ${highestPrice})`);

    return stopLossPrice;
  }

  /**
   * ATR-based stop-loss
   */
  calculateATRStopLoss(position) {
    // Requires price history and ATR calculation
    // Placeholder for now
    const entryPrice = position.entryPrice;
    const atrMultiplier = 2.0;
    const estimatedATR = entryPrice * 0.05; // 5% as placeholder

    const stopLossPrice = entryPrice - (estimatedATR * atrMultiplier);

    logger.debug(`ATR stop-loss: ${stopLossPrice}`);

    return stopLossPrice;
  }

  /**
   * Update trailing stop-loss based on new price
   */
  updateTrailingStop(positionId, currentPrice) {
    const position = this.positionManager.getPosition(positionId);

    if (!position) {
      logger.warn(`Position ${positionId} not found`);
      return null;
    }

    // Update highest price if current price is higher
    if (!position.highestPrice || currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
      logger.debug(`New highest price for ${position.tokenSymbol}: ${currentPrice}`);
    }

    // Recalculate trailing stop
    const newStopLoss = this.calculateTrailingStopLoss(position);

    // Only update if new stop-loss is higher (never lower it)
    if (!position.stopLoss || newStopLoss > position.stopLoss) {
      position.stopLoss = newStopLoss;
      logger.info(`Trailing stop updated for ${position.tokenSymbol}: ${newStopLoss}`);
    }

    return position.stopLoss;
  }

  /**
   * Check if stop-loss is triggered
   */
  isTriggered(position, currentPrice) {
    if (!position.stopLoss) return false;

    return currentPrice <= position.stopLoss;
  }

  /**
   * Check all positions for stop-loss triggers
   */
  checkAllPositions(priceMap) {
    const triggeredPositions = [];

    const activePositions = this.positionManager.getActivePositions();

    for (const position of activePositions) {
      const currentPrice = priceMap.get(position.tokenMint);

      if (!currentPrice) continue;

      // Update position price
      this.positionManager.updatePosition(position.id, currentPrice);

      // Update trailing stop if enabled
      if (this.config.exit?.trailingStop) {
        this.updateTrailingStop(position.id, currentPrice);
      }

      // Check if stop-loss triggered
      if (this.isTriggered(position, currentPrice)) {
        triggeredPositions.push({
          position,
          currentPrice,
          stopLoss: position.stopLoss,
          reason: 'STOP_LOSS'
        });

        logger.warn(`⚠️ Stop-loss triggered for ${position.tokenSymbol}: ${currentPrice} <= ${position.stopLoss}`);
      }
    }

    return triggeredPositions;
  }

  /**
   * Start monitoring position for stop-loss
   */
  startMonitoring(positionId, priceProvider, interval = 5000) {
    logger.info(`Starting stop-loss monitoring for position ${positionId}`);

    const intervalHandle = setInterval(async () => {
      try {
        const position = this.positionManager.getPosition(positionId);

        if (!position) {
          this.stopMonitoring(positionId);
          return;
        }

        // Get current price
        const currentPrice = await priceProvider(position.tokenMint);

        if (!currentPrice) return;

        // Update position
        this.positionManager.updatePosition(positionId, currentPrice);

        // Update trailing stop if enabled
        if (this.config.exit?.trailingStop) {
          this.updateTrailingStop(positionId, currentPrice);
        }

        // Check if triggered
        if (this.isTriggered(position, currentPrice)) {
          logger.warn(`🚨 Stop-loss triggered for ${position.tokenSymbol}`);

          // Emit event for execution
          this.emit('stopLossTriggered', {
            position,
            currentPrice
          });

          // Stop monitoring (position will be closed)
          this.stopMonitoring(positionId);
        }

      } catch (error) {
        logger.error(`Error monitoring position ${positionId}:`, error);
      }
    }, interval);

    this.monitoringIntervals.set(positionId, intervalHandle);
  }

  /**
   * Stop monitoring position
   */
  stopMonitoring(positionId) {
    const intervalHandle = this.monitoringIntervals.get(positionId);

    if (intervalHandle) {
      clearInterval(intervalHandle);
      this.monitoringIntervals.delete(positionId);
      logger.info(`Stopped monitoring position ${positionId}`);
    }
  }

  /**
   * Stop all monitoring
   */
  stopAllMonitoring() {
    for (const [positionId, intervalHandle] of this.monitoringIntervals.entries()) {
      clearInterval(intervalHandle);
      logger.info(`Stopped monitoring position ${positionId}`);
    }

    this.monitoringIntervals.clear();
  }

  /**
   * Implement time-based exit
   */
  checkTimeBasedExit(position) {
    const maxHoldTime = this.config.exit?.maxHoldTimeMs || 3600000; // 1 hour default
    const holdTime = Date.now() - position.entryTime;

    if (holdTime >= maxHoldTime) {
      logger.info(`Time-based exit triggered for ${position.tokenSymbol} (held ${holdTime}ms)`);
      return true;
    }

    return false;
  }

  /**
   * Calculate optimal stop-loss based on volatility
   */
  calculateVolatilityBasedStop(position, priceHistory) {
    if (!priceHistory || priceHistory.length < 10) {
      // Not enough data, use fixed stop
      return this.calculateFixedStopLoss(position.entryPrice);
    }

    // Calculate standard deviation
    const mean = priceHistory.reduce((sum, p) => sum + p, 0) / priceHistory.length;
    const variance = priceHistory.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / priceHistory.length;
    const stdDev = Math.sqrt(variance);

    // Set stop-loss at 2 standard deviations below entry
    const stopLossPrice = position.entryPrice - (2 * stdDev);

    logger.debug(`Volatility-based stop-loss: ${stopLossPrice} (σ=${stdDev})`);

    return Math.max(stopLossPrice, position.entryPrice * 0.5); // Min 50% stop
  }

  /**
   * Event emitter for stop-loss triggers
   */
  emit(event, data) {
    // Override this in main bot to handle events
    logger.debug(`Event emitted: ${event}`, data);
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus() {
    return {
      monitoredPositions: this.monitoringIntervals.size,
      positions: Array.from(this.monitoringIntervals.keys())
    };
  }
}
