import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Transaction Logger
 * Logs all transactions to a JSON file for history tracking and analysis
 */
export class TransactionLogger {
  constructor(logFilePath = './logs/transactions.json') {
    this.logFilePath = logFilePath;
    this.transactions = [];
    
    // Ensure log directory exists
    const logDir = path.dirname(this.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Load existing transactions
    this.loadTransactions();
    
    logger.info(`📝 Transaction Logger initialized (${this.transactions.length} historical transactions loaded)`);
  }

  /**
   * Load transactions from file
   */
  loadTransactions() {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const data = fs.readFileSync(this.logFilePath, 'utf8');
        this.transactions = JSON.parse(data);
      }
    } catch (error) {
      logger.error('Error loading transaction history:', error);
      this.transactions = [];
    }
  }

  /**
   * Save transactions to file
   */
  saveTransactions() {
    try {
      fs.writeFileSync(
        this.logFilePath,
        JSON.stringify(this.transactions, null, 2),
        'utf8'
      );
    } catch (error) {
      logger.error('Error saving transaction history:', error);
    }
  }

  /**
   * Log a transaction
   * @param {Object} transaction - Transaction details
   */
  logTransaction(transaction) {
    const txRecord = {
      id: transaction.signature || this.generateId(),
      timestamp: Date.now(),
      date: new Date().toISOString(),
      type: transaction.type, // 'buy' or 'sell'
      mode: transaction.mode || 'paper', // 'paper' or 'live'
      tokenAddress: transaction.tokenAddress,
      tokenSymbol: transaction.tokenSymbol,
      amountSOL: transaction.amountSOL,
      amountTokens: transaction.amountTokens,
      price: transaction.price,
      signature: transaction.signature || null,
      dex: transaction.dex || null,
      slippage: transaction.slippage || null,
      priceImpact: transaction.priceImpact || null,
      profitLoss: transaction.profitLoss || null,
      profitLossPercent: transaction.profitLossPercent || null,
      exitReason: transaction.exitReason || null,
      jitoTip: transaction.jitoTip || null,
      success: transaction.success !== false,
      error: transaction.error || null,
      solscanLink: transaction.signature 
        ? `https://solscan.io/tx/${transaction.signature}` 
        : null
    };
    
    this.transactions.push(txRecord);
    this.saveTransactions();
    
    logger.debug(`Transaction logged: ${txRecord.type} ${txRecord.tokenSymbol || txRecord.tokenAddress.slice(0, 8)}`);
    
    return txRecord;
  }

  /**
   * Get all transactions
   */
  getAllTransactions() {
    return this.transactions;
  }

  /**
   * Get transactions by token
   */
  getTransactionsByToken(tokenAddress) {
    return this.transactions.filter(tx => tx.tokenAddress === tokenAddress);
  }

  /**
   * Get transactions by type
   */
  getTransactionsByType(type) {
    return this.transactions.filter(tx => tx.type === type);
  }

  /**
   * Get transactions by mode
   */
  getTransactionsByMode(mode) {
    return this.transactions.filter(tx => tx.mode === mode);
  }

  /**
   * Get recent transactions
   */
  getRecentTransactions(limit = 10) {
    return this.transactions
      .slice(-limit)
      .reverse();
  }

  /**
   * Get transaction statistics
   */
  getStatistics(mode = null) {
    const txs = mode 
      ? this.transactions.filter(tx => tx.mode === mode)
      : this.transactions;
    
    const buys = txs.filter(tx => tx.type === 'buy');
    const sells = txs.filter(tx => tx.type === 'sell');
    const successfulTxs = txs.filter(tx => tx.success);
    const failedTxs = txs.filter(tx => !tx.success);
    
    const totalPnL = sells.reduce((sum, tx) => sum + (tx.profitLoss || 0), 0);
    const wins = sells.filter(tx => (tx.profitLoss || 0) > 0);
    const losses = sells.filter(tx => (tx.profitLoss || 0) < 0);
    
    const totalVolume = buys.reduce((sum, tx) => sum + (tx.amountSOL || 0), 0);
    
    return {
      total: txs.length,
      buys: buys.length,
      sells: sells.length,
      successful: successfulTxs.length,
      failed: failedTxs.length,
      successRate: txs.length > 0 
        ? (successfulTxs.length / txs.length * 100).toFixed(2) + '%'
        : '0.00%',
      totalPnL: totalPnL.toFixed(4) + ' SOL',
      wins: wins.length,
      losses: losses.length,
      winRate: sells.length > 0 
        ? (wins.length / sells.length * 100).toFixed(2) + '%'
        : '0.00%',
      avgWin: wins.length > 0
        ? (wins.reduce((sum, tx) => sum + tx.profitLoss, 0) / wins.length).toFixed(4) + ' SOL'
        : '0.0000 SOL',
      avgLoss: losses.length > 0
        ? (losses.reduce((sum, tx) => sum + tx.profitLoss, 0) / losses.length).toFixed(4) + ' SOL'
        : '0.0000 SOL',
      totalVolume: totalVolume.toFixed(4) + ' SOL',
      largestWin: wins.length > 0
        ? Math.max(...wins.map(tx => tx.profitLoss)).toFixed(4) + ' SOL'
        : '0.0000 SOL',
      largestLoss: losses.length > 0
        ? Math.min(...losses.map(tx => tx.profitLoss)).toFixed(4) + ' SOL'
        : '0.0000 SOL'
    };
  }

  /**
   * Get performance by day
   */
  getPerformanceByDay(days = 7) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const performance = [];
    
    for (let i = 0; i < days; i++) {
      const dayStart = now - (i + 1) * dayMs;
      const dayEnd = now - i * dayMs;
      
      const dayTxs = this.transactions.filter(tx => 
        tx.timestamp >= dayStart && tx.timestamp < dayEnd
      );
      
      const sells = dayTxs.filter(tx => tx.type === 'sell');
      const totalPnL = sells.reduce((sum, tx) => sum + (tx.profitLoss || 0), 0);
      
      performance.unshift({
        date: new Date(dayStart).toISOString().split('T')[0],
        transactions: dayTxs.length,
        trades: sells.length,
        pnl: totalPnL.toFixed(4) + ' SOL'
      });
    }
    
    return performance;
  }

  /**
   * Export transactions to CSV
   */
  exportToCSV(outputPath = './logs/transactions.csv') {
    try {
      const headers = [
        'Timestamp',
        'Type',
        'Mode',
        'Token',
        'Amount SOL',
        'Amount Tokens',
        'Price',
        'P&L',
        'P&L %',
        'DEX',
        'Signature'
      ].join(',');
      
      const rows = this.transactions.map(tx => [
        tx.date,
        tx.type,
        tx.mode,
        tx.tokenSymbol || tx.tokenAddress.slice(0, 16),
        tx.amountSOL || '',
        tx.amountTokens || '',
        tx.price || '',
        tx.profitLoss || '',
        tx.profitLossPercent || '',
        tx.dex || '',
        tx.signature || ''
      ].join(','));
      
      const csv = [headers, ...rows].join('\n');
      
      fs.writeFileSync(outputPath, csv, 'utf8');
      logger.info(`Transactions exported to ${outputPath}`);
      
      return outputPath;
      
    } catch (error) {
      logger.error('Error exporting to CSV:', error);
      throw error;
    }
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all transactions
   */
  clearAll() {
    this.transactions = [];
    this.saveTransactions();
    logger.info('All transaction history cleared');
  }

  /**
   * Log statistics to console
   */
  logStatistics(mode = null) {
    const stats = this.getStatistics(mode);
    
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`📊 TRANSACTION STATISTICS ${mode ? `(${mode.toUpperCase()})` : ''}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`Total Transactions: ${stats.total}`);
    logger.info(`Buys: ${stats.buys} | Sells: ${stats.sells}`);
    logger.info(`Success Rate: ${stats.successRate}`);
    logger.info(`Total P&L: ${stats.totalPnL}`);
    logger.info(`Win Rate: ${stats.winRate} (${stats.wins}W / ${stats.losses}L)`);
    logger.info(`Avg Win: ${stats.avgWin} | Avg Loss: ${stats.avgLoss}`);
    logger.info(`Largest Win: ${stats.largestWin} | Largest Loss: ${stats.largestLoss}`);
    logger.info(`Total Volume: ${stats.totalVolume}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

export default TransactionLogger;

