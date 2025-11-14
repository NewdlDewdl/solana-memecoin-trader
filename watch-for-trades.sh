#!/bin/bash

echo "========================================="
echo "🔔 TRADE ALERT MONITOR - FAST MODE"
echo "========================================="
echo ""
echo "Watching for:"
echo "  🆕 Token discoveries"
echo "  📝 Paper trades (BUY/SELL)"
echo "  💰 Balance changes"
echo ""
echo "Bot Status: $(pgrep -f 'node src/index.js' > /dev/null && echo '✅ RUNNING' || echo '❌ STOPPED')"
echo ""
echo "Monitoring /tmp/bot-fast.log..."
echo "Press Ctrl+C to stop watching"
echo ""
echo "========================================="
echo ""

# Watch the log file and highlight important events
tail -f /tmp/bot-fast.log 2>/dev/null | grep --line-buffered -E "(discovered|Paper Trade|Balance|BUY|SELL|📝|🆕|💰|tokens discovered)" | while read line; do
    echo "🔔 ALERT: $line"
    # macOS notification (optional - will show desktop notification)
    osascript -e "display notification \"$line\" with title \"Trade Alert\"" 2>/dev/null || true
done
