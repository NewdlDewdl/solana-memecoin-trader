/**
 * Paper Trading Manager
 * 
 * Simulates trading with fake balance for testing strategies
 * without risking real money
 */

import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

class PaperTradingManager {
  constructor(startingBalance = 10, reportIntervalMs = 120000) {
    this.startingBalance = startingBalance;
    this.balance = startingBalance; // SOL
    this.positions = new Map(); // tokenAddress -> position
    this.closedTrades = [];
    this.stats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      totalLoss: 0,
      largestWin: 0,
      largestLoss: 0,
    };

    this.tradesFile = 'paper-trades.json';
    this.loadTrades();

    // Start periodic performance reports
    this.reportInterval = setInterval(() => {
      this.logPerformanceReport();
    }, reportIntervalMs);

    logger.info(`📝 Paper Trading initialized with ${startingBalance} SOL`);
  }

  /**
   * Load previous trades from file
   */
  loadTrades() {
    try {
      if (fs.existsSync(this.tradesFile)) {
        const data = JSON.parse(fs.readFileSync(this.tradesFile, 'utf8'));
        this.closedTrades = data.closedTrades || [];
        this.stats = data.stats || this.stats;
        logger.info(`Loaded ${this.closedTrades.length} previous paper trades`);
      }
    } catch (error) {
      logger.error('Error loading paper trades:', error);
    }
  }

  /**
   * Save trades to file
   */
  saveTrades() {
    try {
      const data = {
        closedTrades: this.closedTrades,
        stats: this.stats,
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(this.tradesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Error saving paper trades:', error);
    }
  }

  /**
   * Simulate buying a token
   */
  async simulateBuy(tokenAddress, tokenSymbol, priceInSol, amountSol) {
    // Check if we have enough balance
    if (amountSol > this.balance) {
      logger.warn(`[PAPER] Insufficient balance. Have: ${this.balance.toFixed(4)} SOL, Need: ${amountSol.toFixed(4)} SOL`);
      return null;
    }

    // Check if we already have a position
    if (this.positions.has(tokenAddress)) {
      logger.warn(`[PAPER] Already have position in ${tokenSymbol}`);
      return null;
    }

    // Calculate tokens received
    const tokensReceived = amountSol / priceInSol;
    
    // Deduct from balance
    this.balance -= amountSol;

    // Create position
    const position = {
      tokenAddress,
      tokenSymbol,
      entryPrice: priceInSol,
      entryTime: Date.now(),
      amountSol,
      tokensHeld: tokensReceived,
      currentPrice: priceInSol,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
    };

    this.positions.set(tokenAddress, position);

    logger.info(`💰 [PAPER BUY] ${tokenSymbol} | ${amountSol.toFixed(4)} SOL @ ${priceInSol.toFixed(8)} SOL/token | ${tokensReceived.toFixed(2)} tokens`);
    logger.info(`📊 [PAPER] Balance: ${this.balance.toFixed(4)} SOL | Open Positions: ${this.positions.size}`);

    return position;
  }

  /**
   * Simulate selling a token (PHASE 3: supports partial exits)
   */
  async simulateSell(tokenAddress, tokenSymbol, priceInSol, reason = 'manual', percentToSell = 1.0) {
    const position = this.positions.get(tokenAddress);

    if (!position) {
      logger.warn(`[PAPER] No position found for ${tokenSymbol}`);
      return null;
    }

    // PHASE 3: Calculate amount to sell (partial or full)
    const amountToSell = position.amountSol * percentToSell;
    const tokensToSell = position.tokensHeld * percentToSell;
    const proceeds = tokensToSell * priceInSol;

    // Calculate P&L on sold portion
    const profitLoss = proceeds - amountToSell;
    const profitLossPercent = (profitLoss / amountToSell) * 100;

    // Add proceeds to balance
    this.balance += proceeds;

    // PHASE 3: Track original investment for closed trade recording
    if (!position.originalAmountSol) {
      position.originalAmountSol = position.amountSol;
    }

    // PHASE 3 FIX: Always record trades (both partial and full exits)
    const trade = {
      tokenAddress,
      tokenSymbol,
      entryPrice: position.entryPrice,
      exitPrice: priceInSol,
      entryTime: position.entryTime,
      exitTime: Date.now(),
      holdTime: Date.now() - position.entryTime,
      amountSol: amountToSell,  // Record actual amount sold
      proceedsSol: proceeds,
      profitLoss,
      profitLossPercent,
      reason,
      isPartialExit: percentToSell < 1.0,  // NEW: Track if partial
      percentSold: percentToSell * 100,    // NEW: Track percentage sold
    };

    // Always record the trade
    this.closedTrades.push(trade);

    // Always update stats (for both partial and full exits)
    this.stats.totalTrades++;
    if (profitLoss > 0) {
      this.stats.wins++;
      this.stats.totalProfit += profitLoss;
      if (profitLoss > this.stats.largestWin) {
        this.stats.largestWin = profitLoss;
      }
    } else {
      this.stats.losses++;
      this.stats.totalLoss += Math.abs(profitLoss);
      if (profitLoss < this.stats.largestLoss) {
        this.stats.largestLoss = profitLoss;
      }
    }

    // PHASE 3: Update or close position
    if (percentToSell >= 1.0) {
      // Full exit - close position
      this.positions.delete(tokenAddress);
    } else {
      // Partial exit - update position
      position.amountSol -= amountToSell;
      position.tokensHeld -= tokensToSell;

      // Track which tiers have been sold (PHASE 3)
      if (reason.includes('TIER_1')) {
        position.tier1Sold = true;
      } else if (reason.includes('TIER_2')) {
        position.tier2Sold = true;
      }
    }

    // Enhanced logging with win/loss highlighting
    const isWin = profitLoss >= 0;
    const isBigWin = profitLossPercent >= 30;  // 30%+ gain
    const isBigLoss = profitLossPercent <= -20; // 20%+ loss
    const sellType = percentToSell >= 1.0 ? 'SELL' : 'PARTIAL SELL';

    logger.info(`💵 [PAPER ${sellType}] ${tokenSymbol} | ${proceeds.toFixed(4)} SOL @ ${priceInSol.toFixed(8)} SOL/token | Sold: ${(percentToSell * 100).toFixed(0)}%`);

    // Highlight big winners and losers (show full token address for easy lookup)
    if (isBigWin) {
      logger.info(`🎉 BIG WIN! Token: ${tokenAddress} | P&L: +${profitLoss.toFixed(4)} SOL (+${profitLossPercent.toFixed(1)}%) | Reason: ${reason}`);
      logger.info(`   📊 View on Solscan: https://solscan.io/token/${tokenAddress}`);
    } else if (isBigLoss) {
      logger.warn(`💥 BIG LOSS! Token: ${tokenAddress} | P&L: ${profitLoss.toFixed(4)} SOL (${profitLossPercent.toFixed(1)}%) | Reason: ${reason}`);
      logger.warn(`   📊 View on Solscan: https://solscan.io/token/${tokenAddress}`);
    } else if (isWin) {
      logger.info(`✅ WIN: P&L: +${profitLoss.toFixed(4)} SOL (+${profitLossPercent.toFixed(1)}%) | Reason: ${reason}`);
    } else {
      logger.info(`❌ LOSS: P&L: ${profitLoss.toFixed(4)} SOL (${profitLossPercent.toFixed(1)}%) | Reason: ${reason}`);
    }

    logger.info(`📊 [PAPER] Balance: ${this.balance.toFixed(4)} SOL | Open Positions: ${this.positions.size}`);

    // PHASE 3 FIX: Always save trades (including partial exits)
    this.saveTrades();

    return trade;
  }

  /**
   * Update position with current price
   */
  updatePosition(tokenAddress, currentPrice) {
    const position = this.positions.get(tokenAddress);
    if (!position) return;

    position.currentPrice = currentPrice;
    const currentValue = position.tokensHeld * currentPrice;
    position.unrealizedPnL = currentValue - position.amountSol;
    position.unrealizedPnLPercent = ((currentValue - position.amountSol) / position.amountSol) * 100;

    this.positions.set(tokenAddress, position);
  }

  /**
   * Get current portfolio value
   */
  getPortfolioValue() {
    let positionsValue = 0;
    for (const position of this.positions.values()) {
      positionsValue += position.tokensHeld * position.currentPrice;
    }
    return this.balance + positionsValue;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const portfolioValue = this.getPortfolioValue();
    const totalPnL = portfolioValue - this.startingBalance;
    const totalPnLPercent = ((portfolioValue - this.startingBalance) / this.startingBalance) * 100;
    
    const winRate = this.stats.totalTrades > 0 
      ? (this.stats.wins / this.stats.totalTrades) * 100 
      : 0;

    const avgWin = this.stats.wins > 0 ? this.stats.totalProfit / this.stats.wins : 0;
    const avgLoss = this.stats.losses > 0 ? this.stats.totalLoss / this.stats.losses : 0;
    const profitFactor = this.stats.totalLoss > 0 ? this.stats.totalProfit / this.stats.totalLoss : 0;

    return {
      startingBalance: this.startingBalance,
      currentBalance: this.balance,
      portfolioValue,
      totalPnL,
      totalPnLPercent,
      openPositions: this.positions.size,
      totalTrades: this.stats.totalTrades,
      wins: this.stats.wins,
      losses: this.stats.losses,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      largestWin: this.stats.largestWin,
      largestLoss: this.stats.largestLoss,
      closedTrades: this.stats.totalTrades - this.positions.size
    };
  }

  /**
   * Log detailed performance report
   */
  logPerformanceReport() {
    const summary = this.getPerformanceSummary();
    
    // Skip if no trades yet
    if (summary.totalTrades === 0) {
      return;
    }

    logger.info('');
    logger.info('════════════════════════════════════════════════════════════════');
    logger.info('📊 PAPER TRADING PERFORMANCE REPORT');
    logger.info('════════════════════════════════════════════════════════════════');
    logger.info('');
    logger.info(`💰 Balance: ${summary.currentBalance.toFixed(4)} SOL (Started: ${summary.startingBalance.toFixed(4)} SOL)`);
    logger.info(`📈 Total P&L: ${summary.totalPnL >= 0 ? '+' : ''}${summary.totalPnL.toFixed(4)} SOL (${summary.totalPnLPercent >= 0 ? '+' : ''}${summary.totalPnLPercent.toFixed(2)}%)`);
    logger.info(`💼 Portfolio Value: ${summary.portfolioValue.toFixed(4)} SOL`);
    logger.info('');
    logger.info(`📊 Trading Stats:`);
    logger.info(`   Total Trades: ${summary.totalTrades} (${summary.closedTrades} closed, ${summary.openPositions} open)`);
    logger.info(`   Wins: ${summary.wins} | Losses: ${summary.losses}`);
    logger.info(`   Win Rate: ${summary.winRate.toFixed(1)}%`);
    logger.info('');
    
    if (summary.wins > 0 || summary.losses > 0) {
      logger.info(`💵 P&L Details:`);
      if (summary.wins > 0) {
        logger.info(`   Avg Win: +${summary.avgWin.toFixed(4)} SOL`);
      }
      if (summary.losses > 0) {
        logger.info(`   Avg Loss: ${summary.avgLoss.toFixed(4)} SOL`);
      }
      if (summary.profitFactor > 0) {
        logger.info(`   Profit Factor: ${summary.profitFactor.toFixed(2)}`);
      }
      logger.info('');
    }

    // Highlight best and worst trades
    if (summary.largestWin > 0) {
      logger.info(`🏆 Biggest Win: +${summary.largestWin.toFixed(4)} SOL (+${(summary.largestWin / 0.01 * 100).toFixed(1)}%)`);
    }
    if (summary.largestLoss < 0) {
      logger.info(`💔 Biggest Loss: ${summary.largestLoss.toFixed(4)} SOL (${(summary.largestLoss / 0.01 * 100).toFixed(1)}%)`);
    }
    
    logger.info('════════════════════════════════════════════════════════════════');
    logger.info('');
  }

  /**
   * Print performance report
   */
  printReport() {
    const summary = this.getPerformanceSummary();
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 PAPER TRADING PERFORMANCE REPORT');
    console.log('='.repeat(80));
    
    console.log('\n💰 Portfolio:');
    console.log(`  Starting Balance:    ${summary.startingBalance.toFixed(4)} SOL`);
    console.log(`  Current Balance:     ${summary.currentBalance.toFixed(4)} SOL`);
    console.log(`  Portfolio Value:     ${summary.portfolioValue.toFixed(4)} SOL`);
    console.log(`  Total P&L:           ${summary.totalPnL >= 0 ? '+' : ''}${summary.totalPnL.toFixed(4)} SOL (${summary.totalPnLPercent >= 0 ? '+' : ''}${summary.totalPnLPercent.toFixed(2)}%)`);
    
    console.log('\n📈 Positions:');
    console.log(`  Open Positions:      ${summary.openPositions}`);
    if (this.positions.size > 0) {
      for (const [addr, pos] of this.positions) {
        const holdTimeMin = Math.floor((Date.now() - pos.entryTime) / 60000);
        console.log(`    • ${pos.tokenSymbol}: ${pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(4)} SOL (${pos.unrealizedPnLPercent >= 0 ? '+' : ''}${pos.unrealizedPnLPercent.toFixed(2)}%) [${holdTimeMin}m]`);
      }
    }
    
    console.log('\n🎯 Trading Stats:');
    console.log(`  Total Trades:        ${summary.totalTrades}`);
    console.log(`  Wins:                ${summary.wins} (${summary.winRate.toFixed(1)}%)`);
    console.log(`  Losses:              ${summary.losses}`);
    console.log(`  Avg Win:             +${summary.avgWin.toFixed(4)} SOL`);
    console.log(`  Avg Loss:            -${summary.avgLoss.toFixed(4)} SOL`);
    console.log(`  Profit Factor:       ${summary.profitFactor.toFixed(2)}x`);
    console.log(`  Largest Win:         +${summary.largestWin.toFixed(4)} SOL`);
    console.log(`  Largest Loss:        ${summary.largestLoss.toFixed(4)} SOL`);
    
    if (this.closedTrades.length > 0) {
      console.log('\n📜 Recent Trades (Last 5):');
      const recentTrades = this.closedTrades.slice(-5).reverse();
      for (const trade of recentTrades) {
        const holdTimeMin = Math.floor(trade.holdTime / 60000);
        const pnlStr = trade.profitLoss >= 0 ? '+' : '';
        console.log(`    ${trade.profitLoss >= 0 ? '✓' : '✗'} ${trade.tokenSymbol}: ${pnlStr}${trade.profitLoss.toFixed(4)} SOL (${pnlStr}${trade.profitLossPercent.toFixed(2)}%) [${holdTimeMin}m] - ${trade.reason}`);
      }
    }
    
    console.log('\n' + '='.repeat(80) + '\n');
  }

  /**
   * Get all positions
   */
  getPositions() {
    return Array.from(this.positions.values());
  }

  /**
   * Check if we have a position
   */
  hasPosition(tokenAddress) {
    return this.positions.has(tokenAddress);
  }

  /**
   * Get position
   */
  getPosition(tokenAddress) {
    return this.positions.get(tokenAddress);
  }

  /**
   * Get available balance
   */
  getAvailableBalance() {
    return this.balance;
  }
}

export default PaperTradingManager;

