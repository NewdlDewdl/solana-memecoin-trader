/**
 * Strategy Issue Analysis
 *
 * Deep dive into what's causing losses despite profitable partial exits
 */

import fs from 'fs';

const TRADES_FILE = 'paper-trades.json';

console.log('🔍 ANALYZING STRATEGY ISSUES...\n');

const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
const allTrades = data.closedTrades;
const stats = data.stats;

// Separate partial exits from full exits
const partialExits = allTrades.filter(t => t.isPartialExit === true);
const fullExits = allTrades.filter(t => !t.isPartialExit);

console.log('════════════════════════════════════════════════════════════════');
console.log('📊 TRADE BREAKDOWN');
console.log('════════════════════════════════════════════════════════════════\n');

console.log(`Total Trades:        ${allTrades.length}`);
console.log(`  - Partial Exits:   ${partialExits.length} (${(partialExits.length / allTrades.length * 100).toFixed(1)}%)`);
console.log(`  - Full Exits:      ${fullExits.length} (${(fullExits.length / allTrades.length * 100).toFixed(1)}%)\n`);

// === ANALYSIS 1: What happens to positions AFTER partial exits? ===
console.log('════════════════════════════════════════════════════════════════');
console.log('🔍 ANALYSIS 1: POST-PARTIAL EXIT PERFORMANCE');
console.log('════════════════════════════════════════════════════════════════\n');

// Build a map of tokens that had partial exits
const partialExitTokens = new Map();
partialExits.forEach(t => {
  if (!partialExitTokens.has(t.tokenAddress)) {
    partialExitTokens.set(t.tokenAddress, []);
  }
  partialExitTokens.get(t.tokenAddress).push(t);
});

// Find full exits for tokens that previously had partial exits
const postPartialFullExits = fullExits.filter(t =>
  partialExitTokens.has(t.tokenAddress)
);

console.log(`Tokens with partial exits:     ${partialExitTokens.size}`);
console.log(`Full exits after partial:      ${postPartialFullExits.length}\n`);

if (postPartialFullExits.length > 0) {
  const postPartialWins = postPartialFullExits.filter(t => t.profitLoss > 0).length;
  const postPartialLosses = postPartialFullExits.filter(t => t.profitLoss <= 0).length;
  const postPartialWinRate = (postPartialWins / postPartialFullExits.length) * 100;
  const postPartialNetPnL = postPartialFullExits.reduce((sum, t) => sum + t.profitLoss, 0);

  console.log('Performance of remaining 50% after partial exit:');
  console.log(`  Win Rate:          ${postPartialWinRate.toFixed(1)}% (${postPartialWins}/${postPartialFullExits.length})`);
  console.log(`  Net P&L:           ${postPartialNetPnL >= 0 ? '+' : ''}${postPartialNetPnL.toFixed(4)} SOL\n`);

  // Exit reasons for post-partial positions
  const postPartialReasons = {};
  postPartialFullExits.forEach(t => {
    postPartialReasons[t.reason] = (postPartialReasons[t.reason] || 0) + 1;
  });

  console.log('Exit reasons for remaining 50%:');
  Object.entries(postPartialReasons)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count} (${(count / postPartialFullExits.length * 100).toFixed(1)}%)`);
    });
  console.log('');
}

// === ANALYSIS 2: Full exit performance (never got partial exit) ===
console.log('════════════════════════════════════════════════════════════════');
console.log('🔍 ANALYSIS 2: FULL EXIT PERFORMANCE (No partial exit)');
console.log('════════════════════════════════════════════════════════════════\n');

const neverPartialExits = fullExits.filter(t =>
  !partialExitTokens.has(t.tokenAddress)
);

console.log(`Positions that never reached partial exit: ${neverPartialExits.length}\n`);

if (neverPartialExits.length > 0) {
  const neverPartialWins = neverPartialExits.filter(t => t.profitLoss > 0).length;
  const neverPartialLosses = neverPartialExits.filter(t => t.profitLoss <= 0).length;
  const neverPartialWinRate = (neverPartialWins / neverPartialExits.length) * 100;
  const neverPartialNetPnL = neverPartialExits.reduce((sum, t) => sum + t.profitLoss, 0);

  console.log(`Win Rate:          ${neverPartialWinRate.toFixed(1)}% (${neverPartialWins}/${neverPartialExits.length})`);
  console.log(`Net P&L:           ${neverPartialNetPnL >= 0 ? '+' : ''}${neverPartialNetPnL.toFixed(4)} SOL\n`);

  // Exit reasons
  const neverPartialReasons = {};
  neverPartialExits.forEach(t => {
    neverPartialReasons[t.reason] = (neverPartialReasons[t.reason] || 0) + 1;
  });

  console.log('Exit reasons for positions that never reached +50%:');
  Object.entries(neverPartialReasons)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count} (${(count / neverPartialExits.length * 100).toFixed(1)}%)`);
    });
  console.log('');
}

// === ANALYSIS 3: Exit reason breakdown for all trades ===
console.log('════════════════════════════════════════════════════════════════');
console.log('🔍 ANALYSIS 3: OVERALL EXIT REASON BREAKDOWN');
console.log('════════════════════════════════════════════════════════════════\n');

const allReasons = {};
const reasonPnL = {};

allTrades.forEach(t => {
  allReasons[t.reason] = (allReasons[t.reason] || 0) + 1;
  reasonPnL[t.reason] = (reasonPnL[t.reason] || 0) + t.profitLoss;
});

console.log('Exit Reason          Count    %       Net P&L');
console.log('─────────────────────────────────────────────────────');
Object.entries(allReasons)
  .sort((a, b) => b[1] - a[1])
  .forEach(([reason, count]) => {
    const pct = (count / allTrades.length * 100).toFixed(1);
    const pnl = reasonPnL[reason];
    console.log(`${reason.padEnd(20)} ${String(count).padStart(3)}   ${String(pct + '%').padStart(5)}   ${(pnl >= 0 ? '+' : '')}${pnl.toFixed(4)} SOL`);
  });

console.log('');

// === ANALYSIS 4: P&L Attribution ===
console.log('════════════════════════════════════════════════════════════════');
console.log('🔍 ANALYSIS 4: P&L ATTRIBUTION');
console.log('════════════════════════════════════════════════════════════════\n');

const partialExitPnL = partialExits.reduce((sum, t) => sum + t.profitLoss, 0);
const postPartialPnL = postPartialFullExits.reduce((sum, t) => sum + t.profitLoss, 0);
const neverPartialPnL = neverPartialExits.reduce((sum, t) => sum + t.profitLoss, 0);

console.log(`Partial exits (first 50%):        ${partialExitPnL >= 0 ? '+' : ''}${partialExitPnL.toFixed(4)} SOL`);
console.log(`Remaining 50% (after partial):    ${postPartialPnL >= 0 ? '+' : ''}${postPartialPnL.toFixed(4)} SOL`);
console.log(`Never reached partial exit:       ${neverPartialPnL >= 0 ? '+' : ''}${neverPartialPnL.toFixed(4)} SOL`);
console.log(`─────────────────────────────────────────────────────`);
console.log(`Total Net P&L:                    ${(partialExitPnL + postPartialPnL + neverPartialPnL) >= 0 ? '+' : ''}${(partialExitPnL + postPartialPnL + neverPartialPnL).toFixed(4)} SOL\n`);

// === ANALYSIS 5: Top Winners and Losers ===
console.log('════════════════════════════════════════════════════════════════');
console.log('🔍 ANALYSIS 5: TOP WINNERS AND LOSERS');
console.log('════════════════════════════════════════════════════════════════\n');

const topWinners = allTrades
  .filter(t => t.profitLoss > 0)
  .sort((a, b) => b.profitLoss - a.profitLoss)
  .slice(0, 5);

const topLosers = allTrades
  .filter(t => t.profitLoss <= 0)
  .sort((a, b) => a.profitLoss - b.profitLoss)
  .slice(0, 5);

console.log('Top 5 Winners:');
topWinners.forEach((t, i) => {
  const partial = t.isPartialExit ? ' (PARTIAL)' : '';
  console.log(`  ${i + 1}. ${t.tokenSymbol}: +${t.profitLoss.toFixed(4)} SOL (+${t.profitLossPercent.toFixed(1)}%) | ${t.reason}${partial}`);
});

console.log('\nTop 5 Losers:');
topLosers.forEach((t, i) => {
  const partial = t.isPartialExit ? ' (PARTIAL)' : '';
  console.log(`  ${i + 1}. ${t.tokenSymbol}: ${t.profitLoss.toFixed(4)} SOL (${t.profitLossPercent.toFixed(1)}%) | ${t.reason}${partial}`);
});

console.log('\n');

// === SUMMARY & RECOMMENDATIONS ===
console.log('════════════════════════════════════════════════════════════════');
console.log('💡 KEY FINDINGS & RECOMMENDATIONS');
console.log('════════════════════════════════════════════════════════════════\n');

const findings = [];

// Finding 1: Post-partial performance
if (postPartialFullExits.length > 0) {
  const postPartialWinRate = (postPartialFullExits.filter(t => t.profitLoss > 0).length / postPartialFullExits.length) * 100;
  if (postPartialWinRate < 30) {
    findings.push(`❌ PROBLEM: Remaining 50% after partial exits has only ${postPartialWinRate.toFixed(1)}% win rate`);
    findings.push(`   → Most positions hit stop-loss after taking partial profit`);
    findings.push(`   → RECOMMENDATION: Tighten trailing stop or move stop-loss to breakeven after partial exit\n`);
  } else if (postPartialPnL < 0) {
    findings.push(`⚠️  ISSUE: Remaining 50% is losing money (${postPartialPnL.toFixed(4)} SOL)`);
    findings.push(`   → Partial exits are working, but we're giving back profits`);
    findings.push(`   → RECOMMENDATION: Implement breakeven stop after partial exit\n`);
  }
}

// Finding 2: Never reached partial
const neverPartialRate = neverPartialExits.length / allTrades.length * 100;
if (neverPartialRate > 70) {
  findings.push(`❌ MAJOR ISSUE: ${neverPartialRate.toFixed(1)}% of positions never reach +50% target`);
  findings.push(`   → Entry quality may be poor, or targets are too high`);
  findings.push(`   → RECOMMENDATION: Analyze entry filters or lower Tier 1 target to +40%\n`);
}

// Finding 3: Stop-loss dominance
const stopLossCount = allReasons['STOP_LOSS'] || 0;
const stopLossRate = (stopLossCount / allTrades.length) * 100;
if (stopLossRate > 40) {
  findings.push(`⚠️  HIGH STOP-LOSS RATE: ${stopLossRate.toFixed(1)}% of trades hit -25% stop-loss`);
  findings.push(`   → Either market is bearish or entry quality is poor`);
  findings.push(`   → RECOMMENDATION: Improve entry filters (higher safety score threshold)\n`);
}

// Finding 4: Profit factor
const profitFactor = stats.totalLoss > 0 ? stats.totalProfit / stats.totalLoss : 0;
if (profitFactor < 1.0) {
  findings.push(`📊 OVERALL: Profit factor ${profitFactor.toFixed(2)} < 1.0 (losing strategy)`);
  findings.push(`   → Wins: ${stats.totalProfit.toFixed(4)} SOL | Losses: ${stats.totalLoss.toFixed(4)} SOL`);
  findings.push(`   → RECOMMENDATION: Focus on reducing losses, not just capturing more wins\n`);
}

if (findings.length === 0) {
  findings.push('✅ No major issues found! Strategy is performing well.');
}

findings.forEach(f => console.log(f));

console.log('════════════════════════════════════════════════════════════════\n');
