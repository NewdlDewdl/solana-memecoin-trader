import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Token Discovery Module
 * Monitors Raydium and Jupiter for new token launches
 */

export class TokenDiscovery {
  constructor(connection, config) {
    this.connection = connection;
    this.config = config;
    this.raydiumProgramId = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
    this.discoveredTokens = new Map();

    // Read sampling rate from environment (1 = process all events, 10 = process 1 in 10)
    this.samplingRate = parseInt(process.env.DISCOVERY_SAMPLING) || 1;
    this.eventCounter = 0;
    
    // Verbose log file for token evaluation details
    this.verboseLogPath = '/tmp/token-discovery-verbose.log';
    this.logToVerboseFile(`\n${'='.repeat(80)}\n🔍 TOKEN DISCOVERY VERBOSE LOG - ${new Date().toISOString()}\n${'='.repeat(80)}\n`);
    
    // Stats tracking
    this.stats = {
      logsReceived: 0,
      logsProcessed: 0,
      logsSkipped: 0,
      tokensDiscovered: 0,
      tokensRejected: 0,
      duplicatesSkipped: 0,
      lastLogTime: Date.now()
    };
  }
  
  /**
   * Log to verbose file
   */
  logToVerboseFile(message) {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(this.verboseLogPath, `${timestamp} ${message}\n`);
    } catch (error) {
      logger.error('Error writing to verbose log:', error);
    }
  }

  /**
   * Start monitoring for new token launches
   */
  async start() {
    logger.info('Starting token discovery...');

    // Subscribe to Raydium pool creation events
    this.connection.onLogs(
      this.raydiumProgramId,
      async (logs, ctx) => {
        this.stats.logsReceived++;
        this.stats.lastLogTime = Date.now();
        this.eventCounter++;
        
        // PRACTICE MODE: Sample events (process 1 in 10, 5 SOL filter)
        if (this.eventCounter % this.samplingRate !== 0) {
          this.stats.logsSkipped++;
          return; // Skip this event
        }
        
        this.stats.logsProcessed++;
        await this.handlePoolCreation(logs, ctx);
      },
      'confirmed'
    );

    // Log stats every 60 seconds
    setInterval(() => {
      logger.info(`📊 Discovery Stats: ${this.stats.logsReceived} received | ${this.stats.logsProcessed} processed (1/${this.samplingRate} sampling) | ✅ ${this.stats.tokensDiscovered} NEW | ❌ ${this.stats.tokensRejected} rejected | 🔄 ${this.stats.duplicatesSkipped} duplicates`);
    }, 60000);

    logger.info('Token discovery active - monitoring Raydium pools');
    const samplingPercent = ((1 / this.samplingRate) * 100).toFixed(0);
    logger.info(`⚡ Sampling: Processing 1 in ${this.samplingRate} events (${samplingPercent}%) - Min liquidity: ${this.config.entry?.minLiquidity || 5} SOL`);
    logger.info(`📝 Verbose token evaluation log: ${this.verboseLogPath}`);
  }

  /**
   * Handle new pool creation event
   */
  async handlePoolCreation(logs, ctx) {
    try {
      const signature = logs.signature;

      // Parse transaction to extract pool info
      const poolInfo = await this.parsePoolTransaction(signature);

      if (!poolInfo) {
        this.logToVerboseFile('⚠️  Failed to parse pool transaction - skipping');
        return;
      }

      // Log every pool found
      this.logToVerboseFile(`\n${'─'.repeat(80)}`);
      this.logToVerboseFile(`🔎 EVALUATING TOKEN`);
      this.logToVerboseFile(`   Token Mint: ${poolInfo.tokenMint}`);
      this.logToVerboseFile(`   Pool ID: ${poolInfo.poolId}`);
      this.logToVerboseFile(`   Liquidity: ${poolInfo.liquidity.toFixed(4)} SOL`);
      this.logToVerboseFile(`   Signature: ${signature}`);

      // Check for duplicates (already discovered this token)
      if (this.discoveredTokens.has(poolInfo.tokenMint)) {
        this.stats.duplicatesSkipped++;
        this.logToVerboseFile(`   🔄 DUPLICATE: Token already discovered - skipping`);
        return;
      }

      // Check if meets minimum criteria
      const meetsMinimumCriteriaResult = this.meetsMinimumCriteria(poolInfo);
      
      if (!meetsMinimumCriteriaResult.passed) {
        this.stats.tokensRejected++;
        this.logToVerboseFile(`   ❌ REJECTED: ${meetsMinimumCriteriaResult.reason}`);
        logger.debug(`Pool ${poolInfo.poolId} doesn't meet criteria: ${meetsMinimumCriteriaResult.reason}`);
        return;
      }

      // Emit new token event (ONLY ONCE per token)
      this.stats.tokensDiscovered++;
      this.logToVerboseFile(`   ✅ ACCEPTED: ${meetsMinimumCriteriaResult.reason}`);
      this.logToVerboseFile(`   🎯 Token added to discovery queue for analysis!`);
      
      logger.info(`🆕 New token discovered: ${poolInfo.tokenMint}`, {
        poolId: poolInfo.poolId,
        liquidity: poolInfo.liquidity,
        tokenMint: poolInfo.tokenMint
      });

      // Mark as discovered to prevent duplicates
      this.discoveredTokens.set(poolInfo.tokenMint, {
        ...poolInfo,
        discoveredAt: Date.now()
      });

      // Trigger analysis pipeline
      this.emit('tokenDiscovered', poolInfo);

    } catch (error) {
      logger.error('Error handling pool creation:', error);
      this.logToVerboseFile(`   ❌ ERROR: ${error.message}`);
    }
  }

  /**
   * Parse pool creation transaction
   */
  async parsePoolTransaction(signature) {
    try {
      // Connection is already throttled
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.meta) {
        this.logToVerboseFile(`   🔍 DEBUG: Transaction not found or no meta for ${signature}`);
        return null;
      }

      // DIAGNOSTIC: Log what we're seeing
      const innerInstructions = tx.meta.innerInstructions || [];
      const postBalances = tx.meta.postTokenBalances || [];
      const preBalances = tx.meta.preTokenBalances || [];
      
      this.logToVerboseFile(`\n${'─'.repeat(80)}`);
      this.logToVerboseFile(`🔍 DEBUG: Parsing transaction ${signature.slice(0, 16)}...`);
      this.logToVerboseFile(`   Inner instructions: ${innerInstructions.length}`);
      this.logToVerboseFile(`   Post token balances: ${postBalances.length}`);
      this.logToVerboseFile(`   Pre token balances: ${preBalances.length}`);

      // Extract pool information from transaction
      const accounts = tx.transaction.message.accountKeys;
      
      let tokenMint = null;
      let poolId = null;
      let liquidity = 0;

      // Try to find any token mints in post balances (more relaxed)
      for (const balance of postBalances) {
        if (balance.mint && balance.mint !== 'So11111111111111111111111111111111111111112') {
          if (!tokenMint) {
            tokenMint = balance.mint;
            this.logToVerboseFile(`   Found token mint: ${tokenMint}`);
          }
        }
        // Get SOL liquidity
        if (balance.mint === 'So11111111111111111111111111111111111111112') {
          liquidity = balance.uiTokenAmount.uiAmount || 0;
          this.logToVerboseFile(`   Found SOL liquidity: ${liquidity}`);
        }
      }

      // Also check pre-balances for liquidity changes
      for (const balance of preBalances) {
        if (balance.mint === 'So11111111111111111111111111111111111111112') {
          const preAmount = balance.uiTokenAmount.uiAmount || 0;
          const postBalance = postBalances.find(b => b.accountIndex === balance.accountIndex);
          const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
          const liquidityChange = postAmount - preAmount;
          if (liquidityChange > 0 && liquidityChange > liquidity) {
            liquidity = liquidityChange;
            this.logToVerboseFile(`   Updated liquidity from change: ${liquidity}`);
          }
        }
      }

      // Parse instructions to find pool details
      for (const inner of innerInstructions) {
        for (const ix of inner.instructions) {
          if (ix.program === 'spl-token' && ix.parsed?.type === 'initializeAccount') {
            // Found token account initialization
            const mint = ix.parsed.info.mint;
            if (mint && mint !== 'So11111111111111111111111111111111111111112') {
              tokenMint = mint;
              this.logToVerboseFile(`   Found token mint in instruction: ${tokenMint}`);
            }
          }
        }
      }

      if (!tokenMint) {
        this.logToVerboseFile(`   ❌ No token mint found - skipping`);
        return null;
      }

      this.logToVerboseFile(`   ✅ Parsed successfully: ${tokenMint.slice(0, 16)}... with ${liquidity} SOL`);

      return {
        tokenMint,
        poolId: poolId || signature.slice(0, 32),
        liquidity,
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime
      };

    } catch (error) {
      this.logToVerboseFile(`   ❌ ERROR parsing: ${error.message}`);
      logger.error('Error parsing pool transaction:', error);
      return null;
    }
  }

  /**
   * Check if pool meets minimum criteria for trading
   */
  meetsMinimumCriteria(poolInfo) {
    const minLiquidity = this.config.entry?.minLiquidity || 5;

    if (poolInfo.liquidity < minLiquidity) {
      return {
        passed: false,
        reason: `Liquidity ${poolInfo.liquidity.toFixed(4)} SOL < minimum ${minLiquidity} SOL`
      };
    }

    return {
      passed: true,
      reason: `Liquidity ${poolInfo.liquidity.toFixed(4)} SOL >= minimum ${minLiquidity} SOL - Ready for analysis`
    };
  }

  /**
   * Get token metadata from on-chain data
   */
  async getTokenMetadata(tokenMint) {
    try {
      const mintPubkey = new PublicKey(tokenMint);

      // Get token supply and decimals (connection is already throttled)
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);

      if (!mintInfo.value) return null;

      const data = mintInfo.value.data.parsed.info;

      return {
        decimals: data.decimals,
        supply: data.supply,
        mintAuthority: data.mintAuthority,
        freezeAuthority: data.freezeAuthority
      };

    } catch (error) {
      logger.error('Error fetching token metadata:', error);
      return null;
    }
  }

  /**
   * Monitor specific token for updates
   */
  async monitorToken(tokenMint) {
    const interval = setInterval(async () => {
      try {
        const metadata = await this.getTokenMetadata(tokenMint);
        const poolInfo = this.discoveredTokens.get(tokenMint);

        if (poolInfo) {
          poolInfo.metadata = metadata;
          poolInfo.lastUpdate = Date.now();
        }

      } catch (error) {
        logger.error(`Error monitoring token ${tokenMint}:`, error);
      }
    }, 30000); // Update every 30 seconds

    return interval;
  }

  /**
   * Event emitter for discovered tokens
   */
  emit(event, data) {
    // Override this method to handle events
    // E.g., pass to rug detection, social monitoring, etc.
  }

  /**
   * Get all discovered tokens
   */
  getDiscoveredTokens() {
    return Array.from(this.discoveredTokens.values());
  }

  /**
   * Clear old discovered tokens
   */
  clearOldTokens(maxAgeMs = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [mint, info] of this.discoveredTokens.entries()) {
      if (now - info.discoveredAt > maxAgeMs) {
        this.discoveredTokens.delete(mint);
      }
    }
  }
}
