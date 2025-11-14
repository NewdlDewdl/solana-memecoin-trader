# Solana Memecoin Trading Bot

Automated trading framework for high-volatility memecoin trading on Solana DEXs (Raydium, Jupiter).

## ⚠️ Disclaimer

**High Risk Trading**: Memecoin trading is extremely high-risk. This bot is for educational purposes. Never invest more than you can afford to lose. Past performance does not guarantee future results.

## Features

### 1. Market Intelligence
- **Real-time Token Discovery**: Monitor Raydium/Jupiter for new token launches
- **Rug-Pull Detection**: Analyze contract safety (mint authority, freeze authority)
- **Liquidity Analysis**: Check pool depth and liquidity ratios
- **Social Sentiment**: Track Twitter/Telegram volume and sentiment
- **Holder Analysis**: Identify whale concentration and dev holdings

### 2. Multi-Wallet Infrastructure
- Parallel execution across multiple wallets
- Automatic position sizing and distribution
- Gas optimization strategies
- Portfolio rebalancing

### 3. Risk Management
- Configurable stop-loss automation
- Position limits per token
- Liquidity depth thresholds
- Slippage tolerance controls
- Maximum exposure caps

### 4. Execution Strategy
- Customizable entry criteria (volume, liquidity, holder count)
- Multiple exit strategies (profit targets, trailing stops)
- MEV protection techniques
- Priority fee optimization

### 5. Monitoring & Logging
- Real-time transaction monitoring
- Performance analytics
- Error logging and alerting
- Trade history database

## Project Structure

```
solana-memecoin-trader/
├── src/
│   ├── intelligence/        # Market analysis modules
│   │   ├── tokenDiscovery.js
│   │   ├── rugDetection.js
│   │   ├── socialMonitor.js
│   │   └── holderAnalysis.js
│   ├── wallet/              # Wallet management
│   │   ├── walletManager.js
│   │   ├── transactionBuilder.js
│   │   └── gasOptimizer.js
│   ├── risk/                # Risk management
│   │   ├── positionManager.js
│   │   ├── stopLoss.js
│   │   └── riskCalculator.js
│   ├── execution/           # Trading execution
│   │   ├── entryStrategy.js
│   │   ├── exitStrategy.js
│   │   └── orderExecutor.js
│   ├── utils/               # Utilities
│   │   ├── logger.js
│   │   ├── database.js
│   │   └── config.js
│   └── index.js             # Main entry point
├── config/
│   ├── default.json         # Default configuration
│   └── strategy.json        # Trading strategy parameters
├── logs/                    # Log files
├── data/                    # Historical data
└── .env.example             # Environment variables template
```

## Documentation

📚 **[Complete Documentation Index](docs/DOCS.md)** - Comprehensive guide to all documentation

### Quick Links

- **Getting Started**: [Quick Start Guide](QUICK_START.md)
- **Configuration**: [Configuration Guide](CONFIGURATION_GUIDE.md)
- **Testing**: [Testing Guide](TESTING_GUIDE.md) | [Live Testing Checklist](LIVE_TESTING_CHECKLIST.md)
- **Features**: [Paper Trading](PAPER_TRADING_GUIDE.md) | [Verbose Logging](VERBOSE_LOGGING_GUIDE.md)
- **Archive**: [Implementation History](docs/archive/) - Historical implementation docs

## Setup

### Prerequisites

- Node.js v18+
- Solana wallet(s) with SOL for trading and gas
- RPC endpoint (Helius, QuickNode, or self-hosted recommended)
- API keys (optional): Twitter API, Telegram Bot

### Installation

1. **Clone/Navigate to project**:
```bash
cd solana-memecoin-trader
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Configure strategy**:
```bash
# Edit config/strategy.json with your trading parameters
```

5. **Add wallet private keys**:
```bash
# CRITICAL: Never commit private keys to version control
# Store in .env file (which should be in .gitignore)
```

## Configuration

### Environment Variables (.env)

```env
# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_RPC_WS=wss://api.mainnet-beta.solana.com

# Private RPC (recommended for production)
# HELIUS_API_KEY=your_helius_key
# QUICKNODE_ENDPOINT=your_quicknode_endpoint

# Wallets (comma-separated private keys in base58)
WALLET_PRIVATE_KEYS=wallet1_key,wallet2_key,wallet3_key

# API Keys (optional)
TWITTER_BEARER_TOKEN=your_twitter_token
TELEGRAM_BOT_TOKEN=your_telegram_token

# Risk Management
MAX_POSITION_SIZE_SOL=0.1
MAX_TOTAL_EXPOSURE_SOL=1.0
DEFAULT_SLIPPAGE_BPS=300

# Logging
LOG_LEVEL=info
```

### Strategy Configuration (config/strategy.json)

```json
{
  "entry": {
    "minLiquidity": 10,
    "minHolders": 50,
    "maxDevHolding": 0.05,
    "requireVerifiedContract": true,
    "socialVolumeThreshold": 100
  },
  "exit": {
    "profitTarget": 2.0,
    "stopLoss": 0.5,
    "trailingStop": true,
    "trailingStopDistance": 0.2
  },
  "risk": {
    "maxPositionPerToken": 0.1,
    "maxConcurrentPositions": 5,
    "minLiquidityDepth": 5
  }
}
```

## Usage

### Start the Bot

```bash
npm start
```

### Monitor Mode (no trading)

```bash
npm run monitor
```

### Development Mode (auto-reload)

```bash
npm run dev
```

### Backtest Strategy

```bash
npm run backtest
```

## Core Modules

### 1. Token Discovery (`src/intelligence/tokenDiscovery.js`)

Monitors DEXs for new token pairs:
- Subscribes to Raydium/Jupiter pool creation events
- Filters based on minimum liquidity criteria
- Extracts token metadata and contract info

### 2. Rug Detection (`src/intelligence/rugDetection.js`)

Analyzes token safety:
- Checks for mint authority (should be revoked)
- Checks for freeze authority (should be revoked)
- Analyzes liquidity lock status
- Calculates holder concentration risk

### 3. Social Monitoring (`src/intelligence/socialMonitor.js`)

Tracks social sentiment:
- Twitter mention volume and sentiment
- Telegram group activity
- Discord community engagement
- Correlation with price movements

### 4. Wallet Manager (`src/wallet/walletManager.js`)

Manages multiple trading wallets:
- Load wallets from encrypted storage
- Distribute positions across wallets
- Balance monitoring and rebalancing
- Transaction signing and submission

### 5. Position Manager (`src/risk/positionManager.js`)

Controls risk exposure:
- Calculates position sizes based on risk parameters
- Enforces maximum exposure limits
- Manages concurrent positions
- Tracks P&L per position

### 6. Order Executor (`src/execution/orderExecutor.js`)

Executes trades:
- Builds swap transactions via Jupiter API
- Optimizes for best price and slippage
- Implements MEV protection (Jito bundles)
- Retries failed transactions with adjusted fees

## Safety Features

### Contract Verification Checklist

Before entering any position, the bot verifies:

- ✅ Mint authority is revoked (prevents unlimited minting)
- ✅ Freeze authority is revoked (prevents freezing tokens)
- ✅ Liquidity is locked or burned
- ✅ Reasonable holder distribution (no single whale >10%)
- ✅ Sufficient liquidity depth for entry/exit
- ✅ Contract is verified on Solana Explorer

### Risk Controls

- **Stop-Loss**: Automatic exit if price drops below threshold
- **Position Limits**: Never exceed configured SOL per position
- **Exposure Caps**: Total portfolio exposure limited
- **Slippage Protection**: Reject trades with excessive slippage
- **Liquidity Checks**: Ensure sufficient liquidity before entry

## Monitoring & Alerts

### Logs

All events are logged to:
- Console (real-time)
- `logs/trading.log` (file)
- `logs/errors.log` (errors only)

### Alerts

Configure alerts for:
- Successful trades (entry/exit)
- Failed transactions
- Risk limit breaches
- Large P&L movements

## Performance Tracking

The bot maintains a database of:
- All executed trades
- Entry/exit prices and timestamps
- Slippage and fees
- P&L per trade
- Win rate and average returns

Access performance dashboard:
```bash
node src/analytics.js
```

## Advanced Features

### MEV Protection

Use Jito bundles to protect against frontrunning:
```javascript
// Enabled in config/strategy.json
{
  "execution": {
    "useMevProtection": true,
    "jitoTipLamports": 10000
  }
}
```

### Priority Fees

Optimize transaction priority:
```javascript
// Dynamic priority fee calculation
{
  "execution": {
    "dynamicPriorityFee": true,
    "maxPriorityFeeLamports": 100000
  }
}
```

### Parallel Execution

Execute across multiple wallets simultaneously:
```javascript
// Distribute 1 SOL position across 5 wallets = 0.2 SOL each
{
  "wallet": {
    "parallelExecution": true,
    "distributePositions": true
  }
}
```

## Troubleshooting

### Common Issues

**RPC Rate Limiting**:
- Use a private RPC endpoint (Helius, QuickNode)
- Implement request throttling
- Cache frequently accessed data

**Failed Transactions**:
- Increase slippage tolerance
- Raise priority fees
- Check wallet SOL balance for gas

**Missed Opportunities**:
- Optimize token discovery latency
- Use WebSocket subscriptions instead of polling
- Consider dedicated/low-latency RPC

## Security Best Practices

1. **Never commit private keys** - Use `.env` file (add to `.gitignore`)
2. **Use separate wallets** - Don't use your main wallet
3. **Start small** - Test with minimal SOL amounts
4. **Monitor actively** - Don't run unattended initially
5. **Secure RPC** - Use authenticated endpoints
6. **Regular audits** - Review trade logs frequently

## Disclaimer & Risk Warning

**THIS SOFTWARE IS PROVIDED FOR EDUCATIONAL PURPOSES ONLY**

Memecoin trading involves extreme risk:
- Most memecoins lose 90%+ of value
- Rug pulls and scams are common
- High volatility can cause total loss
- No guarantees of profit
- You can lose everything

**Only trade with money you can afford to lose entirely.**

The developers assume no liability for financial losses.

## Development Roadmap

- [ ] Add machine learning price prediction
- [ ] Implement copy-trading features
- [ ] Add support for more DEXs (Orca, Meteora)
- [ ] Build web dashboard for monitoring
- [ ] Add Telegram bot for mobile alerts
- [ ] Implement advanced TA indicators
- [ ] Add paper trading mode
- [ ] Build strategy backtesting framework

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Test thoroughly
4. Submit a pull request

## License

MIT License - See LICENSE file

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Trade responsibly. Do your own research. Never invest more than you can afford to lose.**
