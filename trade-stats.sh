#!/bin/bash

LOG_FILE="/tmp/bot-final.log"

clear
echo "═══════════════════════════════════════════════════════════════════════════"
echo "📊 TRADING STATISTICS SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Count total trades
echo "📈 TRADE COUNTS:"
echo "   Buys:  $(grep -c "PAPER BUY" "$LOG_FILE" 2>/dev/null || echo "0")"
echo "   Sells: $(grep -c "PAPER SELL" "$LOG_FILE" 2>/dev/null || echo "0")"
echo ""

# Count win/loss breakdown
echo "🎯 WIN/LOSS BREAKDOWN:"
echo "   🎉 Big Wins (30%+):    $(grep -c "BIG WIN" "$LOG_FILE" 2>/dev/null || echo "0")"
echo "   ✅ Regular Wins:       $(grep -c "✅ WIN:" "$LOG_FILE" 2>/dev/null || echo "0")"
echo "   ❌ Regular Losses:     $(grep -c "❌ LOSS:" "$LOG_FILE" 2>/dev/null || echo "0")"
echo "   💥 Big Losses (20%+):  $(grep -c "BIG LOSS" "$LOG_FILE" 2>/dev/null || echo "0")"
echo ""

# Show exit reasons
echo "🚪 EXIT REASONS:"
echo "   Take-Profit:    $(grep -c "Take-profit triggered" "$LOG_FILE" 2>/dev/null || echo "0")"
echo "   Trailing Stop:  $(grep -c "Trailing stop triggered" "$LOG_FILE" 2>/dev/null || echo "0")"
echo "   Stop-Loss:      $(grep -c "Stop-loss triggered" "$LOG_FILE" 2>/dev/null || echo "0")"
echo "   Max Hold Time:  $(grep -c "Max hold time" "$LOG_FILE" 2>/dev/null || echo "0")"
echo ""

# Show best trades
echo "🏆 BEST TRADES (Big Wins):"
grep "BIG WIN" "$LOG_FILE" 2>/dev/null | tail -5 | while read line; do
    token=$(echo "$line" | grep -oP '\[[0-9:]+\] \K[A-Za-z0-9]+' | head -1)
    pnl=$(echo "$line" | grep -oP '\+[0-9]+\.[0-9]+%' | head -1)
    echo "   $token: $pnl"
done
[ $(grep -c "BIG WIN" "$LOG_FILE" 2>/dev/null || echo "0") -eq 0 ] && echo "   (No big wins yet)"
echo ""

# Show worst trades
echo "💔 WORST TRADES (Big Losses):"
grep "BIG LOSS" "$LOG_FILE" 2>/dev/null | tail -5 | while read line; do
    token=$(echo "$line" | grep -oP '\[[0-9:]+\] \K[A-Za-z0-9]+' | head -1)
    pnl=$(echo "$line" | grep -oP '\-[0-9]+\.[0-9]+%' | head -1)
    echo "   $token: $pnl"
done
[ $(grep -c "BIG LOSS" "$LOG_FILE" 2>/dev/null || echo "0") -eq 0 ] && echo "   (No big losses yet)"
echo ""

# Show latest balance
echo "💰 LATEST BALANCE:"
latest_balance=$(grep "Balance:" "$LOG_FILE" 2>/dev/null | tail -1 | grep -oP '[0-9]+\.[0-9]+ SOL')
if [ -n "$latest_balance" ]; then
    echo "   $latest_balance"
else
    echo "   (No balance data yet)"
fi
echo ""

# Show latest performance report
echo "📊 LATEST PERFORMANCE METRICS:"
if grep -q "PERFORMANCE REPORT" "$LOG_FILE" 2>/dev/null; then
    # Get the last performance report section
    tac "$LOG_FILE" | sed '/PERFORMANCE REPORT/q' | tac | grep -E "Total P&L:|Win Rate:|Biggest" | while read line; do
        echo "   $line" | sed 's/.*\[info\]: //'
    done
else
    echo "   (No performance report yet)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "💡 Tips:"
echo "   - Run './watch-trades-live.sh' to see trades as they happen"
echo "   - Run 'node show-paper-trading-balance.js' for detailed P&L"
echo ""

