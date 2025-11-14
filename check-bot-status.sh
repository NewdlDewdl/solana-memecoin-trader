#!/bin/bash

echo "================================"
echo "🤖 BOT STATUS CHECK"
echo "================================"
echo ""

# Check if bot is running
if pgrep -f "node src/index.js" > /dev/null; then
    echo "✅ Bot is RUNNING"
    echo "   PID: $(pgrep -f 'node src/index.js')"
    echo "   Uptime: $(ps -o etime= -p $(pgrep -f 'node src/index.js') | xargs)"
    echo ""
    
    # Check memory usage
    echo "📊 Resource Usage:"
    ps aux | grep "node src/index.js" | grep -v grep | awk '{print "   Memory: " $4 "% | CPU: " $3 "%"}'
    echo ""
    
    echo "💡 To stop the bot: pkill -f 'node src/index.js'"
    echo "💡 To view live output: Wait for terminal output or check logs"
else
    echo "❌ Bot is NOT running"
    echo ""
    echo "To start: npm start"
fi

echo ""
echo "================================"
