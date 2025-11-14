/**
 * Phase 3 Only Analysis - Corrected
 * Only analyzes trades AFTER the baseline (trade #44+)
 */

import fs from 'fs';

const TRADES_FILE = 'paper-trades.json';
const BASELINE_TRADES = 43;

const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));

// Phase 3 trades only (after baseline)
const phase3Trades = data.closedTrades.slice(BASELINE_TRADES);

console.log('🔍 CORRECTED ANALYSIS - PHASE 3 ONLY');
console.log('════════════════════════════════════════════════════════════════\n');
console.log('Baseline trades (excluded):', BASELINE_TRADES);
console.log('Phase 3 trades (analyzing):', phase3Trades.length);
console.log('Total trades in file:', data.closedTrades.length);
console.log('');

// Separate partial and full exits in Phase 3
const partialExits = phase3Trades.filter(t => t.isPartialExit === true);
const fullExits = phase3Trades.filter(t => t.isPartialExit !== true);

console.log('PHASE 3 BREAKDOWN:');
console.log('  Partial exits:', partialExits.length);
console.log('  Full exits:', fullExits.length);
console.log('');

// Find tokens with partial exits
const partialExitTokens = new Map();
partialExits.forEach(t => {
  if (!partialExitTokens.has(t.tokenAddress)) {
    partialExitTokens.set(t.tokenAddress, []);
  }
  partialExitTokens.get(t.tokenAddress).push(t);
});

// Post-partial full exits
const postPartialFullExits = fullExits.filter(t => partialExitTokens.has(t.tokenAddress));

// Never partial exits
const neverPartialExits = fullExits.filter(t => !partialExitTokens.has(t.tokenAddress));

console.log('════════════════════════════════════════════════════════════════');
console.log('POST-PARTIAL EXIT PERFORMANCE:');
console.log('════════════════════════════════════════════════════════════════\n');
console.log('  Remaining 50% exits:', postPartialFullExits.length);
const postPartialWins = postPartialFullExits.filter(t => t.profitLoss > 0).length;
const postPartialPnL = postPartialFullExits.reduce((sum, t) => sum + t.profitLoss, 0);
console.log('  Win rate:', postPartialFullExits.length > 0 ? (postPartialWins / postPartialFullExits.length * 100).toFixed(1) + '%' : 'N/A');
console.log('  Net P&L:', (postPartialPnL >= 0 ? '+' : '') + postPartialPnL.toFixed(4), 'SOL');

// Exit reasons for post-partial
const postPartialReasons = {};
postPartialFullExits.forEach(t => {
  postPartialReasons[t.reason] = (postPartialReasons[t.reason] || 0) + 1;
});

console.log('\n  Exit reasons:');
Object.entries(postPartialReasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
  console.log('    ' + reason + ':', count, '(' + (count / postPartialFullExits.length * 100).toFixed(1) + '%)');
});
console.log('');

console.log('════════════════════════════════════════════════════════════════');
console.log('NEVER REACHED PARTIAL EXIT:');
console.log('════════════════════════════════════════════════════════════════\n');
console.log('  Count:', neverPartialExits.length);
console.log('  Percentage of Phase 3:', (neverPartialExits.length / phase3Trades.length * 100).toFixed(1) + '%');
const neverPartialWins = neverPartialExits.filter(t => t.profitLoss > 0).length;
const neverPartialPnL = neverPartialExits.reduce((sum, t) => sum + t.profitLoss, 0);
console.log('  Win rate:', neverPartialExits.length > 0 ? (neverPartialWins / neverPartialExits.length * 100).toFixed(1) + '%' : 'N/A');
console.log('  Net P&L:', (neverPartialPnL >= 0 ? '+' : '') + neverPartialPnL.toFixed(4), 'SOL');

// Exit reasons for never-partial
const neverPartialReasons = {};
neverPartialExits.forEach(t => {
  neverPartialReasons[t.reason] = (neverPartialReasons[t.reason] || 0) + 1;
});

console.log('\n  Exit reasons:');
Object.entries(neverPartialReasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
  console.log('    ' + reason + ':', count, '(' + (count / neverPartialExits.length * 100).toFixed(1) + '%)');
});
console.log('');

// P&L Attribution
const partialPnL = partialExits.reduce((sum, t) => sum + t.profitLoss, 0);
console.log('════════════════════════════════════════════════════════════════');
console.log('P&L ATTRIBUTION (Phase 3 only):');
console.log('════════════════════════════════════════════════════════════════\n');
console.log('  Partial exits (first 50%):', (partialPnL >= 0 ? '+' : '') + partialPnL.toFixed(4), 'SOL');
console.log('  Remaining 50%:', (postPartialPnL >= 0 ? '+' : '') + postPartialPnL.toFixed(4), 'SOL');
console.log('  Never partial:', (neverPartialPnL >= 0 ? '+' : '') + neverPartialPnL.toFixed(4), 'SOL');
console.log('  ──────────────────────────────────');
const phase3Total = partialPnL + postPartialPnL + neverPartialPnL;
console.log('  PHASE 3 TOTAL:', (phase3Total >= 0 ? '+' : '') + phase3Total.toFixed(4), 'SOL\n');

// Overall Phase 3 stats
const phase3Wins = phase3Trades.filter(t => t.profitLoss > 0).length;
const phase3WinRate = (phase3Wins / phase3Trades.length) * 100;
const phase3TotalProfit = phase3Trades.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
const phase3TotalLoss = Math.abs(phase3Trades.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
const phase3ProfitFactor = phase3TotalLoss > 0 ? phase3TotalProfit / phase3TotalLoss : 0;

console.log('════════════════════════════════════════════════════════════════');
console.log('OVERALL PHASE 3 PERFORMANCE:');
console.log('════════════════════════════════════════════════════════════════\n');
console.log('  Total trades:', phase3Trades.length);
console.log('  Wins / Losses:', phase3Wins, '/', phase3Trades.length - phase3Wins);
console.log('  Win rate:', phase3WinRate.toFixed(1) + '%');
console.log('  Profit factor:', phase3ProfitFactor.toFixed(2));
console.log('  Net P&L:', (phase3Total >= 0 ? '+' : '') + phase3Total.toFixed(4), 'SOL');
console.log('');

// Exit reasons in Phase 3
const reasons = {};
phase3Trades.forEach(t => {
  reasons[t.reason] = (reasons[t.reason] || 0) + 1;
});

console.log('EXIT REASONS (Phase 3):');
Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
  console.log('  ' + reason + ':', count, '(' + (count / phase3Trades.length * 100).toFixed(1) + '%)');
});
console.log('');

// KEY FINDINGS
console.log('════════════════════════════════════════════════════════════════');
console.log('💡 KEY FINDINGS:');
console.log('════════════════════════════════════════════════════════════════\n');

const neverPartialRate = (neverPartialExits.length / phase3Trades.length) * 100;

if (neverPartialRate > 70) {
  console.log(`❌ MAJOR ISSUE: ${neverPartialRate.toFixed(1)}% never reach +50% target`);
} else if (neverPartialRate > 50) {
  console.log(`⚠️  ISSUE: ${neverPartialRate.toFixed(1)}% never reach +50% target`);
} else {
  console.log(`✅ GOOD: Only ${neverPartialRate.toFixed(1)}% never reach +50% target`);
}

if (phase3ProfitFactor > 1.0) {
  console.log(`✅ PROFITABLE: Phase 3 profit factor ${phase3ProfitFactor.toFixed(2)} > 1.0`);
} else {
  console.log(`❌ LOSING: Phase 3 profit factor ${phase3ProfitFactor.toFixed(2)} < 1.0`);
}

if (partialPnL > 0) {
  console.log(`✅ Partial exits are profitable: +${partialPnL.toFixed(4)} SOL`);
} else {
  console.log(`❌ Partial exits are losing: ${partialPnL.toFixed(4)} SOL`);
}

if (postPartialPnL > 0) {
  console.log(`✅ Remaining 50% is profitable: +${postPartialPnL.toFixed(4)} SOL`);
} else if (postPartialPnL < -0.01) {
  console.log(`❌ Remaining 50% is losing significantly: ${postPartialPnL.toFixed(4)} SOL`);
} else {
  console.log(`⚠️  Remaining 50% is slightly negative: ${postPartialPnL.toFixed(4)} SOL`);
}

console.log('\n════════════════════════════════════════════════════════════════\n');
