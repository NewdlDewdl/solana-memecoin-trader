/**
 * Phase 4 Performance Monitor
 *
 * Tracks improvements from:
 * - Lowering Tier 1 from +50% to +40%
 * - Raising safety score from 60 to 70
 */

import fs from 'fs';

const TRADES_FILE = 'paper-trades.json';
const PHASE4_BASELINE = 121; // Trade count when Phase 4 started
const TARGET_TRADES = 30; // Collect 30 Phase 4 trades
const CHECK_INTERVAL_MS = 60000; // Check every minute
const REPORT_FILE = 'phase4-analysis-report.txt';

let lastTradeCount = PHASE4_BASELINE;

console.log('🔍 Phase 4 Monitor Started');
console.log('📊 Changes:');
console.log('   - Tier 1 target: +50% → +40%');
console.log('   - Safety score: 60 → 70');
console.log(`🎯 Baseline: ${PHASE4_BASELINE} trades`);
console.log(`🎯 Target: ${PHASE4_BASELINE + TARGET_TRADES} trades (${TARGET_TRADES} new)\n`);

function analyze() {
  try {
    if (!fs.existsSync(TRADES_FILE)) {
      console.log('❌ paper-trades.json not found');
      return;
    }

    const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    const totalTrades = data.stats.totalTrades;
    const newTrades = totalTrades - PHASE4_BASELINE;

    const allTrades = data.closedTrades;
    const phase4Trades = allTrades.slice(PHASE4_BASELINE);

    // Progress update
    if (totalTrades !== lastTradeCount) {
      const partialExits = phase4Trades.filter(t => t.isPartialExit === true);
      const tier1 = partialExits.filter(t => t.reason && t.reason.includes('TIER_1'));
      const tier2 = partialExits.filter(t => t.reason && t.reason.includes('TIER_2'));

      console.log(`📈 Progress: ${newTrades}/${TARGET_TRADES} Phase 4 trades - ${new Date().toLocaleTimeString()}`);
      console.log(`   Partial exits: ${partialExits.length} (Tier 1: ${tier1.length}, Tier 2: ${tier2.length})`);

      lastTradeCount = totalTrades;
    }

    // Check if target reached
    if (newTrades >= TARGET_TRADES) {
      console.log('\n🎉 TARGET REACHED! Generating Phase 4 analysis...\n');
      generateReport(data, phase4Trades);
      process.exit(0);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

function generateReport(data, phase4Trades) {
  const BASELINE_TRADES = 43; // Original baseline before any phases
  const PHASE3_START = BASELINE_TRADES;
  const PHASE4_START = PHASE4_BASELINE;

  // Separate partial and full exits
  const partialExits = phase4Trades.filter(t => t.isPartialExit === true);
  const fullExits = phase4Trades.filter(t => !t.isPartialExit);

  // Build partial exit token map
  const partialExitTokens = new Map();
  partialExits.forEach(t => {
    if (!partialExitTokens.has(t.tokenAddress)) {
      partialExitTokens.set(t.tokenAddress, []);
    }
    partialExitTokens.get(t.tokenAddress).push(t);
  });

  // Post-partial and never-partial
  const postPartialFullExits = fullExits.filter(t => partialExitTokens.has(t.tokenAddress));
  const neverPartialExits = fullExits.filter(t => !partialExitTokens.has(t.tokenAddress));

  // Calculate metrics
  const phase4Wins = phase4Trades.filter(t => t.profitLoss > 0).length;
  const phase4WinRate = (phase4Wins / phase4Trades.length) * 100;
  const phase4TotalProfit = phase4Trades.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
  const phase4TotalLoss = Math.abs(phase4Trades.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
  const phase4ProfitFactor = phase4TotalLoss > 0 ? phase4TotalProfit / phase4TotalLoss : 0;
  const phase4NetPnL = phase4TotalProfit - phase4TotalLoss;

  const partialPnL = partialExits.reduce((sum, t) => sum + t.profitLoss, 0);
  const postPartialPnL = postPartialFullExits.reduce((sum, t) => sum + t.profitLoss, 0);
  const neverPartialPnL = neverPartialExits.reduce((sum, t) => sum + t.profitLoss, 0);

  const neverPartialRate = (neverPartialExits.length / phase4Trades.length) * 100;

  // Get Phase 3 comparison data
  const phase3Trades = data.closedTrades.slice(PHASE3_START, PHASE4_START);
  const phase3Wins = phase3Trades.filter(t => t.profitLoss > 0).length;
  const phase3WinRate = (phase3Wins / phase3Trades.length) * 100;
  const phase3TotalProfit = phase3Trades.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
  const phase3TotalLoss = Math.abs(phase3Trades.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
  const phase3ProfitFactor = phase3TotalLoss > 0 ? phase3TotalProfit / phase3TotalLoss : 0;

  // Generate report
  const report = `
════════════════════════════════════════════════════════════════════════════════
🎯 PHASE 4 ANALYSIS REPORT
════════════════════════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}

Changes Implemented:
  • Tier 1 target: +50% → +40%
  • Safety score threshold: 60 → 70

────────────────────────────────────────────────────────────────────────────────
📊 PERFORMANCE COMPARISON
────────────────────────────────────────────────────────────────────────────────

PHASE 3 (Trades ${PHASE3_START + 1}-${PHASE4_START}):
  • Total Trades:     ${phase3Trades.length}
  • Win Rate:         ${phase3WinRate.toFixed(1)}%
  • Profit Factor:    ${phase3ProfitFactor.toFixed(2)}
  • Never reached +50%: ${((phase3Trades.filter(t => !t.isPartialExit && !partialExitTokens.has(t.tokenAddress)).length / phase3Trades.length) * 100).toFixed(1)}%

PHASE 4 (Trades ${PHASE4_START + 1}-${data.stats.totalTrades}):
  • Total Trades:     ${phase4Trades.length}
  • Win Rate:         ${phase4WinRate.toFixed(1)}%
  • Profit Factor:    ${phase4ProfitFactor.toFixed(2)}
  • Net P&L:          ${phase4NetPnL >= 0 ? '+' : ''}${phase4NetPnL.toFixed(4)} SOL
  • Never reached +40%: ${neverPartialRate.toFixed(1)}%

IMPROVEMENT:
  • Win Rate:         ${phase4WinRate - phase3WinRate >= 0 ? '+' : ''}${(phase4WinRate - phase3WinRate).toFixed(1)}%
  • Profit Factor:    ${phase4ProfitFactor - phase3ProfitFactor >= 0 ? '+' : ''}${(phase4ProfitFactor - phase3ProfitFactor).toFixed(2)}

────────────────────────────────────────────────────────────────────────────────
🎯 PARTIAL EXIT PERFORMANCE
────────────────────────────────────────────────────────────────────────────────

Partial Exits:        ${partialExits.length} (${(partialExits.length / phase4Trades.length * 100).toFixed(1)}%)
  • Tier 1 (+40%):    ${partialExits.filter(t => t.reason && t.reason.includes('TIER_1')).length}
  • Tier 2 (+80%):    ${partialExits.filter(t => t.reason && t.reason.includes('TIER_2')).length}

Never Partial:        ${neverPartialExits.length} (${neverPartialRate.toFixed(1)}%)

P&L Attribution:
  • Partial exits:    ${partialPnL >= 0 ? '+' : ''}${partialPnL.toFixed(4)} SOL
  • Remaining 50%:    ${postPartialPnL >= 0 ? '+' : ''}${postPartialPnL.toFixed(4)} SOL
  • Never partial:    ${neverPartialPnL >= 0 ? '+' : ''}${neverPartialPnL.toFixed(4)} SOL

────────────────────────────────────────────────────────────────────────────────
💡 SUCCESS CRITERIA
────────────────────────────────────────────────────────────────────────────────

✓ Profit Factor > 1.0:        ${phase4ProfitFactor.toFixed(2)} ${phase4ProfitFactor > 1.0 ? '✅ PASS' : '❌ FAIL'}
✓ Win Rate > 40%:             ${phase4WinRate.toFixed(1)}% ${phase4WinRate > 40 ? '✅ PASS' : '❌ FAIL'}
✓ Never partial < 60%:        ${neverPartialRate.toFixed(1)}% ${neverPartialRate < 60 ? '✅ PASS' : '❌ FAIL'}
✓ Net P&L > 0:                ${phase4NetPnL >= 0 ? '+' : ''}${phase4NetPnL.toFixed(4)} SOL ${phase4NetPnL > 0 ? '✅ PASS' : '❌ FAIL'}

────────────────────────────────────────────────────────────────────────────────
📝 RECOMMENDATION
────────────────────────────────────────────────────────────────────────────────

${generateRecommendation(phase4ProfitFactor, phase4WinRate, neverPartialRate, phase4NetPnL)}

════════════════════════════════════════════════════════════════════════════════
Report saved to: ${REPORT_FILE}
════════════════════════════════════════════════════════════════════════════════
`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(report);
}

function generateRecommendation(pf, wr, neverRate, pnl) {
  const lines = [];

  if (pf > 1.2 && wr > 45 && pnl > 0.05) {
    lines.push('🎉 EXCELLENT! Phase 4 is highly profitable.');
    lines.push('✅ Strategy is ready for live trading consideration.');
    lines.push('✅ Continue with current settings.');
  } else if (pf > 1.0 && pnl > 0) {
    lines.push('✅ PROFITABLE! Phase 4 is working.');
    lines.push('⏸️  Collect 20 more trades to confirm consistency.');
  } else if (pf > 0.9) {
    lines.push('⚠️  BREAK-EVEN: Close to profitability.');
    lines.push('🔧 Consider further lowering Tier 1 to +35%.');
  } else {
    lines.push('❌ UNDERPERFORMING: Still losing despite optimizations.');
    lines.push('🔧 Entry quality is likely the core issue.');
    lines.push('   Consider raising safety score to 80.');
  }

  if (neverRate > 60) {
    lines.push('');
    lines.push(`⚠️  ${neverRate.toFixed(1)}% still not reaching +40% target.`);
    lines.push('   May need to lower further to +35% or improve entries.');
  }

  return lines.join('\n');
}

// Start monitoring
setInterval(analyze, CHECK_INTERVAL_MS);
analyze();
