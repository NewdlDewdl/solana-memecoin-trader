import TransactionLogger from './src/database/transactionLogger.js';
import PaperTradingManager from './src/paperTrading/paperTradingManager.js';
import { logger } from './src/utils/logger.js';
import fs from 'fs';

/**
 * Trading Dashboard
 * Shows comprehensive trading metrics for both paper and live trading
 */
async function showDashboard() {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 SOLANA MEMECOIN TRADER DASHBOARD');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    // Initialize transaction logger
    const txLogger = new TransactionLogger();
    
    // Get overall statistics
    const allStats = txLogger.getStatistics();
    const paperStats = txLogger.getStatistics('paper');
    const liveStats = txLogger.getStatistics('live');
    
    // Display Overall Statistics
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 OVERALL STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Transactions: ${allStats.total}`);
    console.log(`  Buys: ${allStats.buys} | Sells: ${allStats.sells}`);
    console.log(`Success Rate: ${allStats.successRate}`);
    console.log(`Total P&L: ${allStats.totalPnL}`);
    console.log(`Win Rate: ${allStats.winRate} (${allStats.wins}W / ${allStats.losses}L)`);
    console.log(`Avg Win: ${allStats.avgWin} | Avg Loss: ${allStats.avgLoss}`);
    console.log(`Total Volume: ${allStats.totalVolume}`);
    console.log('');
    
    // Display Paper Trading Statistics
    if (parseInt(paperStats.total) > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 PAPER TRADING STATISTICS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Transactions: ${paperStats.total}`);
      console.log(`  Buys: ${paperStats.buys} | Sells: ${paperStats.sells}`);
      console.log(`P&L: ${paperStats.totalPnL}`);
      console.log(`Win Rate: ${paperStats.winRate}`);
      console.log(`Largest Win: ${paperStats.largestWin} | Largest Loss: ${paperStats.largestLoss}`);
      console.log('');
    }
    
    // Display Live Trading Statistics
    if (parseInt(liveStats.total) > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔴 LIVE TRADING STATISTICS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`⚠️  REAL MONEY TRADED`);
      console.log(`Transactions: ${liveStats.total}`);
      console.log(`  Buys: ${liveStats.buys} | Sells: ${liveStats.sells}`);
      console.log(`Success Rate: ${liveStats.successRate}`);
      console.log(`Real P&L: ${liveStats.totalPnL}`);
      console.log(`Win Rate: ${liveStats.winRate} (${liveStats.wins}W / ${liveStats.losses}L)`);
      console.log(`Avg Win: ${liveStats.avgWin} | Avg Loss: ${liveStats.avgLoss}`);
      console.log(`Largest Win: ${liveStats.largestWin} | Largest Loss: ${liveStats.largestLoss}`);
      console.log(`Total Volume: ${liveStats.totalVolume}`);
      console.log('');
    }
    
    // Display Recent Transactions
    const recentTxs = txLogger.getRecentTransactions(10);
    
    if (recentTxs.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🕐 RECENT TRANSACTIONS (Last 10)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      recentTxs.forEach((tx, i) => {
        const icon = tx.type === 'buy' ? '🟢' : '🔴';
        const mode = tx.mode === 'live' ? '💰' : '📝';
        const token = tx.tokenSymbol || tx.tokenAddress.slice(0, 8);
        const pnl = tx.profitLoss ? ` | P&L: ${tx.profitLoss > 0 ? '+' : ''}${tx.profitLoss.toFixed(4)} SOL` : '';
        
        console.log(`${i + 1}. ${icon}${mode} ${tx.type.toUpperCase()} ${token} | ${tx.amountSOL} SOL${pnl}`);
        
        if (tx.solscanLink) {
          console.log(`   ${tx.solscanLink}`);
        }
      });
      console.log('');
    }
    
    // Display Performance by Day
    const perfByDay = txLogger.getPerformanceByDay(7);
    
    if (perfByDay.some(day => day.transactions > 0)) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📅 PERFORMANCE BY DAY (Last 7 Days)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      perfByDay.forEach(day => {
        if (day.transactions > 0) {
          const pnlValue = parseFloat(day.pnl);
          const pnlIcon = pnlValue > 0 ? '📈' : pnlValue < 0 ? '📉' : '➖';
          console.log(`${day.date}: ${pnlIcon} ${day.pnl} | ${day.trades} trades | ${day.transactions} txs`);
        }
      });
      console.log('');
    }
    
    // Check for emergency stop file
    const stopFilePath = '.stop';
    if (fs.existsSync(stopFilePath)) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  EMERGENCY STOP ACTIVE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Emergency stop file detected. Bot will not trade until removed.');
      console.log(`Run: rm ${stopFilePath}`);
      console.log('');
    }
    
    // Trading Mode
    const tradingMode = process.env.TRADING_MODE || 'paper';
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚙️  CONFIGURATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Trading Mode: ${tradingMode.toUpperCase()}`);
    
    if (tradingMode === 'live') {
      console.log(`Max Position Size: ${process.env.MAX_POSITION_SIZE_SOL || '0.1'} SOL`);
      console.log(`Slippage: ${(parseInt(process.env.SLIPPAGE_BPS || '100') / 100)}%`);
      console.log(`Jupiter: ${process.env.JUPITER_ENABLED !== 'false' ? '✅' : '❌'}`);
      console.log(`Jito MEV Protection: ${process.env.JITO_ENABLED !== 'false' ? '✅' : '❌'}`);
    }
    
    if (process.env.PAPER_TRADING_ENABLED === 'true') {
      console.log(`Paper Trading Balance: ${process.env.PAPER_TRADING_STARTING_BALANCE || '10'} SOL`);
    }
    
    console.log('');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ DASHBOARD COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Commands:');
    console.log('  node show-trading-dashboard.js    - Show this dashboard');
    console.log('  node show-paper-trading-balance.js - Show paper trading balance');
    console.log('  ./trade-stats.sh                   - Show quick statistics');
    console.log('  touch .stop                        - Emergency stop');
    console.log('');
    
  } catch (error) {
    console.error('Error displaying dashboard:', error);
    process.exit(1);
  }
}

// Run dashboard
showDashboard()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

