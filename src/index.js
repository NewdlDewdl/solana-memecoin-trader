import { Connection } from '@solana/web3.js';
import ThrottledConnection from './utils/ThrottledConnection.js';
import config from './utils/config.js';
import { logger } from './utils/logger.js';
import database from './utils/database.js';

// Intelligence modules
import { TokenDiscovery } from './intelligence/tokenDiscovery.js';
import { RugDetection } from './intelligence/rugDetection.js';
import { SocialMonitor } from './intelligence/socialMonitor.js';
import { HolderAnalysis } from './intelligence/holderAnalysis.js';

// Wallet modules
import { WalletManager } from './wallet/walletManager.js';
import { TransactionBuilder } from './wallet/transactionBuilder.js';
import { GasOptimizer } from './wallet/gasOptimizer.js';

// Risk modules
import { PositionManager } from './risk/positionManager.js';
import { StopLoss } from './risk/stopLoss.js';
import { RiskCalculator } from './risk/riskCalculator.js';

// Execution modules
import { EntryStrategy } from './execution/entryStrategy.js';
import { ExitStrategy } from './execution/exitStrategy.js';
import { OrderExecutor } from './execution/orderExecutor.js';
import SwapExecutor from './execution/swapExecutor.js';
import JitoManager from './execution/jitoManager.js';

// Paper Trading
import PaperTradingManager from './paperTrading/paperTradingManager.js';
import ExitMonitor from './execution/exitMonitor.js';

// Price Feeds
import PriceFeedManager from './pricing/priceFeedManager.js';

// Safety
import SafetyMonitor from './safety/safetyMonitor.js';

/**
 * Main Memecoin Trading Bot
 */
class MememcoinTradingBot {
  constructor() {
    this.config = config.getConfig();
    this.connection = null;
    this.isRunning = false;
    this.modules = {};
  }

  /**
   * Initialize the bot
   */
  async initialize() {
    logger.info('🚀 Initializing Memecoin Trading Bot...');

    try {
      // Validate configuration
      const validation = config.validate();
      if (!validation.valid) {
        throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
      }

      // Initialize Solana connection with throttling
      this.connection = new ThrottledConnection(
        this.config.solana.rpcUrl,
        this.config.solana.commitment
      );

      logger.info(`Connected to Solana: ${this.config.solana.rpcUrl}`);

      // Test connection
      const version = await this.connection.getVersion();
      logger.info(`Solana version: ${JSON.stringify(version)}`);

      // Initialize modules
      await this.initializeModules();

      logger.info('✅ Bot initialized successfully');

      return true;

    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      throw error;
    }
  }

  /**
   * Initialize all bot modules
   */
  async initializeModules() {
    logger.info('Initializing modules...');

    // Intelligence modules
    this.modules.tokenDiscovery = new TokenDiscovery(this.connection, this.config);
    this.modules.rugDetection = new RugDetection(this.connection, this.config);
    this.modules.socialMonitor = new SocialMonitor(this.config);
    this.modules.holderAnalysis = new HolderAnalysis(this.connection, this.config);

    // Wallet modules
    this.modules.walletManager = new WalletManager(this.connection, this.config);
    this.modules.transactionBuilder = new TransactionBuilder(this.connection, this.config);
    this.modules.gasOptimizer = new GasOptimizer(this.connection, this.config);

    // Load wallets
    const wallets = this.modules.walletManager.loadWallets(
      this.config.wallets.privateKeys
    );

    if (wallets.length === 0) {
      throw new Error('No wallets loaded');
    }

    // Check wallet balances
    const balances = await this.modules.walletManager.updateBalances();
    logger.info(`Loaded ${wallets.length} wallets with total ${balances.reduce((sum, b) => sum + b.sol, 0).toFixed(4)} SOL`);

    // Risk modules
    this.modules.positionManager = new PositionManager(this.config, this.modules.walletManager);
    this.modules.stopLoss = new StopLoss(this.config, this.modules.positionManager);
    this.modules.riskCalculator = new RiskCalculator(this.config);

    // Execution modules
    this.modules.entryStrategy = new EntryStrategy(this.config);
    this.modules.exitStrategy = new ExitStrategy(this.config);
    this.modules.orderExecutor = new OrderExecutor(
      this.connection,
      this.config,
      this.modules.transactionBuilder,
      this.modules.gasOptimizer
    );

    // Price Feed Manager
    this.modules.priceFeedManager = new PriceFeedManager(this.connection, {
      jupiterEnabled: process.env.JUPITER_ENABLED !== 'false',
      raydiumEnabled: process.env.RAYDIUM_ENABLED === 'true',
      cacheTTL: 5000
    });
    await this.modules.priceFeedManager.initialize();
    logger.info('✅ Price Feed Manager initialized');

    // Determine trading mode
    const tradingMode = process.env.TRADING_MODE || 'paper';
    const isPaperTrading = tradingMode === 'paper' || process.env.DRY_RUN_MODE === 'true' || this.config.paperTrading?.enabled;

    // Safety Monitor
    this.modules.safetyMonitor = new SafetyMonitor({
      maxDrawdownPercent: parseInt(process.env.MAX_DRAWDOWN_PERCENT) || 20,
      maxConsecutiveLosses: parseInt(process.env.MAX_CONSECUTIVE_LOSSES) || 5,
      maxRpcFailures: 10,
      maxPortfolioHeat: parseInt(process.env.MAX_PORTFOLIO_HEAT) || 80,
      minSolBalance: parseFloat(process.env.MIN_SOL_BALANCE) || 0.5,
      emergencyStopFile: process.env.EMERGENCY_STOP_FILE || '.stop',
      paperTradingMode: isPaperTrading  // Skip balance checks in paper trading
    });
    logger.info('✅ Safety Monitor initialized');

    // Real Trading Mode (if enabled)
    if (tradingMode === 'live') {
      // Swap Executor for real trading
      const wallet = this.modules.walletManager.wallets[0]; // Primary wallet
      this.modules.swapExecutor = new SwapExecutor(this.connection, wallet, {
        jupiterEnabled: process.env.JUPITER_ENABLED !== 'false',
        raydiumEnabled: process.env.RAYDIUM_ENABLED === 'true',
        preferredDex: process.env.PREFER_DEX || 'jupiter',
        slippageBps: parseInt(process.env.SLIPPAGE_BPS) || 100,
        maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
        priorityFeeMicroLamports: parseInt(process.env.PRIORITY_FEE_MICRO_LAMPORTS) || 50000
      });
      logger.info('✅ Swap Executor initialized (LIVE TRADING)');

      // Jito Manager for MEV protection
      if (process.env.JITO_ENABLED !== 'false') {
        this.modules.jitoManager = new JitoManager(this.connection, {
          enabled: true,
          blockEngineUrl: process.env.JITO_BLOCK_ENGINE_URL,
          baseTipLamports: parseInt(process.env.JITO_TIP_LAMPORTS) || 100000,
          highPriorityTipLamports: parseInt(process.env.JITO_HIGH_PRIORITY_TIP_LAMPORTS) || 500000,
          criticalTipLamports: parseInt(process.env.JITO_CRITICAL_TIP_LAMPORTS) || 1000000
        });
        logger.info('✅ Jito Manager initialized (MEV Protection enabled)');
      }
    }

    // Paper Trading (if enabled)
    if (this.config.paperTrading?.enabled || tradingMode === 'paper') {
      this.modules.paperTrading = new PaperTradingManager(
        this.config.paperTrading?.startingBalance || 10,
        this.config.paperTrading?.reportInterval || 120000
      );
      logger.info(`📝 Paper Trading enabled - Starting balance: ${this.config.paperTrading?.startingBalance || 10} SOL`);
      
      // Initialize exit monitor for paper trading
      const useRealPrices = process.env.USE_REAL_PRICES === 'true';
      this.modules.exitMonitor = new ExitMonitor(
        this.modules.paperTrading,
        {
          stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT) / 100 || 0.25,
          takeProfitPercent: parseFloat(process.env.PROFIT_TARGET_PERCENT) / 100 || 0.60,

          // PHASE 3: Tiered exit configuration
          exitMode: process.env.EXIT_STRATEGY_MODE || 'single',
          tier1Target: parseFloat(process.env.PROFIT_TARGET_PERCENT) / 100 || 0.50,
          tier2Target: parseFloat(process.env.PROFIT_TARGET_TIER_2) / 100 || 0.80,
          tier1Percent: parseFloat(process.env.EXIT_TIER_1_PERCENT) || 50,
          tier2Percent: parseFloat(process.env.EXIT_TIER_2_PERCENT) || 50,

          trailingStopPercent: parseFloat(process.env.TRAILING_STOP_DISTANCE) / 100 || 0.25,
          trailingActivationProfit: parseFloat(process.env.TRAILING_ACTIVATION_PROFIT) / 100 || 0.20,
          maxHoldTimeMs: (parseFloat(process.env.TIME_BASED_EXIT_MINUTES) || 60) * 60 * 1000,
          monitorIntervalMs: 5000,
          priceVolatility: 0.05,
          useRealPrices: useRealPrices
        },
        useRealPrices ? this.modules.priceFeedManager : null
      );
      logger.info(`✅ Exit Monitor initialized (${useRealPrices ? 'Real Prices' : 'Simulated Prices'})`);
    }

    logger.info('✅ All modules initialized');
  }

  /**
   * Start the bot
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    logger.info('🟢 Starting Memecoin Trading Bot...');

    this.isRunning = true;

    try {
      // Start token discovery
      if (this.config.monitoring?.tokenDiscoveryEnabled) {
        await this.startTokenDiscovery();
      }

      // Start position monitoring
      if (this.config.monitoring?.stopLossMonitoringEnabled) {
        this.startPositionMonitoring();
      }

      // Start exit monitor (paper trading)
      if (this.modules.exitMonitor) {
        this.modules.exitMonitor.start();
      }

      // Start safety monitor
      if (this.modules.safetyMonitor) {
        this.modules.safetyMonitor.start();
      }

      // Start periodic tasks
      this.startPeriodicTasks();

      logger.info('✅ Bot is running');

    } catch (error) {
      logger.error('Error starting bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Start token discovery
   */
  async startTokenDiscovery() {
    logger.info('Starting token discovery...');

    // Override emit method to handle discovered tokens
    this.modules.tokenDiscovery.emit = async (event, data) => {
      if (event === 'tokenDiscovered') {
        await this.handleTokenDiscovered(data);
      }
    };

    await this.modules.tokenDiscovery.start();
  }

  /**
   * Handle newly discovered token
   */
  async handleTokenDiscovered(tokenInfo) {
    try {
      logger.info(`🆕 Analyzing new token: ${tokenInfo.tokenMint}`);

      // Run safety analysis
      const rugAnalysis = await this.modules.rugDetection.analyzeToken(tokenInfo.tokenMint);

      // PAPER TRADING MODE: Lower threshold to 40 to see more activity (was 60)
      // Still filters out the worst tokens (0-39), accepts moderate-risk for practice
      if (rugAnalysis.safetyScore < 40) {
        logger.warn(`Token ${tokenInfo.tokenMint} rejected: low safety score (${rugAnalysis.safetyScore})`);
        return;
      }

      // Run holder analysis
      const holderAnalysis = await this.modules.holderAnalysis.analyzeHolders(tokenInfo.tokenMint);

      // Evaluate entry
      logger.info(`🎯 Evaluating entry for ${tokenInfo.tokenMint} (Safety: ${rugAnalysis.safetyScore}, Holders: ${holderAnalysis.healthScore || 'N/A'})`);
      const evaluation = await this.modules.entryStrategy.evaluateEntry(tokenInfo, {
        rugAnalysis,
        holderAnalysis,
        liquidityAnalysis: { liquiditySol: tokenInfo.liquidity }
      });

      if (!evaluation.shouldEnter) {
        logger.warn(`❌ Token ${tokenInfo.tokenMint} rejected by entry strategy: ${evaluation.recommendation}`);
        return;
      }

      logger.info(`✅ Entry approved for ${tokenInfo.tokenMint}! Preparing to trade...`);

      // Calculate position size
      const positionSize = this.modules.positionManager.calculatePositionSize(
        tokenInfo.tokenMint,
        tokenInfo.liquidity / 100, // Estimate price
        rugAnalysis
      );

      // Create entry plan
      const entryPlan = this.modules.entryStrategy.createEntryPlan({
        tokenMint: tokenInfo.tokenMint,
        tokenSymbol: tokenInfo.tokenMint.slice(0, 8),
        evaluation,
        positionSize
      });

      logger.info(`📋 Entry plan created for ${tokenInfo.tokenMint}: ${positionSize} SOL`);

      // Execute entry (paper trading mode executes automatically)
      if (this.config.paperTrading?.enabled) {
        logger.info(`💰 Executing paper trade for ${tokenInfo.tokenMint}...`);
        await this.executeEntry(entryPlan);
      } else {
        logger.info(`⏸️ Paper trading disabled - entry plan created but not executed (enable with PAPER_TRADING_ENABLED=true)`);
      }

    } catch (error) {
      logger.error('Error handling discovered token:', error);
    }
  }

  /**
   * Execute entry plan
   */
  async executeEntry(entryPlan) {
    try {
      // Safety check BEFORE any trade
      if (this.modules.safetyMonitor && !this.modules.safetyMonitor.isSafeToTrade()) {
        logger.error('🚨 SAFETY CHECK FAILED - Trade aborted');
        logger.error(`Reason: ${this.modules.safetyMonitor.state.triggerReason || 'Unknown'}`);
        return;
      }

      const tradingMode = process.env.TRADING_MODE || 'paper';

      // PAPER TRADING MODE
      if (tradingMode === 'paper' && this.modules.paperTrading) {
        logger.info(`📝 Paper Trading: Executing BUY for ${entryPlan.tokenMint}`);
        
        const paperResult = await this.modules.paperTrading.simulateBuy(
          entryPlan.tokenMint,
          entryPlan.tokenSymbol || entryPlan.tokenMint.slice(0, 8),
          1.0, // Mock price (1 SOL = 1 token for simplicity)
          entryPlan.positionSize
        );
        
        logger.info(`✅ Paper trade executed! Balance: ${this.modules.paperTrading.balance.toFixed(4)} SOL`);
        return;
      }

      // LIVE TRADING MODE
      logger.info(`🔴 LIVE TRADING: Executing REAL BUY for ${entryPlan.tokenMint}`);
      logger.warn(`⚠️  REAL MONEY: ${entryPlan.positionSize} SOL will be spent`);

      // Ensure swap executor is initialized
      if (!this.modules.swapExecutor) {
        throw new Error('SwapExecutor not initialized for live trading');
      }

      // Get position size (respect MAX_POSITION_SIZE_SOL)
      const maxPositionSize = parseFloat(process.env.MAX_POSITION_SIZE_SOL) || 0.1;
      const actualPositionSize = Math.min(entryPlan.positionSize, maxPositionSize);
      
      if (actualPositionSize < entryPlan.positionSize) {
        logger.warn(`Position size reduced from ${entryPlan.positionSize} to ${actualPositionSize} SOL (MAX_POSITION_SIZE_SOL limit)`);
      }

      // Convert SOL amount to lamports
      const amountLamports = Math.floor(actualPositionSize * 1e9);
      const SOL_MINT = 'So11111111111111111111111111111111111111112';

      // Execute swap via Jupiter/Raydium
      let swapResult;
      
      if (this.modules.jitoManager) {
        // Use Jito bundles for MEV protection
        logger.info('🛡️  Using Jito bundle for MEV protection...');
        
        // Get quote first
        const quote = await this.modules.swapExecutor.getJupiterQuote(
          SOL_MINT,
          entryPlan.tokenMint,
          amountLamports
        );
        
        if (!quote) {
          throw new Error('Failed to get quote for swap');
        }
        
        // Execute swap (Jito integration happens inside SwapExecutor)
        swapResult = await this.modules.swapExecutor.executeJupiterSwap(
          SOL_MINT,
          entryPlan.tokenMint,
          amountLamports,
          quote
        );
      } else {
        // Execute swap without Jito
        swapResult = await this.modules.swapExecutor.executeBestSwap(
          SOL_MINT,
          entryPlan.tokenMint,
          amountLamports,
          'buy'
        );
      }

      // Update safety monitor with trade result
      if (this.modules.safetyMonitor) {
        this.modules.safetyMonitor.recordTradeResult(true); // Assume success if no error thrown
      }

      logger.info(`✅ LIVE TRADE EXECUTED!`);
      logger.info(`   Signature: ${swapResult.signature}`);
      logger.info(`   Amount In: ${swapResult.amountIn / 1e9} SOL`);
      logger.info(`   Amount Out: ${swapResult.amountOut} tokens`);
      logger.info(`   DEX: ${swapResult.dex.toUpperCase()}`);
      
      return swapResult;

      // Open position
      const position = this.modules.positionManager.openPosition({
        tokenMint: entryPlan.tokenMint,
        tokenSymbol: entryPlan.tokenSymbol,
        entryPrice: result.price,
        entryAmount: entryPlan.positionSize,
        tokenAmount: result.tokenAmount,
        walletPublicKey: wallet.publicKey,
        signature: result.signature
      });

      // Set stop-loss
      const stopLossPrice = this.modules.stopLoss.calculateStopLoss(position);
      this.modules.positionManager.setStopLoss(position.id, stopLossPrice);

      // Set take-profit
      const takeProfitPrice = position.entryPrice * (1 + this.config.exit.profitTarget);
      this.modules.positionManager.setTakeProfit(position.id, takeProfitPrice);

      logger.info(`✅ Position opened: ${position.tokenSymbol} | ${position.entryAmount} SOL`);

      // Save to database
      database.insert('trades', position);

    } catch (error) {
      logger.error('Error executing entry:', error);
      throw error;
    }
  }

  /**
   * Start position monitoring
   */
  startPositionMonitoring() {
    const interval = this.config.monitoring?.positionCheckIntervalMs || 10000;

    setInterval(async () => {
      await this.checkPositions();
    }, interval);

    logger.info(`Position monitoring started (interval: ${interval}ms)`);
  }

  /**
   * Check all positions for exit conditions
   */
  async checkPositions() {
    const positions = this.modules.positionManager.getActivePositions();

    if (positions.length === 0) return;

    for (const position of positions) {
      try {
        // Get current price (simplified - in production use price feeds)
        const currentPrice = position.entryPrice * (1 + (Math.random() - 0.3)); // Placeholder

        // Update position
        this.modules.positionManager.updatePosition(position.id, currentPrice);

        // Check exit conditions
        const exitEval = this.modules.exitStrategy.evaluateExit(position, currentPrice);

        if (exitEval.shouldExit) {
          await this.executeExit(position, exitEval);
        }

      } catch (error) {
        logger.error(`Error checking position ${position.id}:`, error);
      }
    }
  }

  /**
   * Execute exit for a position
   */
  async executeExit(position, exitEvaluation) {
    try {
      const wallet = this.modules.walletManager.getWalletByPublicKey(position.walletPublicKey);

      if (!wallet) {
        throw new Error(`Wallet not found: ${position.walletPublicKey}`);
      }

      // Execute sell
      const result = await this.modules.orderExecutor.executeSell({
        wallet,
        tokenMint: position.tokenMint,
        tokenAmount: position.tokenAmount,
        slippageBps: this.config.exit.slippageBps,
        urgency: exitEvaluation.urgency
      });

      // Close position
      const closedPosition = this.modules.positionManager.closePosition(position.id, {
        exitPrice: result.price,
        exitAmount: result.amountReceived,
        signature: result.signature,
        reason: exitEvaluation.signals[0]?.type
      });

      logger.info(`✅ Position closed: ${closedPosition.tokenSymbol} | P&L: ${closedPosition.realizedPnl} SOL`);

      // Update database
      database.insert('trades', closedPosition);

    } catch (error) {
      logger.error('Error executing exit:', error);
      throw error;
    }
  }

  /**
   * Start periodic tasks
   */
  startPeriodicTasks() {
    // Clean up expired plans every 5 minutes
    setInterval(() => {
      this.modules.entryStrategy.cleanupExpiredPlans();
    }, 300000);

    // Update wallet balances every minute
    setInterval(async () => {
      await this.modules.walletManager.updateBalances();
    }, 60000);

    // Log portfolio stats every 10 minutes
    setInterval(() => {
      this.logPortfolioStats();
    }, 600000);

    logger.info('Periodic tasks started');
  }

  /**
   * Log portfolio statistics
   */
  logPortfolioStats() {
    const stats = this.modules.positionManager.getPortfolioStats();
    const executionStats = this.modules.orderExecutor.getExecutionStats();

    logger.info('📊 Portfolio Stats:', {
      activePositions: stats.activePositions,
      totalExposure: `${stats.totalExposure} SOL`,
      unrealizedPnL: `${stats.totalUnrealizedPnl.toFixed(4)} SOL`,
      realizedPnL: `${stats.totalRealizedPnl.toFixed(4)} SOL`,
      totalPnL: `${stats.totalPnl.toFixed(4)} SOL`,
      winRate: `${stats.winRate.toFixed(2)}%`,
      executionSuccessRate: `${executionStats.successRate.toFixed(2)}%`
    });
  }

  /**
   * Stop the bot
   */
  async stop() {
    logger.info('🛑 Stopping bot...');

    this.isRunning = false;

    // Stop monitoring
    this.modules.stopLoss.stopAllMonitoring();
    
    // Stop exit monitor (paper trading)
    if (this.modules.exitMonitor) {
      this.modules.exitMonitor.stop();
    }

    // Stop safety monitor
    if (this.modules.safetyMonitor) {
      this.modules.safetyMonitor.stop();
    }

    logger.info('✅ Bot stopped');
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      portfolioStats: this.modules.positionManager?.getPortfolioStats(),
      walletStats: this.modules.walletManager?.getWalletStats(),
      executionStats: this.modules.orderExecutor?.getExecutionStats()
    };
  }
}

// Main entry point
async function main() {
  const bot = new MememcoinTradingBot();

  try {
    await bot.initialize();
    await bot.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal');
      await bot.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default MememcoinTradingBot;
