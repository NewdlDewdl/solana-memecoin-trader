# Testing Guide - Solana Memecoin Trader

Complete guide for testing your memecoin trading bot with 2 funded wallets.

## ✅ Current Setup Status

Based on your wallet verification:

- **Wallet 1**: 2.0000 SOL ✓ Ready
- **Wallet 2**: 2.0000 SOL ✓ Ready  
- **Wallet 3**: 0.0000 SOL ⚠ Needs funding
- **Total Available**: 4.0000 SOL
- **Status**: PARTIALLY READY (can start testing!)

## 🔍 Verification Scripts

### 1. Test Wallet Setup

Verify your wallet configuration and check balances:

```bash
node test-wallet-setup.js
```

**What it checks:**
- ✓ Private keys are loaded correctly
- ✓ Connection to Solana devnet
- ✓ Current balance of each wallet
- ✓ Which wallets are ready for trading

**Expected output:**
```
Total Wallets:     3
Funded Wallets:    2
Unfunded Wallets:  1
Total SOL:         4.0000 SOL
Status:            PARTIALLY READY
```

### 2. Test Dry-Run Mode

Test bot initialization without trading:

```bash
node test-dry-run.js
```

**What it tests:**
- ✓ Configuration validation
- ✓ Solana connection
- ✓ Wallet manager initialization
- ✓ Balance checking
- ✓ Wallet selection logic

**Expected output:**
```
✅ STATUS: ALL TESTS PASSED
Your bot is ready for testing!
```

## 🚀 Starting the Bot

### Prerequisites Checklist

Before starting, ensure your `.env` file has:

```env
# Critical Settings
WALLET_PRIVATE_KEYS=<your-keys-here>
SOLANA_NETWORK=devnet
DRY_RUN_MODE=true

# RPC Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_RPC_WS=wss://api.devnet.solana.com

# Risk Management
MAX_POSITION_SIZE_SOL=0.1
MAX_TOTAL_EXPOSURE_SOL=1.0
DEFAULT_SLIPPAGE_BPS=300

# Logging
LOG_LEVEL=info
```

### Start the Bot

```bash
npm start
```

The bot will:
1. Load your wallets (automatically use the 2 funded ones)
2. Connect to Solana devnet
3. Initialize all trading modules
4. Start monitoring (in dry-run mode, no actual trades)

### Monitor Mode

Run in monitor-only mode (no trading):

```bash
npm run monitor
```

## 📊 Understanding the Output

### Wallet Status Indicators

- **✓ Ready**: Wallet has > 0.01 SOL, ready for trading
- **⚠ Needs funding**: Wallet has < 0.01 SOL, will be skipped
- **✗ Error**: Problem loading wallet

### Balance Requirements

- Minimum for testing: **0.01 SOL** per wallet
- Recommended for testing: **1-2 SOL** per wallet
- Your current setup: **4 SOL total** across 2 wallets ✓

## 🔐 Safety Features

### Automatic Wallet Management

The bot automatically:
- ✅ Skips wallets with insufficient balance
- ✅ Uses only funded wallets for trades
- ✅ Reserves SOL for transaction fees (0.01 SOL per wallet)
- ✅ Detects when unfunded wallets become available

**This means**: Your 3rd wallet will automatically become available once you fund it - no reconfiguration needed!

### Dry-Run Mode

When `DRY_RUN_MODE=true`:
- ✅ Simulates all trades (no real execution)
- ✅ Logs what would happen
- ✅ Tests all logic safely
- ✅ No SOL spent

**Always start in dry-run mode!**

## 🧪 Testing Scenarios

### Scenario 1: Basic Initialization Test

```bash
# 1. Verify wallets
node test-wallet-setup.js

# 2. Run dry-run test
node test-dry-run.js

# 3. Check logs for errors
```

**Expected**: All checks pass, no errors.

### Scenario 2: Bot Startup Test

```bash
# Ensure DRY_RUN_MODE=true
npm start
```

**Expected**: Bot starts, loads 2 wallets, begins monitoring.

**Watch for**:
- "Loaded 2 wallets with total 4.0000 SOL"
- "All modules initialized"
- "Bot is running"

### Scenario 3: Adding Third Wallet

```bash
# 1. Fund wallet 3 (when rate limit clears)
solana airdrop 2 12sAd6TrDesHFKjFLEsbhGiqGjv7dKEPyxaHXK2fF5jF --url devnet

# 2. Verify it's detected
node test-wallet-setup.js

# 3. Restart bot (if running)
# The bot will now use all 3 wallets
```

**Expected**: Bot automatically detects and uses the newly funded wallet.

## 📁 Log Files

Logs are stored in:
```
logs/
├── trading.log     # All bot activity
└── errors.log      # Error messages only
```

Monitor logs in real-time:
```bash
# Watch all logs
tail -f logs/trading.log

# Watch errors only
tail -f logs/errors.log
```

## ⚠️ Common Issues

### Issue: "No wallets loaded"

**Cause**: `WALLET_PRIVATE_KEYS` not set in `.env`

**Fix**:
```bash
# Check .env file
cat .env | grep WALLET_PRIVATE_KEYS

# Should see your 3 comma-separated keys
```

### Issue: "No suitable wallet available"

**Cause**: All wallets have insufficient balance

**Fix**:
```bash
# Check balances
node test-wallet-setup.js

# Fund wallets if needed
solana airdrop 2 <ADDRESS> --url devnet
```

### Issue: "Configuration validation failed"

**Cause**: Missing or invalid config values

**Fix**:
```bash
# Review .env file for required fields
cat .env

# Compare with .env.example
diff .env .env.example
```

### Issue: "Connection failed"

**Cause**: RPC endpoint unreachable

**Fix**:
```bash
# Test RPC connection
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}'

# Try alternate RPC in .env:
# SOLANA_RPC_URL=https://api.devnet.solana.com
```

## 🎯 Testing Best Practices

### 1. Always Start with Verification

```bash
node test-wallet-setup.js && node test-dry-run.js
```

Only proceed if both pass.

### 2. Start Small

- ✅ Use devnet (free, fake SOL)
- ✅ Enable dry-run mode
- ✅ Set small position sizes (0.1 SOL)
- ✅ Monitor logs closely

### 3. Progressive Testing

**Phase 1**: Dry-run on devnet (current)
- Test all features safely
- Verify wallet management
- Check logging and monitoring

**Phase 2**: Live testing on devnet (after dry-run success)
- Set `DRY_RUN_MODE=false`
- Still using devnet (no real money)
- Execute actual transactions

**Phase 3**: Mainnet (only after extensive devnet testing)
- **Not recommended yet**
- Requires audit and extensive testing
- Start with minimal amounts

### 4. Monitor Continuously

When running tests:
```bash
# Terminal 1: Run bot
npm start

# Terminal 2: Watch logs
tail -f logs/trading.log

# Terminal 3: Monitor balances
watch -n 30 'solana balance ApbYfCj6qVPGH8nzkTkujQMAwQLB8uaLeaUY4WxjryK8 --url devnet'
```

## 🔄 Funding Wallet 3

You have an 8-hour rate limit before you can fund wallet 3. When ready:

### Option 1: Web Faucet
1. Visit https://faucet.solana.com/
2. Enter: `12sAd6TrDesHFKjFLEsbhGiqGjv7dKEPyxaHXK2fF5jF`
3. Request 2 SOL

### Option 2: Solana CLI
```bash
solana airdrop 2 12sAd6TrDesHFKjFLEsbhGiqGjv7dKEPyxaHXK2fF5jF --url devnet
```

### Option 3: Automated Script
```bash
cd ../solana-wallet-generator
./fund-remaining-wallets.sh
```

After funding, verify:
```bash
node test-wallet-setup.js
```

## 📞 Getting Help

### Quick Diagnostics

Run this diagnostic command:
```bash
echo "=== Environment ===" && \
cat .env | grep -v "^#" | grep -v "^$" && \
echo "" && \
echo "=== Wallet Status ===" && \
node test-wallet-setup.js
```

### Check Bot Health

```bash
# View recent logs
tail -50 logs/trading.log

# Check for errors
grep ERROR logs/trading.log | tail -10

# Verify process is running
ps aux | grep "node.*index.js"
```

## ✅ Testing Checklist

Before considering your setup complete:

- [ ] `test-wallet-setup.js` passes
- [ ] `test-dry-run.js` passes
- [ ] At least 2 wallets funded
- [ ] `.env` file configured correctly
- [ ] `DRY_RUN_MODE=true` is set
- [ ] Bot starts without errors
- [ ] Wallets load correctly
- [ ] Can see logs in `logs/` directory
- [ ] Understand how to stop the bot (Ctrl+C)

## 🎓 Next Steps

Once you're comfortable with testing:

1. **Review Strategy Configuration**
   - Edit `config/strategy.json`
   - Adjust entry/exit criteria
   - Set risk parameters

2. **Test Token Discovery**
   - Monitor for new tokens
   - Review safety checks
   - Understand evaluation logic

3. **Study the Codebase**
   - Read `src/README.md` (if exists)
   - Understand module interactions
   - Review risk management code

4. **Plan for Production**
   - Document your strategy
   - Set up monitoring/alerts
   - Define risk limits
   - Create runbook for issues

---

**Remember**: You're working with devnet (fake money) in dry-run mode. This is the perfect environment to learn, experiment, and break things safely! 🚀

For questions or issues, check the logs first, then review this guide.

