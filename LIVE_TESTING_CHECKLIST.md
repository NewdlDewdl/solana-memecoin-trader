# 🚀 Live Trading Testing Checklist

## ⚠️ IMPORTANT WARNINGS

Before starting live trading with real money:

1. **Start small** - Use maximum 0.1 SOL per trade initially
2. **Monitor constantly** - Watch the bot for the first 2-4 hours
3. **Have emergency stop ready** - Know how to stop the bot quickly (`touch .stop`)
4. **Accept losses** - Only trade with money you can afford to lose
5. **Test on paper first** - Run paper trading for at least 24 hours successfully
6. **Upgrade RPC** - Use a paid RPC (Helius recommended) for live trading

---

## Phase 0: Pre-Testing Requirements

### ✅ Paper Trading Validation

- [ ] Paper trading has run successfully for 24+ hours
- [ ] Multiple successful paper trades executed (at least 10)
- [ ] Exit strategy working correctly (stop-loss, take-profit, trailing stop)
- [ ] No critical errors in logs
- [ ] Performance acceptable (win rate >30%, no major bugs)

### ✅ RPC Provider

- [ ] Using a paid/upgraded RPC provider (Helius recommended)
- [ ] RPC rate limit is sufficient (>100 requests/second recommended)
- [ ] RPC connection is stable (no 429 errors in paper trading)

### ✅ Wallet Preparation

- [ ] Primary wallet has sufficient SOL (minimum 2 SOL recommended)
- [ ] Wallet private key is correctly configured in `.env`
- [ ] Wallet can send transactions (test with small transfer if unsure)
- [ ] SOL for transaction fees is available (0.5 SOL reserve)

### ✅ Configuration Review

- [ ] `.env` file reviewed and validated
- [ ] `TRADING_MODE=live` is NOT yet set (will set in Phase 1)
- [ ] `MAX_POSITION_SIZE_SOL=0.1` (or your comfortable amount)
- [ ] `SLIPPAGE_BPS=100` (1% - reasonable for testing)
- [ ] `JUPITER_ENABLED=true`
- [ ] `JITO_ENABLED=true` (for MEV protection)
- [ ] Safety limits configured (MAX_DRAWDOWN_PERCENT, MAX_CONSECUTIVE_LOSSES, etc.)
- [ ] Emergency stop file path is correct (`EMERGENCY_STOP_FILE=.stop`)

---

## Phase 1: Component Testing (No Real Trades)

### Test 1: Price Feeds

```bash
node test-price-feeds.js
```

**Expected Results:**
- ✅ Jupiter API returns prices for USDC, BONK
- ✅ Prices are within reasonable range
- ✅ Cache is working (second call is faster)
- ✅ No errors or timeouts

**Checklist:**
- [ ] Test passed
- [ ] No errors in output
- [ ] Prices match market rates (check CoinGecko/Jupiter)

### Test 2: Swap Dry Run

```bash
node test-swap-dry-run.js
```

**Expected Results:**
- ✅ Quotes received from Jupiter
- ✅ No errors building transactions
- ✅ Token accounts can be checked

**Checklist:**
- [ ] Test passed
- [ ] Quotes are reasonable (check against Jupiter UI)
- [ ] No RPC errors

### Test 3: Emergency Stops

```bash
node test-emergency-stops.js
```

**Expected Results:**
- ✅ All 6 circuit breaker tests pass
- ✅ Emergency stop file detection works
- ✅ Recovery after reset works

**Checklist:**
- [ ] All tests passed
- [ ] No errors
- [ ] Emergency stop file mechanism works

---

## Phase 2: Configuration for Live Trading

### Update `.env` File

Make the following changes in your `.env` file:

```bash
# Set trading mode to LIVE
TRADING_MODE=live

# Set small position size for testing
MAX_POSITION_SIZE_SOL=0.1

# Ensure safety limits are strict
MAX_DRAWDOWN_PERCENT=15  # Lower than default for testing
MAX_CONSECUTIVE_LOSSES=3  # Lower than default for testing
MIN_SOL_BALANCE=0.5

# Enable MEV protection
JITO_ENABLED=true
```

### Verification

- [ ] `.env` changes saved
- [ ] `TRADING_MODE=live` confirmed
- [ ] Position size is small (0.1 SOL or less)
- [ ] Safety limits are strict

---

## Phase 3: First Live Trade (Supervised)

### Preparation

1. Open 3 terminal windows:
   - Terminal 1: Run the bot
   - Terminal 2: Watch logs (`tail -f logs/combined.log`)
   - Terminal 3: Watch dashboard (`watch -n 10 node show-trading-dashboard.js`)

2. Have browser ready:
   - Solscan open to track transactions
   - Helius dashboard to monitor RPC usage
   - Jupiter UI for price verification

### Start the Bot

```bash
npm start
```

### Monitor Carefully

Watch for these log messages in order:

1. **Bot Initialization:**
   - [ ] `✅ Bot initialized successfully`
   - [ ] `✅ Price Feed Manager initialized`
   - [ ] `✅ Swap Executor initialized (LIVE TRADING)`
   - [ ] `✅ Jito Manager initialized (MEV Protection enabled)`
   - [ ] `✅ Safety Monitor initialized`

2. **First Token Discovery:**
   - [ ] `🆕 Analyzing new token: [address]`
   - [ ] Safety score is calculated
   - [ ] Holder analysis completes

3. **First Trade Decision:**
   - [ ] `✅ Entry approved for [token]`
   - [ ] `🔴 LIVE TRADING: Executing REAL BUY`
   - [ ] `⚠️  REAL MONEY: X SOL will be spent`

4. **Safety Check:**
   - [ ] Safety check passes before trade
   - [ ] No circuit breaker warnings

5. **Swap Execution:**
   - [ ] `🛡️  Using Jito bundle for MEV protection...` (if Jito enabled)
   - [ ] Quote received successfully
   - [ ] Transaction signed
   - [ ] Simulation successful
   - [ ] Transaction sent
   - [ ] `✅ LIVE TRADE EXECUTED!`
   - [ ] Signature displayed

### Verify First Trade

Immediately after first trade:

1. **Check Solscan:**
   - [ ] Open transaction link from logs
   - [ ] Transaction is `Success`
   - [ ] SOL was spent correctly
   - [ ] Tokens were received

2. **Check Wallet Balance:**
   - [ ] SOL balance decreased by trade amount + fees
   - [ ] Token balance increased
   - [ ] Sufficient SOL remains for more trades

3. **Check Dashboard:**
   ```bash
   node show-trading-dashboard.js
   ```
   - [ ] Transaction logged correctly
   - [ ] Statistics updated

### First Trade Checklist

- [ ] Trade executed successfully
- [ ] Transaction confirmed on-chain
- [ ] Tokens received correctly
- [ ] Dashboard updated
- [ ] No errors or warnings
- [ ] Safety monitor shows healthy state

**If any issues occurred:**
- Stop the bot immediately (`Ctrl+C` or `touch .stop`)
- Review logs for errors
- Fix issues before continuing
- Consider reverting to paper trading

**If everything succeeded:**
- ✅ Proceed to Phase 4

---

## Phase 4: Exit Testing

### Wait for Exit Condition

The bot should automatically exit the position based on:
- Stop-loss (-30%)
- Take-profit (+50%)
- Trailing stop (15% from peak)
- Max hold time (30 minutes)

### Monitor Exit

Watch logs for:
- [ ] `🚪 EXIT: [token] | [reason]`
- [ ] Sell transaction sent
- [ ] `✅ LIVE TRADE EXECUTED!` (sell)
- [ ] P&L calculated and displayed

### Verify Exit

1. **Check Solscan:**
   - [ ] Sell transaction confirmed
   - [ ] Tokens sold for SOL
   - [ ] SOL received back

2. **Check P&L:**
   - [ ] Profit/loss matches expectations
   - [ ] Transaction fees accounted for

### Exit Testing Checklist

- [ ] Exit triggered automatically
- [ ] Exit reason was appropriate
- [ ] Sell executed successfully
- [ ] P&L calculated correctly
- [ ] Position closed properly

---

## Phase 5: Multi-Trade Testing

### Run for 2-4 Hours

Let the bot run and execute 5-10 trades automatically.

### Monitor Every 15-30 Minutes

Check:
- [ ] Bot is still running (no crashes)
- [ ] Trades are executing correctly
- [ ] No repeated errors in logs
- [ ] Safety monitor shows healthy state
- [ ] RPC usage is within limits
- [ ] Wallet balance is reasonable

### Performance Check

After 5-10 trades, run:

```bash
node show-trading-dashboard.js
```

Verify:
- [ ] Success rate >80% (transactions confirmed)
- [ ] Win rate is reasonable (>20%)
- [ ] Average win > average loss (or close)
- [ ] No huge unexpected losses
- [ ] Transaction costs <1% per trade

### Safety Monitor Check

Verify safety monitor is working:
- [ ] No circuit breaker false positives
- [ ] Consecutive losses tracked correctly
- [ ] Drawdown calculated correctly
- [ ] RPC failures logged if any occurred

---

## Phase 6: Emergency Stop Testing

### Test Manual Stop

While bot is running:

```bash
touch .stop
```

**Expected:**
- [ ] Bot detects stop file within 30 seconds
- [ ] `🚨 CIRCUIT BREAKER TRIGGERED` message
- [ ] Reason: `MANUAL_STOP`
- [ ] Bot stops accepting new trades
- [ ] Any open positions remain (not auto-closed)

### Remove Stop File

```bash
rm .stop
```

Then restart the bot:

```bash
npm start
```

**Expected:**
- [ ] Bot starts normally
- [ ] No stop file detected
- [ ] Trading resumes

### Emergency Stop Checklist

- [ ] Manual stop worked
- [ ] Bot stopped trading immediately
- [ ] Bot can restart after removing stop file

---

## Phase 7: Extended Testing (24 Hours)

### Day-Long Test

After successful short-term testing, run for 24 hours:

1. **Start with confidence:**
   - All previous phases passed
   - No major issues found
   - Position size still small (0.1 SOL)

2. **Check periodically:**
   - Every 2-4 hours during waking hours
   - Once before bed
   - Once upon waking

3. **Monitor metrics:**
   ```bash
   node show-trading-dashboard.js
   ```

### 24-Hour Checklist

After 24 hours:

- [ ] Bot ran continuously (or with expected restarts)
- [ ] 20+ trades executed successfully
- [ ] Overall P&L is reasonable (not massive losses)
- [ ] Win rate >25%
- [ ] Success rate (confirmed txs) >85%
- [ ] No critical bugs or crashes
- [ ] RPC costs are acceptable
- [ ] Transaction fees are reasonable
- [ ] Jito bundles landed successfully (>90%)
- [ ] Safety monitor never false-triggered
- [ ] Comfortable with bot's performance

---

## Phase 8: Scale-Up Decision

### If 24-Hour Test Passed

You can consider scaling up. Options:

**Option A: Increase Position Size**
```bash
# In .env
MAX_POSITION_SIZE_SOL=0.2  # or 0.5, based on comfort
```

**Option B: Add More Capital**
- Add more SOL to wallet
- Keep position size the same
- Allow more concurrent trades

**Option C: Relax Safety Limits**
```bash
# In .env
MAX_DRAWDOWN_PERCENT=20  # from 15
MAX_CONSECUTIVE_LOSSES=5  # from 3
```

### Scale-Up Checklist

- [ ] 24-hour test passed completely
- [ ] Comfortable with bot's decisions
- [ ] Understand risks involved
- [ ] Have monitoring plan for scaled operation
- [ ] Know how to handle issues

---

## Emergency Procedures

### If Something Goes Wrong

**Immediate Actions:**

1. **Stop the bot:**
   ```bash
   touch .stop
   # OR
   pkill -9 -f 'node.*index.js'
   ```

2. **Check open positions:**
   ```bash
   node show-trading-dashboard.js
   ```

3. **Review logs:**
   ```bash
   tail -100 logs/combined.log | grep -i error
   ```

### Common Issues

**Issue: Trades failing repeatedly**
- Check RPC connection
- Check wallet SOL balance
- Review slippage settings
- Check Jupiter API status

**Issue: Unexpected losses**
- Review exit strategy settings
- Check for MEV/sandwich attacks (enable Jito if not already)
- Verify token analysis is working correctly

**Issue: Circuit breaker triggered**
- Review logs for trigger reason
- Fix underlying issue
- Reset circuit breaker: restart bot after fixing issue

**Issue: Out of SOL**
- Add more SOL to wallet
- Reduce position size
- Review fee settings

---

## Final Checklist Before Going Live

Before enabling live trading for the first time:

- [ ] All paper trading tests passed
- [ ] All component tests passed
- [ ] Upgraded RPC provider configured
- [ ] Wallet has sufficient SOL (2+ SOL recommended)
- [ ] `.env` configuration reviewed and correct
- [ ] Position size is small (0.1 SOL)
- [ ] Safety limits are strict
- [ ] Emergency stop procedure understood
- [ ] Monitoring plan in place
- [ ] Comfortable with potential losses
- [ ] Have set aside time to monitor first trades
- [ ] Know how to stop the bot quickly
- [ ] Have reviewed all documentation

---

## Success Metrics

After successful testing, you should see:

- **Technical Success:**
  - ✅ >90% transaction success rate
  - ✅ >90% Jito bundle land rate
  - ✅ No critical errors or crashes
  - ✅ Emergency stops work correctly

- **Trading Success:**
  - ✅ Win rate >25%
  - ✅ Profit factor >1.0 (avg win / avg loss)
  - ✅ Max drawdown within acceptable limits
  - ✅ Transaction costs <2% per trade

- **Operational Success:**
  - ✅ Bot runs reliably for 24+ hours
  - ✅ Comfortable with bot's decisions
  - ✅ Can monitor and intervene when needed
  - ✅ Issues can be debugged and fixed

---

## Post-Testing

### If Testing Failed

- [ ] Document what went wrong
- [ ] Fix issues identified
- [ ] Retest from appropriate phase
- [ ] Consider extended paper trading

### If Testing Succeeded

- [ ] Document successful configuration
- [ ] Set up ongoing monitoring
- [ ] Plan capital allocation
- [ ] Set profit-taking goals
- [ ] Plan regular reviews

---

## Support

If you encounter issues:

1. Check logs: `logs/combined.log`
2. Review this checklist
3. Consult `CONFIGURATION_GUIDE.md`
4. Check `TESTING_GUIDE.md`
5. Review transaction history: `node show-trading-dashboard.js`

---

## Remember

- Start small
- Monitor closely
- Accept losses as learning
- Scale up gradually
- Have fun and trade responsibly!

🚀 Good luck with your live trading! 🚀

