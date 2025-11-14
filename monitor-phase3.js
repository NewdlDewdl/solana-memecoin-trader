/**
 * Phase 3 Monitoring Script
 *
 * Automatically monitors paper-trades.json and generates a detailed
 * analysis report when 20 new Phase 3 trades are completed.
 */

import fs from 'fs';
import path from 'path';

const BASELINE_TRADES = 43; // Trades before Phase 3
const TARGET_TRADES = BASELINE_TRADES + 20; // Need 63 total trades
const CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
const TRADES_FILE = 'paper-trades.json';
const REPORT_FILE = 'phase3-analysis-report.txt';

let lastTradeCount = BASELINE_TRADES;

console.log('🔍 Phase 3 Monitor Started');
console.log(`📊 Baseline: ${BASELINE_TRADES} trades`);
console.log(`🎯 Target: ${TARGET_TRADES} trades (20 new trades)`);
console.log(`⏰ Checking every ${CHECK_INTERVAL_MS / 1000}s\n`);

function analyzeTrades() {
  try {
    if (!fs.existsSync(TRADES_FILE)) {
      console.log('❌ paper-trades.json not found');
      return;
    }

    const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    const totalTrades = data.stats.totalTrades;
    const newTrades = totalTrades - BASELINE_TRADES;

    // Progress update
    if (totalTrades !== lastTradeCount) {
      console.log(`📈 Progress: ${totalTrades} total trades (${newTrades}/20 Phase 3 trades) - ${new Date().toLocaleTimeString()}`);
      lastTradeCount = totalTrades;
    }

    // Check if target reached
    if (totalTrades >= TARGET_TRADES) {
      console.log('\n🎉 TARGET REACHED! Generating analysis report...\n');
      generateReport(data);
      process.exit(0);
    }

  } catch (error) {
    console.error('Error reading trades:', error.message);
  }
}

function generateReport(data) {
  const totalTrades = data.stats.totalTrades;
  const closedTrades = data.closedTrades;

  // Separate Phase 3 trades (after trade #43)
  const phase3Trades = closedTrades.slice(BASELINE_TRADES);
  const baselineTrades = closedTrades.slice(0, BASELINE_TRADES);

  // Calculate baseline metrics
  const baselineWins = baselineTrades.filter(t => t.profitLoss > 0).length;
  const baselineLosses = baselineTrades.filter(t => t.profitLoss <= 0).length;
  const baselineWinRate = (baselineWins / BASELINE_TRADES) * 100;
  const baselineTotalProfit = baselineTrades.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
  const baselineTotalLoss = Math.abs(baselineTrades.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
  const baselineProfitFactor = baselineTotalLoss > 0 ? baselineTotalProfit / baselineTotalLoss : 0;
  const baselineNetPnL = baselineTotalProfit - baselineTotalLoss;

  // Calculate Phase 3 metrics
  const phase3Wins = phase3Trades.filter(t => t.profitLoss > 0).length;
  const phase3Losses = phase3Trades.filter(t => t.profitLoss <= 0).length;
  const phase3WinRate = (phase3Wins / phase3Trades.length) * 100;
  const phase3TotalProfit = phase3Trades.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
  const phase3TotalLoss = Math.abs(phase3Trades.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
  const phase3ProfitFactor = phase3TotalLoss > 0 ? phase3TotalProfit / phase3TotalLoss : 0;
  const phase3NetPnL = phase3TotalProfit - phase3TotalLoss;

  // Count tiered exits (check for TIER_1 and TIER_2 in reason string)
  const tier1Exits = phase3Trades.filter(t => t.reason && t.reason.includes('TIER_1')).length;
  const tier2Exits = phase3Trades.filter(t => t.reason && t.reason.includes('TIER_2')).length;
  const singleTakeProfit = phase3Trades.filter(t => t.reason === 'TAKE_PROFIT').length;
  const stopLosses = phase3Trades.filter(t => t.reason === 'STOP_LOSS').length;
  const trailingStops = phase3Trades.filter(t => t.reason === 'TRAILING_STOP').length;
  const maxHoldTime = phase3Trades.filter(t => t.reason === 'MAX_HOLD_TIME').length;

  // Generate report
  const report = `
════════════════════════════════════════════════════════════════════════════════
🎯 PHASE 3 ANALYSIS REPORT - TIERED EXIT STRATEGY
════════════════════════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}

────────────────────────────────────────────────────────────────────────────────
📊 PERFORMANCE COMPARISON
────────────────────────────────────────────────────────────────────────────────

BASELINE (First 43 trades - Phases 1+2):
  • Total Trades:     ${BASELINE_TRADES}
  • Wins / Losses:    ${baselineWins} / ${baselineLosses}
  • Win Rate:         ${baselineWinRate.toFixed(1)}%
  • Profit Factor:    ${baselineProfitFactor.toFixed(2)}
  • Net P&L:          ${baselineNetPnL >= 0 ? '+' : ''}${baselineNetPnL.toFixed(4)} SOL
  • Avg Win:          ${baselineWins > 0 ? (baselineTotalProfit / baselineWins).toFixed(4) : '0.0000'} SOL
  • Avg Loss:         ${baselineLosses > 0 ? (baselineTotalLoss / baselineLosses).toFixed(4) : '0.0000'} SOL

PHASE 3 (Last ${phase3Trades.length} trades - Tiered Exits):
  • Total Trades:     ${phase3Trades.length}
  • Wins / Losses:    ${phase3Wins} / ${phase3Losses}
  • Win Rate:         ${phase3WinRate.toFixed(1)}%
  • Profit Factor:    ${phase3ProfitFactor.toFixed(2)}
  • Net P&L:          ${phase3NetPnL >= 0 ? '+' : ''}${phase3NetPnL.toFixed(4)} SOL
  • Avg Win:          ${phase3Wins > 0 ? (phase3TotalProfit / phase3Wins).toFixed(4) : '0.0000'} SOL
  • Avg Loss:         ${phase3Losses > 0 ? (phase3TotalLoss / phase3Losses).toFixed(4) : '0.0000'} SOL

IMPROVEMENT:
  • Win Rate:         ${phase3WinRate - baselineWinRate >= 0 ? '+' : ''}${(phase3WinRate - baselineWinRate).toFixed(1)}%
  • Profit Factor:    ${phase3ProfitFactor - baselineProfitFactor >= 0 ? '+' : ''}${(phase3ProfitFactor - baselineProfitFactor).toFixed(2)}
  • Net P&L:          ${phase3NetPnL - baselineNetPnL >= 0 ? '+' : ''}${(phase3NetPnL - baselineNetPnL).toFixed(4)} SOL

────────────────────────────────────────────────────────────────────────────────
🎯 PHASE 3 EXIT BREAKDOWN
────────────────────────────────────────────────────────────────────────────────

Exit Types:
  • Tier 1 Take-Profit (+50%):    ${tier1Exits} trades (${(tier1Exits / phase3Trades.length * 100).toFixed(1)}%)
  • Tier 2 Take-Profit (+80%):    ${tier2Exits} trades (${(tier2Exits / phase3Trades.length * 100).toFixed(1)}%)
  • Single Take-Profit:           ${singleTakeProfit} trades (${(singleTakeProfit / phase3Trades.length * 100).toFixed(1)}%)
  • Stop-Loss (-25%):             ${stopLosses} trades (${(stopLosses / phase3Trades.length * 100).toFixed(1)}%)
  • Trailing Stop:                ${trailingStops} trades (${(trailingStops / phase3Trades.length * 100).toFixed(1)}%)
  • Max Hold Time:                ${maxHoldTime} trades (${(maxHoldTime / phase3Trades.length * 100).toFixed(1)}%)

────────────────────────────────────────────────────────────────────────────────
✅ SUCCESS CRITERIA EVALUATION
────────────────────────────────────────────────────────────────────────────────

Target: Profit Factor > 1.2
Result: ${phase3ProfitFactor.toFixed(2)} ${phase3ProfitFactor > 1.2 ? '✅ PASS' : '❌ FAIL'}

Target: Win Rate > 30%
Result: ${phase3WinRate.toFixed(1)}% ${phase3WinRate > 30 ? '✅ PASS' : '❌ FAIL'}

Target: At least 4-5 Tier 1 exits
Result: ${tier1Exits} ${tier1Exits >= 4 ? '✅ PASS' : '❌ FAIL'}

Target: At least 1 Tier 2 exit
Result: ${tier2Exits} ${tier2Exits >= 1 ? '✅ PASS' : '❌ FAIL'}

Target: Net P&L > 0
Result: ${phase3NetPnL >= 0 ? '+' : ''}${phase3NetPnL.toFixed(4)} SOL ${phase3NetPnL > 0 ? '✅ PASS' : '❌ FAIL'}

────────────────────────────────────────────────────────────────────────────────
🏆 TOP 5 WINNERS (Phase 3)
────────────────────────────────────────────────────────────────────────────────

${phase3Trades
  .filter(t => t.profitLoss > 0)
  .sort((a, b) => b.profitLoss - a.profitLoss)
  .slice(0, 5)
  .map((t, i) => `${i + 1}. ${t.tokenSymbol}: +${t.profitLoss.toFixed(4)} SOL (+${t.profitLossPercent.toFixed(1)}%) | ${t.reason}`)
  .join('\n') || 'No winners yet'}

────────────────────────────────────────────────────────────────────────────────
💔 TOP 5 LOSERS (Phase 3)
────────────────────────────────────────────────────────────────────────────────

${phase3Trades
  .filter(t => t.profitLoss <= 0)
  .sort((a, b) => a.profitLoss - b.profitLoss)
  .slice(0, 5)
  .map((t, i) => `${i + 1}. ${t.tokenSymbol}: ${t.profitLoss.toFixed(4)} SOL (${t.profitLossPercent.toFixed(1)}%) | ${t.reason}`)
  .join('\n') || 'No losses yet'}

────────────────────────────────────────────────────────────────────────────────
📝 RECOMMENDATION
────────────────────────────────────────────────────────────────────────────────

${generateRecommendation(phase3ProfitFactor, phase3WinRate, tier1Exits, tier2Exits, phase3NetPnL)}

════════════════════════════════════════════════════════════════════════════════
Report saved to: ${REPORT_FILE}
════════════════════════════════════════════════════════════════════════════════
`;

  // Write report to file
  fs.writeFileSync(REPORT_FILE, report);
  console.log(report);
  console.log(`\n✅ Report saved to ${REPORT_FILE}`);
}

function generateRecommendation(profitFactor, winRate, tier1, tier2, netPnL) {
  const recommendations = [];

  if (profitFactor > 1.5 && winRate > 35 && netPnL > 0.05) {
    recommendations.push('🎉 EXCELLENT! Phase 3 significantly outperforms baseline.');
    recommendations.push('✅ PROCEED TO PHASE 4: Implement dynamic position sizing.');
    recommendations.push('   Criteria: Profit factor > 1.5 ✓ | Win rate > 35% ✓ | Net P&L positive ✓');
  } else if (profitFactor > 1.2 && winRate > 30) {
    recommendations.push('✅ GOOD! Phase 3 shows improvement over baseline.');
    recommendations.push('⏸️  WAIT: Collect 10-20 more trades to confirm consistency before Phase 4.');
    recommendations.push('   Criteria met but recommend additional validation.');
  } else if (profitFactor >= 1.0 && netPnL >= 0) {
    recommendations.push('⚠️  MIXED RESULTS: Phase 3 is break-even or slightly profitable.');
    recommendations.push('🔧 TUNE PHASE 3: Consider adjusting tier targets (+45%/+70% instead of +50%/+80%)');
    recommendations.push('   Do NOT proceed to Phase 4 yet.');
  } else {
    recommendations.push('❌ UNDERPERFORMING: Phase 3 is worse than baseline.');
    recommendations.push('🔧 ROLLBACK: Revert to single take-profit and analyze entry quality.');
    recommendations.push('   Issue may be with entry filters, not exit strategy.');
  }

  if (tier1 < 4) {
    recommendations.push('');
    recommendations.push(`⚠️  WARNING: Only ${tier1} Tier 1 exits. May need to lower tier 1 target from +50% to +45%.`);
  }

  if (tier2 === 0) {
    recommendations.push('');
    recommendations.push(`⚠️  WARNING: No Tier 2 exits yet. +80% target may be too aggressive for current market.`);
  }

  return recommendations.join('\n');
}

// Start monitoring
setInterval(analyzeTrades, CHECK_INTERVAL_MS);
analyzeTrades(); // Run immediately
