# Solana RPC Provider Comparison

**Complete guide to choosing and configuring RPC providers for the Solana memecoin trading bot.**

**Last Updated:** November 2025

---

## Overview

RPC (Remote Procedure Call) providers are critical infrastructure for your trading bot. The provider you choose directly impacts:
- Trade discovery speed
- API rate limits and reliability
- Cost (free vs paid tiers)
- WebSocket support for real-time monitoring

This guide compares major Solana RPC providers and helps you choose the right one for your needs.

---

## Free Tier Comparison

### Provider Comparison Table

| Provider | Free RPS | Monthly Requests | WebSocket | Best For |
|----------|----------|------------------|-----------|----------|
| **Helius** | 10 | ~26M | ✅ Yes | Getting started, learning |
| **Chainstack** | 25 | ~65M | ✅ Yes | 2.5x faster than Helius (free) ⭐ |
| **Ankr** | 30 | ~78M | ✅ Yes | 3x faster than Helius (free) ⭐⭐ |
| **QuickNode** | Trial only | Trial only | ✅ Yes | Must upgrade to paid |
| **Alchemy** | ~10 | ~26M | ✅ Yes | Similar to Helius |
| **Public RPC** | 1-5 | Limited | ❌ No | Not recommended (too slow) |

**RPS** = Requests Per Second

---

## Understanding Your Bot's RPC Requirements

### What the Bot Does

Your trading bot makes multiple RPC calls for each token event:

- `getParsedTransaction` - 1 call per event
- `getParsedAccountInfo` - 1-2 calls per event
- `getBalance` - periodic checks
- `onLogs` WebSocket - real-time monitoring (counts toward rate limits!)

### RPS Requirements by Mode

**FAST MODE (1 in 3 sampling):**
- Events: ~1000-1500 per minute
- Events per second: ~16-25
- RPC calls per event: 5-10
- **Total needed: 80-160 RPS**

**CONSERVATIVE MODE (1 in 10 sampling):**
- Events: ~300-500 per minute
- Events per second: ~5-8
- RPC calls per event: 5-10
- **Total needed: 25-80 RPS**

**ULTRA CONSERVATIVE MODE (1 in 10 sampling, throttled):**
- Throttled requests with delays
- **Works with: 10 RPS**

### Example: The Math

```
1000 events/minute ÷ 60 = 16 events/second
16 events × 5-10 RPC calls = 80-160 RPS needed

Helius Free Tier = 10 RPS
Result: Instant 429 "Too Many Requests" errors
```

---

## Provider Options & Recommendations

### Option 1: Ankr (FREE - 30 RPS) ⭐⭐⭐

**Best free option - 3x more capacity than Helius**

**Specs:**
- Cost: **$0**
- RPS: **30** (free tier)
- Speed: 3x faster than Helius free
- Discovery time: 7-12 minutes (FAST MODE)
- 429 Errors: Minimal with 1 in 3 sampling

**Why Choose This:**
- Still completely free
- 3x more capacity than Helius
- Same features and reliability
- Might handle FAST MODE without issues
- Good for paper trading and learning

**Setup:**
1. Sign up at [ankr.com/rpc/solana](https://www.ankr.com/rpc/solana)
2. Get your API key
3. Update `.env`:
   ```env
   SOLANA_RPC_URL=https://rpc.ankr.com/solana/YOUR_API_KEY
   ```
4. Restart the bot

**Recommended for:** Paper trading, learning, testing before going live

---

### Option 2: Chainstack (FREE - 25 RPS) ⭐⭐

**Second best free option - 2.5x more capacity**

**Specs:**
- Cost: **$0**
- RPS: **25** (free tier)
- Speed: 2.5x faster than Helius free
- Discovery time: 8-13 minutes
- 429 Errors: Some, but better than Helius

**Why Choose This:**
- Still free
- 2.5x more capacity than Helius
- Good reputation and reliability
- Better than Helius for moderate speeds

**Setup:**
1. Sign up at [chainstack.com](https://chainstack.com)
2. Create a Solana node
3. Get your endpoint URL
4. Update `.env` with endpoint
5. Restart the bot

**Recommended for:** Paper trading, moderate-speed testing

---

### Option 3: Helius (FREE - 10 RPS / PAID - 50-250 RPS) ⭐

**Current setup - works with ULTRA CONSERVATIVE mode**

**Free Tier:**
- Cost: **$0**
- RPS: **10**
- Discovery time: 15-25 minutes (ULTRA CONSERVATIVE MODE)
- 429 Errors: Zero (with proper throttling)

**Paid Tiers:**

| Plan | Price | RPS | Best For |
|------|-------|-----|----------|
| **Developer** | $49/month | 50 | Light real trading |
| **Pro** | $99/month | 100 | Competitive trading |
| **Business** | $249/month | 250 | High-volume trading |

**Why Choose This:**
- Free tier: Good for learning with ULTRA CONSERVATIVE mode
- Paid tiers: Excellent for real trading
- Reliable and well-documented
- Good support

**Configuration for Free Tier:**

Required settings in `.env`:
```env
FAST_MODE=false
DISCOVERY_SAMPLING=10  # 1 in 10 events
REQUEST_DELAY_MS=100
MAX_CONCURRENT_REQUESTS=1
MIN_LIQUIDITY_SOL=10
```

**Recommended for:**
- Free: Learning, slow paper trading
- Paid: Real trading with competitive speed

---

### Option 4: QuickNode (PAID - 50-250 RPS)

**Alternative to Helius with slightly lower entry price**

**Paid Tiers:**

| Plan | Price | RPS | Best For |
|------|-------|-----|----------|
| **Discover** | $29/month | 50 | Entry-level real trading |
| **Build** | $49/month | 100 | Competitive trading |
| **Scale** | $99/month | 250 | High-volume trading |

**Why Choose This:**
- Slightly cheaper entry ($29 vs $49 for Helius)
- Good performance and reliability
- Strong documentation
- No meaningful free tier

**Recommended for:** Real trading on a budget

---

### Option 5: Alchemy (FREE - ~10 RPS / PAID)

**Similar to Helius**

**Specs:**
- Free: ~10 RPS (~26M requests/month)
- Paid: Various tiers available
- Similar pricing to Helius

**Why Choose This:**
- Alternative if Helius/Ankr have issues
- Similar capabilities

**Recommended for:** Backup option

---

## Recommended Strategy

### For Paper Trading & Learning (Now)

**Step 1:** Try Ankr FREE (30 RPS)
- Setup time: 5 minutes
- Cost: $0
- Benefit: FAST MODE might actually work

**Step 2:** If you get 429 errors, try Chainstack FREE (25 RPS)
- Setup time: 5 minutes
- Cost: $0
- Benefit: Better than Helius

**Step 3:** If both fail, use ULTRA CONSERVATIVE mode on Helius
- Setup time: 1 minute
- Cost: $0
- Benefit: Stable, slow, works reliably

### For Real Trading (Later)

**Upgrade to paid tier: $49-99/month**

**Why pay?**
- Memecoin opportunities move FAST
- Speed = competitive advantage
- Missing good trades costs more than $99/month
- If trading real money, invest in real tools

**Recommended:** Helius Pro ($99/month, 100 RPS) or QuickNode Build ($49/month, 100 RPS)

---

## Configuration Examples

### Ankr Configuration (.env)

```env
# Ankr RPC (30 RPS free)
SOLANA_RPC_URL=https://rpc.ankr.com/solana/YOUR_API_KEY
SOLANA_RPC_WS=wss://rpc.ankr.com/solana/ws/YOUR_API_KEY

# FAST MODE settings (try with 30 RPS)
FAST_MODE=true
DISCOVERY_SAMPLING=3  # 1 in 3 events
REQUEST_DELAY_MS=50
MAX_CONCURRENT_REQUESTS=3
MIN_LIQUIDITY_SOL=1
```

### Helius Free Tier Configuration (.env)

```env
# Helius Free (10 RPS)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
SOLANA_RPC_WS=wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY

# ULTRA CONSERVATIVE MODE (required for 10 RPS)
FAST_MODE=false
DISCOVERY_SAMPLING=10  # 1 in 10 events
REQUEST_DELAY_MS=100
MAX_CONCURRENT_REQUESTS=1
MIN_LIQUIDITY_SOL=10
```

### Helius Paid Tier Configuration (.env)

```env
# Helius Pro (100 RPS) - $99/month
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
SOLANA_RPC_WS=wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY

# FAST MODE (can process all events)
FAST_MODE=true
DISCOVERY_SAMPLING=1  # Process 100% of events
REQUEST_DELAY_MS=10
MAX_CONCURRENT_REQUESTS=10
MIN_LIQUIDITY_SOL=1
```

---

## Troubleshooting

### 429 "Too Many Requests" Errors

**Symptoms:**
- Logs show "429 Too Many Requests"
- Bot slows down or stops
- Missed trading opportunities

**Solutions:**

1. **Reduce sampling rate:**
   ```env
   DISCOVERY_SAMPLING=10  # Process only 1 in 10 events
   ```

2. **Add request delay:**
   ```env
   REQUEST_DELAY_MS=100  # 100ms delay between requests
   ```

3. **Reduce concurrent requests:**
   ```env
   MAX_CONCURRENT_REQUESTS=1  # Process one at a time
   ```

4. **Upgrade to higher RPS tier:**
   - Switch to Ankr/Chainstack free (30/25 RPS)
   - Or upgrade to paid plan (50-250 RPS)

### Slow Discovery Times

**Symptoms:**
- Takes 15+ minutes to find tokens
- Missing early opportunities

**Solutions:**

1. **Switch to higher RPS provider:**
   - Ankr FREE (30 RPS) → 7-12 min discovery
   - Paid tier (100 RPS) → 1-2 min discovery

2. **Increase sampling:**
   ```env
   DISCOVERY_SAMPLING=3  # Process 1 in 3 instead of 1 in 10
   ```

3. **Lower liquidity threshold:**
   ```env
   MIN_LIQUIDITY_SOL=1  # Lower threshold finds more tokens faster
   ```

---

## Quick Decision Guide

**Choose based on your situation:**

| Your Goal | Recommended Provider | Cost | Setup Time |
|-----------|---------------------|------|------------|
| Just learning | Helius Free (ULTRA CONSERVATIVE) | $0 | 5 min |
| Paper trading (fast) | Ankr Free | $0 | 5 min |
| Paper trading (medium) | Chainstack Free | $0 | 5 min |
| Real trading (budget) | QuickNode Discover | $29/mo | 10 min |
| Real trading (competitive) | Helius Pro or QuickNode Build | $49-99/mo | 10 min |
| High-volume trading | Helius Business | $249/mo | 15 min |

---

## Provider Links

- **Helius:** [helius.dev](https://www.helius.dev/)
- **Ankr:** [ankr.com/rpc/solana](https://www.ankr.com/rpc/solana)
- **Chainstack:** [chainstack.com](https://chainstack.com)
- **QuickNode:** [quicknode.com](https://www.quicknode.com/)
- **Alchemy:** [alchemy.com](https://www.alchemy.com/)

---

## Summary

**For now (learning/paper trading):**
- ✅ Try Ankr FREE (30 RPS) first
- ✅ Falls back to Chainstack FREE (25 RPS) if needed
- ✅ Use Helius FREE with ULTRA CONSERVATIVE mode as last resort

**For later (real trading):**
- 💰 Upgrade to paid tier ($49-99/month)
- 🚀 Get competitive speed (1-2 minute discovery)
- 💪 Handle high volumes without errors

**Remember:** If you're trading real money, invest in proper tools. Speed and reliability are worth $50-100/month.
