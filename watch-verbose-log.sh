#!/bin/bash

# Watch verbose token discovery log

VERBOSE_LOG="/tmp/token-discovery-verbose.log"

echo "========================================="
echo "📝 Watching Verbose Token Discovery Log"
echo "========================================="
echo ""
echo "Log file: $VERBOSE_LOG"
echo ""
echo "This log shows EVERY token evaluated with:"
echo "  - Token mint address"
echo "  - Pool ID"
echo "  - Liquidity amount"
echo "  - ✅ Acceptance or ❌ Rejection"
echo "  - Reason for decision"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "========================================="
echo ""

# Create log file if it doesn't exist
touch "$VERBOSE_LOG"

# Watch the log file
tail -f "$VERBOSE_LOG"

