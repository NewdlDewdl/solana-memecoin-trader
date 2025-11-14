# 🔧 Configuration Guide for Real Trading

## Required .env Variables

Add these variables to your `.env` file:

```bash
# ========================================
# TRADING MODE
# ========================================
TRADING_MODE=paper  # Change to "live" for real trading
USE_REAL_PRICES=false  # Set to true to use real prices in paper mode

# ========================================
# REAL TRADING
# ========================================
MAX_POSITION_SIZE_SOL=0.1  # Start with 0.1 SOL per trade
SLIPPAGE_BPS=100  # 1% slippage tolerance

# ========================================
# DEX CONFIGURATION
# ========================================
JUPITER_ENABLED=true
RAYDIUM_ENABLED=false
PREFER_DEX=jupiter

# ========================================
# MEV PROTECTION (JITO)
# ========================================
JITO_ENABLED=true
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
JITO_TIP_LAMPORTS=100000  # 0.0001 SOL base tip
JITO_HIGH_PRIORITY_TIP_LAMPORTS=500000  # 0.0005 SOL
JITO_CRITICAL_TIP_LAMPORTS=1000000  # 0.001 SOL

# ========================================
# SAFETY LIMITS
# ========================================
MAX_DRAWDOWN_PERCENT=20
MAX_CONSECUTIVE_LOSSES=5
MIN_SOL_BALANCE=0.5
MAX_PORTFOLIO_HEAT=80
EMERGENCY_STOP_FILE=.stop

# ========================================
# ADVANCED (Optional - has defaults)
# ========================================
PRIORITY_FEE_MICRO_LAMPORTS=50000
COMPUTE_UNIT_LIMIT=200000
MAX_RETRIES=3
RETRY_DELAY_MS=2000
RPC_TIMEOUT_MS=30000
```

## Configuration for Different Modes

### Paper Trading (Testing)
```bash
TRADING_MODE=paper
USE_REAL_PRICES=false
PAPER_TRADING_ENABLED=true
PAPER_TRADING_STARTING_BALANCE=10
```

### Paper Trading with Real Prices (Advanced Testing)
```bash
TRADING_MODE=paper
USE_REAL_PRICES=true  # Uses Jupiter prices but simulates trades
PAPER_TRADING_ENABLED=true
PAPER_TRADING_STARTING_BALANCE=10
```

### Live Trading - Testing Phase (0.1 SOL per trade)
```bash
TRADING_MODE=live
MAX_POSITION_SIZE_SOL=0.1
JITO_ENABLED=true
MAX_DRAWDOWN_PERCENT=20
MIN_SOL_BALANCE=0.5
```

### Live Trading - Production (Larger positions)
```bash
TRADING_MODE=live
MAX_POSITION_SIZE_SOL=0.5  # Or whatever you're comfortable with
JITO_ENABLED=true
MAX_DRAWDOWN_PERCENT=15  # Tighter control
MIN_SOL_BALANCE=1.0  # Higher reserve
```

## Safety Configuration

### Safety Score Thresholds

The bot assigns each token a safety score (0-100) based on rug-pull detection analysis. You can configure the minimum acceptable score:

**Configuration Location:** `src/index.js` (line ~199)

```javascript
// Safety threshold check
if (rugAnalysis.safetyScore < MINIMUM_SAFETY_SCORE) {
  // Token rejected
}
```

**Recommended Thresholds:**

| Mode | Threshold | Description | Risk Level |
|------|-----------|-------------|------------|
| **Paper Trading** | 40 | Accept moderate-risk tokens for practice | Medium |
| **Conservative Real Trading** | 60 | Only accept safer tokens | Low-Medium |
| **Very Conservative** | 70+ | Only accept very safe tokens (rare) | Low |

**Understanding Safety Scores:**

- **70-100:** Very safe (rare in memecoin markets)
  - Liquidity locked, authority revoked, good holder distribution
  - May wait hours/days to find these

- **60-69:** Moderately safe
  - Most safety checks pass
  - Acceptable for real trading with small positions

- **40-59:** Higher risk (common for new memecoins)
  - Some red flags present
  - Good for paper trading practice
  - Not recommended for real money

- **0-39:** High risk
  - Multiple red flags
  - Likely scams or rugs
  - Always rejected

**Paper Trading Recommendation:**

For paper trading, lowering the threshold to 40 allows you to:
- ✅ See more trading activity
- ✅ Practice with moderate-risk tokens
- ✅ Learn bot behavior without risking funds
- ✅ Still filter out obvious scams (0-39)

**Real Trading Recommendation:**

For real trading, keep threshold at 60+ to:
- ✅ Reduce risk of rug pulls
- ✅ Focus on safer opportunities
- ✅ Accept slower pace (higher quality)
- ⚠️ May wait longer for trades

**How to Change Threshold:**

Edit `src/index.js` around line 199:

```javascript
// For paper trading (more activity)
if (rugAnalysis.safetyScore < 40) {

// For real trading (safer tokens)
if (rugAnalysis.safetyScore < 60) {
```

### Risk Management Presets

#### Conservative (Recommended for beginners)
```bash
# src/index.js
MIN_SAFETY_SCORE=60  # Code level threshold

# .env
MAX_DRAWDOWN_PERCENT=15
MAX_CONSECUTIVE_LOSSES=3
MAX_PORTFOLIO_HEAT=50
MAX_POSITION_SIZE_SOL=0.1
MIN_LIQUIDITY_SOL=10
```

#### Moderate
```bash
# src/index.js
MIN_SAFETY_SCORE=50

# .env
MAX_DRAWDOWN_PERCENT=20
MAX_CONSECUTIVE_LOSSES=5
MAX_PORTFOLIO_HEAT=80
MAX_POSITION_SIZE_SOL=0.5
MIN_LIQUIDITY_SOL=5
```

#### Aggressive (Not recommended)
```bash
# src/index.js
MIN_SAFETY_SCORE=40

# .env
MAX_DRAWDOWN_PERCENT=30
MAX_CONSECUTIVE_LOSSES=10
MAX_PORTFOLIO_HEAT=90
MAX_POSITION_SIZE_SOL=1.0
MIN_LIQUIDITY_SOL=1
```

## RPC Configuration

### Helius (Recommended)
```bash
MAINNET_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

Get your API key: https://www.helius.dev/

### Public RPC (Not recommended for live trading)
```bash
MAINNET_RPC_URL=https://api.mainnet-beta.solana.com
```

## Emergency Stop

Create a file named `.stop` in the bot directory to trigger immediate shutdown:

```bash
touch .stop  # Emergency stop
rm .stop     # Re-enable trading
```

The bot checks for this file every 30 seconds.

## Environment Variables Priority

1. `.env` file variables (highest priority)
2. System environment variables
3. Default values in code (lowest priority)

## Validation Checklist

Before starting the bot, verify:

- [ ] `TRADING_MODE` is set correctly (paper or live)
- [ ] `WALLET_PRIVATE_KEYS` are valid base58 encoded keys
- [ ] `SOLANA_RPC_URL` is working (test with `curl`)
- [ ] `MAX_POSITION_SIZE_SOL` is small for testing (0.1 SOL)
- [ ] `JITO_ENABLED=true` if trading live
- [ ] Safety limits are configured (`MAX_DRAWDOWN_PERCENT`, etc.)
- [ ] Minimum balance is set (`MIN_SOL_BALANCE`)
- [ ] Emergency stop file path is correct

## Testing Your Configuration

Run this command to test your configuration:

```bash
node test-price-feeds.js
```

This will verify:
- RPC connection works
- Jupiter API is accessible
- Price feeds are functioning
- No configuration errors

## Common Issues

### "No RPC URL configured"
- Set `MAINNET_RPC_URL` or `SOLANA_RPC_URL` in .env

### "Invalid private key"
- Ensure keys are base58 encoded (not JSON or hex)
- Use the `export-to-env.js` script from solana-wallet-generator

### "429 Too Many Requests"
- You've hit RPC rate limits
- Upgrade to Helius paid tier
- Increase `DISCOVERY_SAMPLING_RATE`

### "Insufficient balance"
- Your wallet doesn't have enough SOL
- Add funds or decrease `MAX_POSITION_SIZE_SOL`

### "Jito bundle failed"
- Check `JITO_BLOCK_ENGINE_URL` is correct
- Increase `JITO_TIP_LAMPORTS`
- Set `JITO_ENABLED=false` to disable temporarily

## Need Help?

1. Check logs in `logs/combined.log`
2. Run `node show-paper-trading-balance.js` for status
3. Review `TESTING_GUIDE.md` for troubleshooting
4. Check safety monitor status in logs

## Security Reminders

⚠️ **NEVER commit your .env file to git**
⚠️ **NEVER share your private keys**
⚠️ **Start with paper trading**
⚠️ **Use small positions when going live**
⚠️ **Monitor constantly in first 24 hours**

