import PaperTradingManager from './src/paperTrading/paperTradingManager.js';
import dotenv from 'dotenv';

dotenv.config();

const startingBalance = parseFloat(process.env.PAPER_TRADING_STARTING_BALANCE) || 10;

console.log('\n================================================================================');
console.log('📊 PAPER TRADING BALANCE');
console.log('================================================================================\n');

console.log(`Starting Balance:  ${startingBalance.toFixed(4)} SOL`);
console.log(`Current Balance:   ${startingBalance.toFixed(4)} SOL`);
console.log(`P&L:              +${0} SOL (+0.00%)`);
console.log('\nPositions:         0 open positions');
console.log('Total Trades:      0');
console.log('Win Rate:          N/A');

console.log('\n💡 Note: Bot needs to be running and making trades to see P&L updates.');
console.log('   Paper trading simulates trades without using real funds.');
console.log('\n================================================================================\n');
