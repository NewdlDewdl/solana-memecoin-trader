/**
 * Partial Exit Monitoring Script
 *
 * Monitors paper-trades.json and generates a detailed analysis report
 * when 10+ partial exits (Tier 1 + Tier 2) are collected.
 */

import fs from 'fs';

const TARGET_PARTIAL_EXITS = 10;
const CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
const TRADES_FILE = 'paper-trades.json';
const REPORT_FILE = 'partial-exits-analysis.txt';

let lastPartialCount = 0;

console.log('🔍 Partial Exit Monitor Started');
console.log(`🎯 Target: ${TARGET_PARTIAL_EXITS} partial exits (Tier 1 + Tier 2)`);
console.log(`⏰ Checking every ${CHECK_INTERVAL_MS / 1000}s\n`);

function analyzeTrades() {
  try {
    if (!fs.existsSync(TRADES_FILE)) {
      console.log('❌ paper-trades.json not found');
      return;
    }

    const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    const allTrades = data.closedTrades;

    // Find all partial exits
    const partialExits = allTrades.filter(t => t.isPartialExit === true);
    const tier1Exits = partialExits.filter(t => t.reason && t.reason.includes('TIER_1'));
    const tier2Exits = partialExits.filter(t => t.reason && t.reason.includes('TIER_2'));
    const totalPartialExits = partialExits.length;

    // Progress update
    if (totalPartialExits !== lastPartialCount) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`📈 Progress: ${totalPartialExits}/${TARGET_PARTIAL_EXITS} partial exits (Tier 1: ${tier1Exits.length}, Tier 2: ${tier2Exits.length}) - ${timestamp}`);

      // Show latest partial exit
      if (partialExits.length > 0) {
        const latest = partialExits[partialExits.length - 1];
        console.log(`   Latest: ${latest.tokenSymbol} | ${latest.profitLoss >= 0 ? '+' : ''}${latest.profitLoss.toFixed(4)} SOL (${latest.profitLossPercent.toFixed(1)}%) | ${latest.reason}`);
      }

      lastPartialCount = totalPartialExits;
    }

    // Check if target reached
    if (totalPartialExits >= TARGET_PARTIAL_EXITS) {
      console.log('\n🎉 TARGET REACHED! Generating analysis report...\n');
      generateReport(data, partialExits, tier1Exits, tier2Exits);
      process.exit(0);
    }

  } catch (error) {
    console.error('Error reading trades:', error.message);
  }
}

function generateReport(data, partialExits, tier1Exits, tier2Exits) {
  const allTrades = data.closedTrades;
  const stats = data.stats;

  // Calculate partial exit metrics
  const tier1Wins = tier1Exits.filter(t => t.profitLoss > 0).length;
  const tier1Losses = tier1Exits.filter(t => t.profitLoss <= 0).length;
  const tier1TotalProfit = tier1Exits.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
  const tier1TotalLoss = Math.abs(tier1Exits.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
  const tier1AvgProfit = tier1Wins > 0 ? tier1TotalProfit / tier1Wins : 0;

  const tier2Wins = tier2Exits.filter(t => t.profitLoss > 0).length;
  const tier2Losses = tier2Exits.filter(t => t.profitLoss <= 0).length;
  const tier2TotalProfit = tier2Exits.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
  const tier2TotalLoss = Math.abs(tier2Exits.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
  const tier2AvgProfit = tier2Wins > 0 ? tier2TotalProfit / tier2Wins : 0;

  // Overall partial exit metrics
  const partialWins = partialExits.filter(t => t.profitLoss > 0).length;
  const partialLosses = partialExits.filter(t => t.profitLoss <= 0).length;
  const partialWinRate = (partialWins / partialExits.length) * 100;
  const partialTotalProfit = partialExits.filter(t => t.profitLoss > 0).reduce((sum, t) => sum + t.profitLoss, 0);
  const partialTotalLoss = Math.abs(partialExits.filter(t => t.profitLoss <= 0).reduce((sum, t) => sum + t.profitLoss, 0));
  const partialNetPnL = partialTotalProfit - partialTotalLoss;

  // Overall performance
  const totalWinRate = (stats.wins / stats.totalTrades) * 100;
  const totalProfitFactor = stats.totalLoss > 0 ? stats.totalProfit / stats.totalLoss : 0;
  const totalNetPnL = stats.totalProfit - stats.totalLoss;

  // Generate report
  const report = `
════════════════════════════════════════════════════════════════════════════════
🎯 PARTIAL EXIT ANALYSIS REPORT - PHASE 3 TIERED STRATEGY
════════════════════════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}

────────────────────────────────────────────────────────────────────────────────
📊 PARTIAL EXIT SUMMARY
────────────────────────────────────────────────────────────────────────────────

Total Partial Exits:  ${partialExits.length}
  • Tier 1 (+50%):    ${tier1Exits.length} (${(tier1Exits.length / partialExits.length * 100).toFixed(1)}%)
  • Tier 2 (+80%):    ${tier2Exits.length} (${(tier2Exits.length / partialExits.length * 100).toFixed(1)}%)

Partial Exit Performance:
  • Wins / Losses:    ${partialWins} / ${partialLosses}
  • Win Rate:         ${partialWinRate.toFixed(1)}%
  • Total Profit:     +${partialTotalProfit.toFixed(4)} SOL
  • Total Loss:       -${partialTotalLoss.toFixed(4)} SOL
  • Net P&L:          ${partialNetPnL >= 0 ? '+' : ''}${partialNetPnL.toFixed(4)} SOL

────────────────────────────────────────────────────────────────────────────────
🎯 TIER 1 PERFORMANCE (+50% Target)
────────────────────────────────────────────────────────────────────────────────

Total Tier 1 Exits:   ${tier1Exits.length}
Wins / Losses:        ${tier1Wins} / ${tier1Losses}
Win Rate:             ${tier1Exits.length > 0 ? (tier1Wins / tier1Exits.length * 100).toFixed(1) : '0.0'}%
Total Profit:         +${tier1TotalProfit.toFixed(4)} SOL
Average Profit/Exit:  +${tier1AvgProfit.toFixed(4)} SOL

Top 5 Tier 1 Exits:
${tier1Exits
  .filter(t => t.profitLoss > 0)
  .sort((a, b) => b.profitLoss - a.profitLoss)
  .slice(0, 5)
  .map((t, i) => `  ${i + 1}. ${t.tokenSymbol}: +${t.profitLoss.toFixed(4)} SOL (+${t.profitLossPercent.toFixed(1)}%)`)
  .join('\n') || '  No profitable Tier 1 exits yet'}

────────────────────────────────────────────────────────────────────────────────
🚀 TIER 2 PERFORMANCE (+80% Target)
────────────────────────────────────────────────────────────────────────────────

Total Tier 2 Exits:   ${tier2Exits.length}
${tier2Exits.length > 0 ? `Wins / Losses:        ${tier2Wins} / ${tier2Losses}
Win Rate:             ${(tier2Wins / tier2Exits.length * 100).toFixed(1)}%
Total Profit:         +${tier2TotalProfit.toFixed(4)} SOL
Average Profit/Exit:  +${tier2AvgProfit.toFixed(4)} SOL

Top 5 Tier 2 Exits:
${tier2Exits
  .filter(t => t.profitLoss > 0)
  .sort((a, b) => b.profitLoss - a.profitLoss)
  .slice(0, 5)
  .map((t, i) => `  ${i + 1}. ${t.tokenSymbol}: +${t.profitLoss.toFixed(4)} SOL (+${t.profitLossPercent.toFixed(1)}%)`)
  .join('\n')}` : `  No Tier 2 exits yet - tokens not reaching +80% target`}

────────────────────────────────────────────────────────────────────────────────
📈 OVERALL STRATEGY PERFORMANCE
────────────────────────────────────────────────────────────────────────────────

Total Trades (All):   ${stats.totalTrades}
  • Wins:             ${stats.wins}
  • Losses:           ${stats.losses}
  • Win Rate:         ${totalWinRate.toFixed(1)}%
  • Profit Factor:    ${totalProfitFactor.toFixed(2)}
  • Net P&L:          ${totalNetPnL >= 0 ? '+' : ''}${totalNetPnL.toFixed(4)} SOL

Partial Exits Impact:
  • Partial exits represent ${(partialExits.length / stats.totalTrades * 100).toFixed(1)}% of all trades
  • Partial exit contribution to P&L: ${partialNetPnL >= 0 ? '+' : ''}${partialNetPnL.toFixed(4)} SOL

────────────────────────────────────────────────────────────────────────────────
💡 KEY INSIGHTS
────────────────────────────────────────────────────────────────────────────────

${generateInsights(tier1Exits, tier2Exits, partialWinRate, partialNetPnL, stats)}

────────────────────────────────────────────────────────────────────────────────
📝 RECOMMENDATION
────────────────────────────────────────────────────────────────────────────────

${generateRecommendation(tier1Exits, tier2Exits, partialWinRate, partialNetPnL, totalProfitFactor)}

════════════════════════════════════════════════════════════════════════════════
Report saved to: ${REPORT_FILE}
════════════════════════════════════════════════════════════════════════════════
`;

  // Write report to file
  fs.writeFileSync(REPORT_FILE, report);
  console.log(report);
  console.log(`\n✅ Report saved to ${REPORT_FILE}`);
}

function generateInsights(tier1Exits, tier2Exits, partialWinRate, partialNetPnL, stats) {
  const insights = [];

  // Tier 1 vs Tier 2 ratio
  const tier1Rate = tier1Exits.length;
  const tier2Rate = tier2Exits.length;

  if (tier1Rate > 0 && tier2Rate === 0) {
    insights.push('⚠️  NO TIER 2 EXITS: Tokens are reaching +50% but not +80%. Market may not support moonshots currently.');
  } else if (tier2Rate > 0) {
    insights.push(`✅ TIER 2 CAPTURES: ${tier2Rate} tokens reached +80% target. Strategy capturing moonshots!`);
  }

  // Partial exit win rate
  if (partialWinRate >= 80) {
    insights.push(`🎉 HIGH PARTIAL WIN RATE: ${partialWinRate.toFixed(1)}% - Tiered exits are highly effective!`);
  } else if (partialWinRate >= 60) {
    insights.push(`✅ GOOD PARTIAL WIN RATE: ${partialWinRate.toFixed(1)}% - Tiered strategy working well.`);
  } else if (partialWinRate >= 40) {
    insights.push(`⚠️  MODERATE PARTIAL WIN RATE: ${partialWinRate.toFixed(1)}% - Some partial exits hitting stop-loss.`);
  } else {
    insights.push(`❌ LOW PARTIAL WIN RATE: ${partialWinRate.toFixed(1)}% - Many partial exits followed by stop-losses.`);
  }

  // Partial exit contribution
  if (partialNetPnL > 0) {
    insights.push(`💰 PROFITABLE PARTIALS: Partial exits contributing ${partialNetPnL >= 0 ? '+' : ''}${partialNetPnL.toFixed(4)} SOL profit.`);
  } else {
    insights.push(`⚠️  LOSING PARTIALS: Partial exits losing ${partialNetPnL.toFixed(4)} SOL overall.`);
  }

  return insights.join('\n\n');
}

function generateRecommendation(tier1Exits, tier2Exits, partialWinRate, partialNetPnL, totalProfitFactor) {
  const recommendations = [];

  // Overall assessment
  if (partialNetPnL > 0.05 && partialWinRate >= 70) {
    recommendations.push('🎉 EXCELLENT! Tiered exits are highly profitable.');
    recommendations.push('✅ CONTINUE PHASE 3: Keep current settings.');
    recommendations.push('🚀 CONSIDER PHASE 4: Ready for dynamic position sizing.');
  } else if (partialNetPnL > 0 && partialWinRate >= 50) {
    recommendations.push('✅ GOOD! Tiered exits are profitable.');
    recommendations.push('⏸️  CONTINUE MONITORING: Collect more data to confirm consistency.');
  } else if (partialNetPnL >= 0) {
    recommendations.push('⚠️  BREAK-EVEN: Partial exits not adding significant value.');
    recommendations.push('🔧 CONSIDER ADJUSTMENTS: May need to tune tier targets.');
  } else {
    recommendations.push('❌ UNDERPERFORMING: Partial exits are losing money.');
    recommendations.push('🔧 ADJUST STRATEGY: Consider lowering targets or reverting to single exit.');
  }

  // Tier-specific recommendations
  if (tier1Exits.length > 0 && tier2Exits.length === 0) {
    recommendations.push('');
    recommendations.push(`⚠️  NO TIER 2 EXITS: Consider lowering Tier 2 from +80% to +60-70%.`);
  }

  if (partialWinRate < 60) {
    recommendations.push('');
    recommendations.push(`⚠️  LOW PARTIAL WIN RATE: Many partial positions hit stop-loss. Consider:
   - Lowering Tier 1 target from +50% to +40%
   - Tightening trailing stop after partial exit
   - Improving entry quality filters`);
  }

  return recommendations.join('\n');
}

// Start monitoring
setInterval(analyzeTrades, CHECK_INTERVAL_MS);
analyzeTrades(); // Run immediately
