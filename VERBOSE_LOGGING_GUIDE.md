# 📝 Verbose Token Discovery Logging Guide

## Overview

The bot now includes **verbose logging** that records EVERY token evaluation with detailed accept/reject reasons. This helps you understand exactly what the bot is seeing and why it makes its decisions.

## What Gets Logged

For every pool the bot evaluates, you'll see:

### ✅ Accepted Tokens
```
────────────────────────────────────────────────────────────────────────────────
🔎 EVALUATING TOKEN
   Token Mint: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
   Pool ID: ABC123...
   Liquidity: 8.5000 SOL
   Signature: xyz789...
   ✅ ACCEPTED: Liquidity 8.5000 SOL >= minimum 5 SOL - Ready for analysis
   🎯 Token added to discovery queue for analysis!
```

### ❌ Rejected Tokens
```
────────────────────────────────────────────────────────────────────────────────
🔎 EVALUATING TOKEN
   Token Mint: 3xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgDef
   Pool ID: DEF456...
   Liquidity: 2.3000 SOL
   Signature: abc123...
   ❌ REJECTED: Liquidity 2.3000 SOL < minimum 5 SOL (PRACTICE MODE: 5 SOL filter)
```

### ⚠️ Unparseable Events
```
⚠️  Failed to parse pool transaction - skipping
```
*Note: Not every Raydium event is a pool creation. This is normal.*

## Log File Location

```
/tmp/token-discovery-verbose.log
```

## How to Watch the Log

### Option 1: Use the Watch Script (RECOMMENDED)
```bash
./watch-verbose-log.sh
```

This shows a live feed of all token evaluations.

### Option 2: Tail the Log Manually
```bash
tail -f /tmp/token-discovery-verbose.log
```

### Option 3: View Full Log
```bash
cat /tmp/token-discovery-verbose.log
```

### Option 4: Search for Specific Patterns

**See only accepted tokens:**
```bash
grep "✅ ACCEPTED" /tmp/token-discovery-verbose.log
```

**See only rejected tokens:**
```bash
grep "❌ REJECTED" /tmp/token-discovery-verbose.log
```

**See tokens with specific liquidity:**
```bash
grep "Liquidity: 5\." /tmp/token-discovery-verbose.log
```

**Count acceptances vs rejections:**
```bash
echo "Accepted: $(grep -c '✅ ACCEPTED' /tmp/token-discovery-verbose.log)"
echo "Rejected: $(grep -c '❌ REJECTED' /tmp/token-discovery-verbose.log)"
```

## Stats in Main Log

The main bot log now also shows accept/reject counts:

```
📊 Discovery Stats: 18,224 received | 1,822 processed (1/10 sampling) | ✅ 3 accepted | ❌ 145 rejected
```

This gives you a quick summary without looking at the verbose log.

## Current Filter Settings

**Mode:** PRACTICE MODE
**Sampling:** 1 in 10 events (10%)
**Minimum Liquidity:** 5 SOL

### What This Means:

- **90% of events are skipped** (sampling) to stay within rate limits
- **Of the 10% processed:**
  - Pools with 5+ SOL liquidity → ✅ ACCEPTED
  - Pools with <5 SOL liquidity → ❌ REJECTED
  - Unparseable events → ⚠️ SKIPPED

## Example Usage Scenarios

### Scenario 1: "Why isn't the bot finding any tokens?"

```bash
# Check verbose log
./watch-verbose-log.sh

# Look for patterns:
# - Are there LOTS of rejections due to low liquidity?
#   → Maybe lower the minLiquidity filter
# - Are there ZERO token evaluations?
#   → Check if bot is sampling too conservatively
```

### Scenario 2: "What liquidity do most new tokens have?"

```bash
# Extract all liquidity values
grep "Liquidity:" /tmp/token-discovery-verbose.log | \
  awk '{print $3}' | \
  sort -n | \
  head -20

# This shows the 20 lowest liquidity pools discovered
```

### Scenario 3: "I want to see why a specific token was rejected"

```bash
# Search by token mint
grep -A 5 "YOUR_TOKEN_MINT_ADDRESS" /tmp/token-discovery-verbose.log
```

### Scenario 4: "Show me the last 10 decisions"

```bash
grep -E "(✅ ACCEPTED|❌ REJECTED)" /tmp/token-discovery-verbose.log | tail -10
```

## Log Rotation

The log file grows over time. To start fresh:

```bash
# Clear the log
> /tmp/token-discovery-verbose.log

# Or delete it (bot will recreate on restart)
rm /tmp/token-discovery-verbose.log
```

## Troubleshooting

### Problem: Log file is empty or not updating

**Check if bot is running:**
```bash
./check-bot-status.sh
```

**Check if events are being received:**
```bash
tail -f /tmp/bot-practice-mode.log | grep "Discovery Stats"
```

**Check if sampling rate is too high:**
- At 1 in 10 sampling, it might take 1-2 minutes to see the first evaluation
- Check the main log for "Discovery Stats" - if "received" is increasing, events ARE coming in

### Problem: Only seeing "Failed to parse" messages

**This is normal!** Not every Raydium event is a new pool creation. Most events are:
- Swaps (people trading)
- Liquidity adds/removes
- Other contract interactions

Only ~1-5% of Raydium events are actual NEW pools being created.

### Problem: All tokens are being rejected

**Check the rejection reasons:**
```bash
grep "❌ REJECTED" /tmp/token-discovery-verbose.log | tail -5
```

If they all say "< minimum 5 SOL", that's working correctly! Most new memecoins launch with 1-3 SOL. You're waiting for the bigger ones.

**To see more tokens, lower the filter:**
- Edit `src/intelligence/tokenDiscovery.js`
- Change `minLiquidity` from 5 to 1 or 2
- Restart the bot

## Integration with Other Tools

### Use with watch-for-trades.sh

Run both in separate terminals:
```bash
# Terminal 1: Watch verbose discovery log
./watch-verbose-log.sh

# Terminal 2: Watch for actual trades
./watch-for-trades.sh
```

### Use with paper trading balance

Check balance and compare to verbose log:
```bash
node show-paper-trading-balance.js

# Then check verbose log to see which tokens were analyzed
grep "✅ ACCEPTED" /tmp/token-discovery-verbose.log
```

## Performance Impact

**Minimal!** The verbose logging:
- Uses async file writes (doesn't block)
- Only logs 10% of events (due to sampling)
- Writes to `/tmp` (fast)
- Has no impact on RPC rate limits

## Future Enhancements

The verbose log could be extended to show:
- Additional rejection reasons (e.g., "price volatility too high")
- Token metadata (name, symbol) when available
- Analysis results (scores, indicators)
- Trade decisions and execution results

## Summary

The verbose logging gives you **full transparency** into what the bot sees and does. Use it to:

1. ✅ Understand why tokens are accepted/rejected
2. ✅ Tune your filters (liquidity, sampling rate)
3. ✅ Debug discovery issues
4. ✅ Learn about Solana token launches in real-time
5. ✅ Build confidence in the bot's decision-making

**Start watching now:**
```bash
cd /Users/newdldewdl/Library/CloudStorage/Box-Box/Claude/solana-memecoin-trader
./watch-verbose-log.sh
```

Happy hunting! 🎯

