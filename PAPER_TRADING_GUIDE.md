# 📝 Paper Trading Guide

## What is Paper Trading?

Paper trading lets you test your trading strategy with **simulated money** while monitoring **real market data**. It's the perfect way to:

- ✅ Learn how the bot works without risk
- ✅ Test and refine your strategy
- ✅ Build confidence before using real money
- ✅ Track performance metrics (win rate, P&L, etc.)

## Features

### 1. Simulated Balance
- Start with a configurable SOL balance (default: 10 SOL)
- Balance updates with each simulated trade
- No real money at risk

### 2. Position Tracking
- Tracks all open positions with entry price, quantity, and current P&L
- Updates in real-time based on actual market prices
- Calculates unrealized profit/loss

### 3. Performance Analytics
- **Win Rate**: Percentage of profitable trades
- **Total P&L**: Overall profit or loss
- **Profit Factor**: Ratio of total wins to total losses
- **Largest Win/Loss**: Best and worst trades
- **Average Win/Loss**: Average profit per winning/losing trade

### 4. Trade History
- All trades saved to `paper-trades.json`
- Review past performance anytime
- Includes entry/exit prices, hold time, and reason for exit

## Configuration

Edit your `.env` file:

```env
# Enable paper trading
PAPER_TRADING_ENABLED=true

# Starting balance (in SOL)
PAPER_TRADING_STARTING_BALANCE=10

# Report interval (milliseconds) - 300000 = 5 minutes
PAPER_TRADING_REPORT_INTERVAL=300000

# Must be in dry-run mode for paper trading
DRY_RUN_MODE=true
```

## Quick Start

### Option 1: Run the Demo

See paper trading in action with simulated scenarios:

```bash
node demo-paper-trading.js
```

This shows:
- Buying and selling tokens
- Tracking P&L
- Win/loss scenarios
- Performance reporting

### Option 2: Start the Bot (Coming Soon)

The bot will automatically use paper trading when `DRY_RUN_MODE=true` and `PAPER_TRADING_ENABLED=true`:

```bash
npm start
```

## Understanding the Output

### When Paper Trading is Active

```
[PAPER BUY] DOGE2 | 0.5000 SOL @ 0.00001000 SOL/token
[PAPER] Balance: 9.5000 SOL | Positions: 1
```

- Shows simulated buy with amount and price
- Updates remaining balance
- Tracks number of open positions

### Position Updates

```
[PAPER] DOGE2: +0.2500 SOL (+50.00%)
```

- Real-time unrealized P&L for open positions
- Updates as market price changes

### When Closing a Position

```
[PAPER SELL] DOGE2 | 0.7500 SOL @ 0.00001500 SOL/token
[PAPER] P&L: +0.2500 SOL (+50.00%) | Reason: take_profit
[PAPER] Balance: 10.2500 SOL | Positions: 0
```

- Shows exit price and proceeds
- Calculates realized profit/loss
- Explains why position was closed

## Performance Reports

### Automatic Reports

Every 5 minutes (configurable), you'll see a report like:

```
================================================================================
📊 PAPER TRADING PERFORMANCE REPORT
================================================================================

💰 Portfolio:
  Starting Balance:    10.0000 SOL
  Current Balance:     9.6500 SOL
  Portfolio Value:     9.9800 SOL
  Total P&L:           -0.0200 SOL (-0.20%)

📈 Positions:
  Open Positions:      1
    • SHIB4: +0.0300 SOL (+10.00%) [5m]

🎯 Trading Stats:
  Total Trades:        2
  Wins:                1 (50.0%)
  Losses:              1
  Avg Win:             +0.2500 SOL
  Avg Loss:            -0.3000 SOL
  Profit Factor:       0.83x
  Largest Win:         +0.2500 SOL
  Largest Loss:        -0.3000 SOL

📜 Recent Trades (Last 5):
    ✗ PEPE3: -0.3000 SOL (-30.00%) [15m] - stop_loss
    ✓ DOGE2: +0.2500 SOL (+50.00%) [8m] - take_profit
================================================================================
```

### Manual Report

Check performance anytime by reviewing `paper-trades.json`

## Key Metrics Explained

### Win Rate
```
Wins: 3 (60.0%)
```
- Percentage of trades that were profitable
- Higher is better (>50% is good)

### Profit Factor
```
Profit Factor: 1.50x
```
- Total profit divided by total loss
- >1.0 means profitable overall
- 2.0+ is excellent

### Average Win/Loss
```
Avg Win:  +0.3000 SOL
Avg Loss: -0.1500 SOL
```
- Shows if your wins are bigger than losses
- Important for profitability even with <50% win rate

## Tips for Paper Trading

### 1. Start Conservative
- Use the default 10 SOL starting balance
- Don't try to trade everything
- Focus on learning the bot's behavior

### 2. Track Your Results
- Review `paper-trades.json` regularly
- Look for patterns in winning/losing trades
- Adjust strategy based on data

### 3. Set Realistic Goals
- Target >50% win rate
- Aim for profit factor >1.5
- Keep average losses smaller than average wins

### 4. Test Different Scenarios
- Run during different market conditions
- Try various time windows
- Adjust risk parameters and observe results

### 5. Transition to Real Trading
When you're confident:
- Achieve consistent paper trading profits for 1-2 weeks
- Understand why trades win/lose
- Have a clear strategy
- Start with small amounts (0.1-0.5 SOL)

## Common Questions

### Q: Why is my paper trading P&L different from real trading?
**A:** Paper trading assumes perfect execution at exact prices. Real trading has:
- Slippage (price moves before your order fills)
- Trading fees (~0.3% per trade)
- Network congestion (slower execution)

### Q: Can I reset my paper trading balance?
**A:** Yes! Delete `paper-trades.json` and restart. Or edit `PAPER_TRADING_STARTING_BALANCE` in `.env`

### Q: How accurate is paper trading?
**A:** Very accurate for testing strategy logic. Less accurate for:
- High-frequency trading (execution speed matters)
- Low liquidity tokens (slippage can be high)
- Extreme market conditions

### Q: Should I paper trade on devnet or mainnet?
**A:** 
- **Mainnet**: Real market data, realistic testing (recommended)
- **Devnet**: Lower activity, less realistic but free to experiment

## Files Created

- `paper-trades.json` - Trade history and stats
- `logs/trading.log` - Detailed bot logs

## Next Steps

1. ✅ Run the demo: `node demo-paper-trading.js`
2. ⏭️ Configure your strategy in `.env`
3. ⏭️ Start the bot: `npm start`
4. ⏭️ Monitor performance for 1-2 weeks
5. ⏭️ Refine strategy based on results
6. ⏭️ When confident, switch to real trading

## Safety Reminder

🛡️ Paper trading uses ZERO real money. Even though you're connected to mainnet and seeing real market data, **NO ACTUAL TRADES ARE EXECUTED** when:
- `DRY_RUN_MODE=true`
- `PAPER_TRADING_ENABLED=true`

All trades are simulated in memory and logged to files.

---

**Ready to start?** Run `node demo-paper-trading.js` to see it in action! 🚀

