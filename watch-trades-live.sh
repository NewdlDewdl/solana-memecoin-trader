#!/bin/bash

LOG_FILE="/tmp/bot-final.log"

clear
echo "═══════════════════════════════════════════════════════════════════════════"
echo "🎯 LIVE TRADING DASHBOARD - Paper Trading Monitor"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Watching for:"
echo "  🎉 Big Wins (30%+)"
echo "  💥 Big Losses (20%+)"
echo "  ✅ Regular Wins"
echo "  ❌ Regular Losses"
echo "  📊 Performance Reports"
echo ""
echo "Press Ctrl+C to stop"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Follow log and filter for trades and performance
tail -f "$LOG_FILE" 2>/dev/null | grep --line-buffered -E "PAPER BUY|PAPER SELL|BIG WIN|BIG LOSS|WIN:|LOSS:|PERFORMANCE REPORT|Balance:|Total P&L:|Win Rate:|Biggest" | while read line; do
    # Add timestamp
    timestamp=$(date "+%H:%M:%S")
    
    # Color code different types of messages
    if echo "$line" | grep -q "BIG WIN"; then
        echo "[$timestamp] 🎉 $line"
    elif echo "$line" | grep -q "BIG LOSS"; then
        echo "[$timestamp] 💥 $line"
    elif echo "$line" | grep -q "WIN:"; then
        echo "[$timestamp] ✅ $line"
    elif echo "$line" | grep -q "LOSS:"; then
        echo "[$timestamp] ❌ $line"
    elif echo "$line" | grep -q "PAPER BUY"; then
        echo "[$timestamp] 💰 $line"
    elif echo "$line" | grep -q "PAPER SELL"; then
        echo "[$timestamp] 💵 $line"
    elif echo "$line" | grep -q "PERFORMANCE REPORT"; then
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════"
        echo "[$timestamp] $line"
    elif echo "$line" | grep -q "════"; then
        echo "$line"
        echo ""
    else
        echo "[$timestamp] $line"
    fi
done

