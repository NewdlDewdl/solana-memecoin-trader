import { logger } from '../utils/logger.js';

/**
 * Exit Monitor - Monitors open positions and triggers exits based on:
 * - Stop-loss (-30%)
 * - Take-profit (+50%)
 * - Trailing stop (15% from peak)
 * - Max hold time (30 minutes)
 */
export class ExitMonitor {
  constructor(paperTradingManager, config = {}, priceFeedManager = null) {
    this.paperTradingManager = paperTradingManager;
    this.priceFeedManager = priceFeedManager;
    this.config = {
      stopLossPercent: config.stopLossPercent || 0.25,      // -25% (was 0.30)
      takeProfitPercent: config.takeProfitPercent || 0.60,  // +60% (was 0.50)

      // PHASE 3: Tiered exit configuration
      exitMode: config.exitMode || 'single',  // 'single' or 'tiered'
      tier1Target: config.tier1Target || 0.50,  // Tier 1: +50%
      tier2Target: config.tier2Target || 0.80,  // Tier 2: +80%
      tier1Percent: config.tier1Percent || 50,  // Sell 50% at tier 1
      tier2Percent: config.tier2Percent || 50,  // Sell 50% at tier 2

      trailingStopPercent: config.trailingStopPercent || 0.25, // 25% from peak (was 0.15)
      trailingActivationProfit: config.trailingActivationProfit || 0.20, // NEW: Only trail after +20% profit
      maxHoldTimeMs: config.maxHoldTimeMs || 30 * 60 * 1000,  // 30 minutes
      monitorIntervalMs: config.monitorIntervalMs || 5000,     // Check every 5 seconds
      priceVolatility: config.priceVolatility || 0.05,         // ±5% price moves
      useRealPrices: config.useRealPrices || false             // Use real price feeds
    };

    this.monitorInterval = null;
    this.priceSimulations = new Map(); // tokenAddress -> { currentPrice, peak }
  }

  /**
   * Start monitoring positions
   */
  start() {
    if (this.monitorInterval) {
      logger.warn('Exit monitor already running');
      return;
    }

    logger.info(`🔍 Exit Monitor started - checking every ${this.config.monitorIntervalMs / 1000}s`);

    // PHASE 3: Log tiered or single mode
    if (this.config.exitMode === 'tiered') {
      logger.info(`📊 Exit Mode: TIERED`);
      logger.info(`📊 Exit Rules: Stop-Loss: -${this.config.stopLossPercent * 100}% | Tier 1: +${this.config.tier1Target * 100}% (sell ${this.config.tier1Percent}%) | Tier 2: +${this.config.tier2Target * 100}% (sell ${this.config.tier2Percent}%) | Trailing: ${this.config.trailingStopPercent * 100}% (after +${this.config.trailingActivationProfit * 100}%) | Max Hold: ${this.config.maxHoldTimeMs / 60000} min`);
    } else {
      logger.info(`📊 Exit Mode: SINGLE`);
      logger.info(`📊 Exit Rules: Stop-Loss: -${this.config.stopLossPercent * 100}% | Take-Profit: +${this.config.takeProfitPercent * 100}% | Trailing: ${this.config.trailingStopPercent * 100}% (after +${this.config.trailingActivationProfit * 100}%) | Max Hold: ${this.config.maxHoldTimeMs / 60000} min`);
    }

    logger.info(`💰 Price Mode: ${this.config.useRealPrices ? 'REAL PRICES (with simulation fallback)' : 'SIMULATED PRICES'}`);

    this.monitorInterval = setInterval(() => {
      this.checkPositions();
    }, this.config.monitorIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info('🛑 Exit Monitor stopped');
    }
  }

  /**
   * Check all open positions for exit conditions
   */
  async checkPositions() {
    const positions = this.paperTradingManager.getPositions();
    
    if (positions.length === 0) {
      return; // No positions to monitor
    }

    logger.debug(`🔍 Monitoring ${positions.length} positions...`);

    for (const position of positions) {
      try {
        await this.checkPosition(position);
      } catch (error) {
        logger.error(`Error checking position ${position.tokenSymbol}:`, error);
      }
    }
  }

  /**
   * Check individual position for exit conditions
   */
  async checkPosition(position) {
    const tokenAddress = position.tokenAddress;
    
    // Get current price (real or simulated)
    let currentPrice;
    if (this.config.useRealPrices && this.priceFeedManager) {
      try {
        // Attempt to get real price
        currentPrice = await this.priceFeedManager.getPrice(tokenAddress);
        logger.debug(`Real price for ${position.tokenSymbol}: ${currentPrice.toFixed(6)} SOL`);
      } catch (error) {
        // Fallback to simulation if real price fails
        logger.debug(`Failed to get real price, using simulation: ${error.message}`);
        currentPrice = this.simulatePrice(tokenAddress, position.entryPrice);
      }
    } else {
      // Use simulated price for paper trading
      currentPrice = this.simulatePrice(tokenAddress, position.entryPrice);
    }
    
    // Update position with current price
    this.paperTradingManager.updatePosition(tokenAddress, currentPrice);

    // Calculate metrics
    const entryPrice = position.entryPrice;
    const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    const holdTimeMs = Date.now() - position.entryTime;
    const holdTimeMin = Math.floor(holdTimeMs / 60000);

    // Get peak price for trailing stop
    const simulation = this.priceSimulations.get(tokenAddress);
    const peakPrice = simulation.peak;

    // Check exit conditions (in priority order)
    let exitReason = null;
    let exitType = null;
    let exitPercent = 1.0;  // PHASE 3: Default to 100% (full exit)

    // 1. Max hold time (highest priority - prevent indefinite holds)
    if (holdTimeMs >= this.config.maxHoldTimeMs) {
      exitReason = `Max hold time (${Math.floor(this.config.maxHoldTimeMs / 60000)} min)`;
      exitType = 'MAX_HOLD_TIME';
      exitPercent = 1.0;  // Full exit on max hold time
    }

    // 2. Stop-loss (protect capital)
    else if (priceChangePercent <= -this.config.stopLossPercent * 100) {
      exitReason = `Stop-loss triggered (${priceChangePercent.toFixed(1)}%)`;
      exitType = 'STOP_LOSS';
      exitPercent = 1.0;  // Full exit on stop-loss
    }

    // 3. Take-profit (tiered or single) - PHASE 3
    else if (this.config.exitMode === 'tiered') {
      // Check tier 1 first
      if (position.tier1Sold !== true && priceChangePercent >= this.config.tier1Target * 100) {
        exitReason = `Tier 1 take-profit (${priceChangePercent.toFixed(1)}%) - selling ${this.config.tier1Percent}%`;
        exitType = 'TAKE_PROFIT_TIER_1';
        exitPercent = this.config.tier1Percent / 100;  // Partial exit (50%)
      }
      // Check tier 2
      else if (position.tier2Sold !== true && priceChangePercent >= this.config.tier2Target * 100) {
        exitReason = `Tier 2 take-profit (${priceChangePercent.toFixed(1)}%) - selling ${this.config.tier2Percent}%`;
        exitType = 'TAKE_PROFIT_TIER_2';
        exitPercent = this.config.tier2Percent / 100;  // Remaining position (50%)
      }
    } else {
      // Single take-profit (original logic)
      if (priceChangePercent >= this.config.takeProfitPercent * 100) {
        exitReason = `Take-profit triggered (${priceChangePercent.toFixed(1)}%)`;
        exitType = 'TAKE_PROFIT';
        exitPercent = 1.0;  // Full exit
      }
    }

    // 4. Trailing stop (SMART: only protect profits after +20% gain)
    // Only check if no exit condition was met yet
    if (!exitReason) {
      // Calculate if we've reached the profit zone to activate trailing stop
      const profitActivationThreshold = 1 + this.config.trailingActivationProfit; // 1.20 = +20%
      const hasReachedProfitZone = peakPrice >= entryPrice * profitActivationThreshold;

      // Only check trailing stop if we've been profitable
      if (hasReachedProfitZone && currentPrice < peakPrice * (1 - this.config.trailingStopPercent)) {
        const dropFromPeak = ((peakPrice - currentPrice) / peakPrice) * 100;
        const profitFromEntry = ((currentPrice - entryPrice) / entryPrice) * 100;
        exitReason = `Trailing stop triggered (${dropFromPeak.toFixed(1)}% from peak of +${((peakPrice - entryPrice) / entryPrice * 100).toFixed(1)}%, currently ${profitFromEntry >= 0 ? '+' : ''}${profitFromEntry.toFixed(1)}%)`;
        exitType = 'TRAILING_STOP';
        exitPercent = 1.0;  // Full exit on trailing stop
      }
    }

    // Execute exit if any condition met
    if (exitReason) {
      logger.info(`🚪 EXIT: ${position.tokenSymbol} | ${exitReason} | Held ${holdTimeMin}m | Entry: ${entryPrice.toFixed(6)} → Current: ${currentPrice.toFixed(6)} (${priceChangePercent.toFixed(1)}%)`);

      // Execute paper trade sell (PHASE 3: with partial exit support)
      await this.paperTradingManager.simulateSell(
        tokenAddress,
        position.tokenSymbol,
        currentPrice,
        exitType,
        exitPercent  // PHASE 3: Pass exit percentage (0-1)
      );

      // Clean up price simulation only if full exit (PHASE 3)
      if (exitPercent >= 1.0) {
        this.priceSimulations.delete(tokenAddress);
      }
    } else {
      // Log status every minute
      if (holdTimeMs % 60000 < this.config.monitorIntervalMs) {
        logger.debug(`📊 ${position.tokenSymbol} | ${holdTimeMin}m | ${priceChangePercent.toFixed(1)}% | Peak: ${((peakPrice - entryPrice) / entryPrice * 100).toFixed(1)}%`);
      }
    }
  }

  /**
   * Simulate realistic price movement
   * In paper trading, we need to simulate price changes since we can't fetch real prices
   */
  simulatePrice(tokenAddress, entryPrice) {
    // Initialize if first time seeing this token
    if (!this.priceSimulations.has(tokenAddress)) {
      this.priceSimulations.set(tokenAddress, {
        currentPrice: entryPrice,
        peak: entryPrice,
        trend: Math.random() < 0.3 ? 'up' : 'down', // 30% chance of uptrend (realistic for memecoins)
        volatility: 0.02 + Math.random() * 0.08 // 2-10% volatility per interval
      });
      return entryPrice;
    }

    const simulation = this.priceSimulations.get(tokenAddress);
    
    // Generate realistic price movement
    const volatility = simulation.volatility;
    const trend = simulation.trend;
    
    // Trend-based movement with noise
    let priceChange;
    if (trend === 'up') {
      // Uptrend: bias toward positive movement
      priceChange = (Math.random() * volatility * 2 - volatility * 0.5) * simulation.currentPrice;
    } else {
      // Downtrend: bias toward negative movement
      priceChange = (Math.random() * volatility * 2 - volatility * 1.5) * simulation.currentPrice;
    }
    
    // Apply change
    const newPrice = Math.max(simulation.currentPrice + priceChange, 0.001); // Floor at 0.001 to prevent zero
    
    // Occasional trend reversal (5% chance each check)
    if (Math.random() < 0.05) {
      simulation.trend = simulation.trend === 'up' ? 'down' : 'up';
    }
    
    // Update peak
    if (newPrice > simulation.peak) {
      simulation.peak = newPrice;
    }
    
    // Update current price
    simulation.currentPrice = newPrice;
    
    return newPrice;
  }

  /**
   * Get exit statistics
   */
  getStats() {
    const stats = this.paperTradingManager.getPerformanceSummary();
    return {
      closedTrades: stats.closedTrades,
      winRate: stats.winRate,
      totalPnL: stats.totalPnL,
      totalPnLPercent: stats.totalPnLPercent,
      largestWin: stats.largestWin,
      largestLoss: stats.largestLoss
    };
  }
}

export default ExitMonitor;

