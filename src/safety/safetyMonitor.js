import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Safety Monitor
 * Comprehensive safety system with multiple circuit breakers
 * Monitors: drawdown, consecutive losses, RPC failures, portfolio heat, manual stop
 */
export class SafetyMonitor {
  constructor(config = {}) {
    this.config = {
      maxDrawdownPercent: config.maxDrawdownPercent || 20,
      maxConsecutiveLosses: config.maxConsecutiveLosses || 5,
      maxRpcFailures: config.maxRpcFailures || 10,
      rpcFailureWindow: config.rpcFailureWindow || 5 * 60 * 1000, // 5 minutes
      maxPortfolioHeat: config.maxPortfolioHeat || 80,
      minSolBalance: config.minSolBalance || 0.5,
      emergencyStopFile: config.emergencyStopFile || '.stop',
      checkIntervalMs: config.checkIntervalMs || 30000, // Check every 30 seconds
      paperTradingMode: config.paperTradingMode || false  // Skip balance checks in paper trading
    };
    
    // State tracking
    this.state = {
      isSafeToTrade: true,
      peakPortfolioValue: 0,
      currentDrawdown: 0,
      consecutiveLosses: 0,
      rpcFailures: [],
      portfolioHeat: 0,
      lastBalance: 0,
      emergencyStopActive: false,
      circuitBreakerTriggered: false,
      triggerReason: null
    };
    
    // Stats
    this.stats = {
      totalChecks: 0,
      warningsIssued: 0,
      circuitBreakersTriggered: 0,
      lastCheckTime: null
    };
    
    this.monitorInterval = null;
    
    logger.info('🛡️  Safety Monitor initialized');
    logger.info(`   Max Drawdown: ${this.config.maxDrawdownPercent}%`);
    logger.info(`   Max Consecutive Losses: ${this.config.maxConsecutiveLosses}`);
    logger.info(`   Max RPC Failures: ${this.config.maxRpcFailures} in ${this.config.rpcFailureWindow / 60000}min`);
    logger.info(`   Max Portfolio Heat: ${this.config.maxPortfolioHeat}%`);
    logger.info(`   Min SOL Balance: ${this.config.minSolBalance} SOL`);
    logger.info(`   Emergency Stop File: ${this.config.emergencyStopFile}`);
  }

  /**
   * Start safety monitoring
   */
  start() {
    if (this.monitorInterval) {
      logger.warn('Safety Monitor already running');
      return;
    }
    
    logger.info('🛡️  Safety Monitor started');
    
    // Run initial check
    this.checkSafety();
    
    // Start periodic checks
    this.monitorInterval = setInterval(() => {
      this.checkSafety();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop safety monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info('🛑 Safety Monitor stopped');
    }
  }

  /**
   * Comprehensive safety check
   */
  checkSafety() {
    this.stats.totalChecks++;
    this.stats.lastCheckTime = Date.now();
    
    try {
      // Check 1: Manual emergency stop file
      if (this.checkEmergencyStopFile()) {
        this.triggerCircuitBreaker('MANUAL_STOP', 'Emergency stop file detected');
        return false;
      }
      
      // Check 2: Drawdown limit
      if (this.state.currentDrawdown > this.config.maxDrawdownPercent) {
        this.triggerCircuitBreaker(
          'MAX_DRAWDOWN',
          `Drawdown ${this.state.currentDrawdown.toFixed(1)}% exceeds ${this.config.maxDrawdownPercent}%`
        );
        return false;
      }
      
      // Check 3: Consecutive losses
      if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        this.triggerCircuitBreaker(
          'CONSECUTIVE_LOSSES',
          `${this.state.consecutiveLosses} consecutive losses`
        );
        return false;
      }
      
      // Check 4: RPC failures
      this.cleanOldRpcFailures();
      if (this.state.rpcFailures.length >= this.config.maxRpcFailures) {
        this.triggerCircuitBreaker(
          'RPC_FAILURES',
          `${this.state.rpcFailures.length} RPC failures in ${this.config.rpcFailureWindow / 60000}min`
        );
        return false;
      }
      
      // Check 5: Portfolio heat
      if (this.state.portfolioHeat > this.config.maxPortfolioHeat) {
        this.stats.warningsIssued++;
        logger.warn(`⚠️  High portfolio heat: ${this.state.portfolioHeat.toFixed(1)}% (max: ${this.config.maxPortfolioHeat}%)`);
        // Don't trigger circuit breaker, just warn
      }
      
      // Check 6: Minimum balance (skip in paper trading mode)
      if (!this.config.paperTradingMode && this.state.lastBalance < this.config.minSolBalance) {
        this.triggerCircuitBreaker(
          'LOW_BALANCE',
          `Balance ${this.state.lastBalance.toFixed(4)} SOL below minimum ${this.config.minSolBalance} SOL`
        );
        return false;
      }
      
      // All checks passed
      if (!this.state.isSafeToTrade && !this.state.circuitBreakerTriggered) {
        logger.info('✅ Safety checks passed - trading re-enabled');
        this.state.isSafeToTrade = true;
      }
      
      return true;
      
    } catch (error) {
      logger.error('Error during safety check:', error);
      return this.state.isSafeToTrade; // Maintain current state on error
    }
  }

  /**
   * Check for emergency stop file
   */
  checkEmergencyStopFile() {
    try {
      const stopFilePath = path.join(process.cwd(), this.config.emergencyStopFile);
      const exists = fs.existsSync(stopFilePath);
      
      if (exists && !this.state.emergencyStopActive) {
        this.state.emergencyStopActive = true;
        return true;
      }
      
      if (!exists && this.state.emergencyStopActive) {
        this.state.emergencyStopActive = false;
        logger.info('🟢 Emergency stop file removed - system can resume');
      }
      
      return exists;
      
    } catch (error) {
      logger.debug('Error checking emergency stop file:', error.message);
      return false;
    }
  }

  /**
   * Trigger circuit breaker
   */
  triggerCircuitBreaker(reason, message) {
    if (this.state.circuitBreakerTriggered) {
      return; // Already triggered
    }
    
    this.state.isSafeToTrade = false;
    this.state.circuitBreakerTriggered = true;
    this.state.triggerReason = reason;
    this.stats.circuitBreakersTriggered++;
    
    logger.error('');
    logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.error('🚨 CIRCUIT BREAKER TRIGGERED 🚨');
    logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.error(`Reason: ${reason}`);
    logger.error(`Message: ${message}`);
    logger.error('');
    logger.error('⛔ TRADING STOPPED');
    logger.error('');
    logger.error('Actions required:');
    logger.error('1. Review logs and identify issue');
    logger.error('2. Close any open positions manually if needed');
    logger.error('3. Fix underlying problem');
    logger.error('4. Restart bot when ready');
    logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.error('');
    
    // Emit event for shutdown
    process.emit('CIRCUIT_BREAKER_TRIGGERED', { reason, message });
  }

  /**
   * Reset circuit breaker (manual reset after fixing issues)
   */
  resetCircuitBreaker() {
    logger.info('🔄 Resetting circuit breaker...');
    
    this.state.isSafeToTrade = true;
    this.state.circuitBreakerTriggered = false;
    this.state.triggerReason = null;
    this.state.consecutiveLosses = 0;
    this.state.rpcFailures = [];
    
    logger.info('✅ Circuit breaker reset - trading can resume');
  }

  /**
   * Update portfolio metrics
   */
  updatePortfolioMetrics(currentValue, totalCapital) {
    // Track peak value
    if (currentValue > this.state.peakPortfolioValue) {
      this.state.peakPortfolioValue = currentValue;
    }
    
    // Calculate drawdown
    if (this.state.peakPortfolioValue > 0) {
      this.state.currentDrawdown = ((this.state.peakPortfolioValue - currentValue) / this.state.peakPortfolioValue) * 100;
    }
    
    // Calculate portfolio heat (% of capital deployed)
    if (totalCapital > 0) {
      this.state.portfolioHeat = (currentValue / totalCapital) * 100;
    }
  }

  /**
   * Record trade result
   */
  recordTradeResult(isWin) {
    if (isWin) {
      this.state.consecutiveLosses = 0;
    } else {
      this.state.consecutiveLosses++;
      
      if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses - 1) {
        logger.warn(`⚠️  ${this.state.consecutiveLosses} consecutive losses - approaching limit`);
      }
    }
  }

  /**
   * Record RPC failure
   */
  recordRpcFailure() {
    this.state.rpcFailures.push(Date.now());
    this.cleanOldRpcFailures();
    
    if (this.state.rpcFailures.length >= this.config.maxRpcFailures - 2) {
      logger.warn(`⚠️  ${this.state.rpcFailures.length} RPC failures in last ${this.config.rpcFailureWindow / 60000}min`);
    }
  }

  /**
   * Clean old RPC failures outside the window
   */
  cleanOldRpcFailures() {
    const cutoff = Date.now() - this.config.rpcFailureWindow;
    this.state.rpcFailures = this.state.rpcFailures.filter(timestamp => timestamp > cutoff);
  }

  /**
   * Update SOL balance
   */
  updateBalance(balanceSOL) {
    this.state.lastBalance = balanceSOL;
    
    if (balanceSOL < this.config.minSolBalance) {
      logger.warn(`⚠️  Low balance: ${balanceSOL.toFixed(4)} SOL`);
    }
  }

  /**
   * Check if safe to trade
   */
  isSafeToTrade() {
    return this.state.isSafeToTrade && !this.state.circuitBreakerTriggered;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      ...this.state,
      config: this.config
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      isSafeToTrade: this.state.isSafeToTrade,
      circuitBreakerActive: this.state.circuitBreakerTriggered,
      currentDrawdown: this.state.currentDrawdown.toFixed(1) + '%',
      consecutiveLosses: this.state.consecutiveLosses,
      recentRpcFailures: this.state.rpcFailures.length,
      portfolioHeat: this.state.portfolioHeat.toFixed(1) + '%'
    };
  }

  /**
   * Log status
   */
  logStatus() {
    const stats = this.getStats();
    
    logger.info('🛡️  Safety Monitor Status:', {
      status: stats.isSafeToTrade ? '🟢 SAFE' : '🔴 UNSAFE',
      circuitBreaker: stats.circuitBreakerActive ? '🚨 TRIGGERED' : '✅ OK',
      drawdown: stats.currentDrawdown,
      consecutiveLosses: stats.consecutiveLosses + '/' + this.config.maxConsecutiveLosses,
      rpcFailures: stats.recentRpcFailures + '/' + this.config.maxRpcFailures,
      portfolioHeat: stats.portfolioHeat,
      totalChecks: stats.totalChecks,
      warnings: stats.warningsIssued
    });
  }
}

export default SafetyMonitor;

