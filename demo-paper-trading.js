#!/usr/bin/env node

/**
 * Paper Trading Demo
 * 
 * Demonstrates the enhanced paper trading features with simulated trades
 */

import PaperTradingManager from './src/paperTrading/paperTradingManager.js';
import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('\n' + '='.repeat(80));
console.log('🎮 PAPER TRADING DEMO');
console.log('='.repeat(80) + '\n');

async function demo() {
  // Initialize paper trading with 10 SOL
  const paperTrader = new PaperTradingManager(10);
  
  console.log('Starting paper trading simulation...\n');
  
  // Simulate discovering a new token
  console.log('📊 Scenario: New token "DOGE2" launches\n');
  
  // Simulate buy
  console.log('[1] Bot decides to buy...');
  const position1 = await paperTrader.simulateBuy(
    'TokenAddress1xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'DOGE2',
    0.00001,  // Price: 0.00001 SOL per token
    0.5       // Buy 0.5 SOL worth
  );
  
  console.log('\n⏱️  Time passes... price moves up 50%\n');
  
  // Update position with new price
  paperTrader.updatePosition(position1.tokenAddress, 0.000015);
  
  console.log('[2] Checking unrealized P&L...');
  const pos = paperTrader.getPosition(position1.tokenAddress);
  console.log(`    Current P&L: +${pos.unrealizedPnL.toFixed(4)} SOL (+${pos.unrealizedPnLPercent.toFixed(2)}%)\n`);
  
  // Simulate sell (take profit)
  console.log('[3] Bot decides to sell (take profit at +50%)...');
  await paperTrader.simulateSell(
    position1.tokenAddress,
    'DOGE2',
    0.000015,
    'take_profit'
  );
  
  console.log('\n━'.repeat(80));
  console.log('\n📊 Scenario: Another token "PEPE3" launches\n');
  
  // Simulate another trade (this one loses)
  console.log('[4] Bot buys PEPE3...');
  const position2 = await paperTrader.simulateBuy(
    'TokenAddress2xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'PEPE3',
    0.00002,
    1.0  // Buy 1 SOL worth
  );
  
  console.log('\n⏱️  Time passes... price drops 30%\n');
  
  // Update and sell at a loss
  paperTrader.updatePosition(position2.tokenAddress, 0.000014);
  
  console.log('[5] Bot triggers stop-loss...');
  await paperTrader.simulateSell(
    position2.tokenAddress,
    'PEPE3',
    0.000014,
    'stop_loss'
  );
  
  console.log('\n━'.repeat(80));
  console.log('\n📊 Scenario: Third token "SHIB4" - holding position\n');
  
  // One more position that we'll keep open
  console.log('[6] Bot buys SHIB4...');
  const position3 = await paperTrader.simulateBuy(
    'TokenAddress3xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'SHIB4',
    0.00003,
    0.3
  );
  
  console.log('\n⏱️  Price moves up slightly (+10%)\n');
  paperTrader.updatePosition(position3.tokenAddress, 0.000033);
  
  console.log('[7] Keeping position open...\n');
  
  // Print final report
  paperTrader.printReport();
  
  console.log('✅ Demo complete!\n');
  console.log('💡 This shows how the bot will track your paper trades in real-time.');
  console.log('   All trades are saved to paper-trades.json for later review.\n');
}

demo().catch(console.error);

