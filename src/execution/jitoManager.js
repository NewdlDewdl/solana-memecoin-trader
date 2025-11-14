import { 
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction
} from '@solana/web3.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

const JITO_BLOCK_ENGINE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1';
const JITO_TIP_ACCOUNTS = [
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh'
];

/**
 * Jito Manager
 * Handles MEV protection via Jito bundles
 */
export class JitoManager {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      enabled: config.enabled !== false,
      blockEngineUrl: config.blockEngineUrl || JITO_BLOCK_ENGINE_URL,
      baseTipLamports: config.baseTipLamports || 100000, // 0.0001 SOL
      highPriorityTipLamports: config.highPriorityTipLamports || 500000, // 0.0005 SOL
      criticalTipLamports: config.criticalTipLamports || 1000000, // 0.001 SOL
      maxBundleSize: config.maxBundleSize || 5,
      bundleRetries: config.bundleRetries || 3
    };
    
    // Stats tracking
    this.stats = {
      bundlesSubmitted: 0,
      bundlesLanded: 0,
      bundlesFailed: 0,
      totalTipsPaid: 0,
      avgLandTime: 0
    };
    
    // Randomly select a tip account for this session
    this.tipAccount = new PublicKey(
      JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
    );
    
    logger.info('🛡️  Jito Manager initialized');
    logger.info(`   Enabled: ${this.config.enabled}`);
    logger.info(`   Base tip: ${this.config.baseTipLamports / 1e9} SOL`);
    logger.info(`   Tip account: ${this.tipAccount.toString().slice(0, 8)}...`);
  }

  /**
   * Create a Jito bundle with tip
   * @param {Array<VersionedTransaction>} transactions - Array of transactions to bundle
   * @param {Object} wallet - Wallet keypair
   * @param {string} priority - 'base', 'high', or 'critical'
   * @returns {Promise<Array>} Bundle of signed transactions
   */
  async createBundle(transactions, wallet, priority = 'base') {
    try {
      if (!this.config.enabled) {
        logger.warn('Jito is disabled - transactions will be sent normally');
        return null;
      }
      
      // Determine tip amount based on priority
      let tipAmount;
      switch (priority) {
        case 'critical':
          tipAmount = this.config.criticalTipLamports;
          break;
        case 'high':
          tipAmount = this.config.highPriorityTipLamports;
          break;
        default:
          tipAmount = this.config.baseTipLamports;
      }
      
      logger.debug(`Creating Jito bundle with ${priority} priority (${tipAmount / 1e9} SOL tip)`);
      
      // Validate bundle size
      if (transactions.length > this.config.maxBundleSize) {
        throw new Error(`Bundle size ${transactions.length} exceeds maximum ${this.config.maxBundleSize}`);
      }
      
      // Create tip transaction
      const tipTransaction = await this.createTipTransaction(wallet, tipAmount);
      
      // Bundle: [swap transactions..., tip transaction]
      const bundle = [...transactions, tipTransaction];
      
      logger.debug(`Bundle created with ${bundle.length} transactions (${transactions.length} swaps + 1 tip)`);
      
      return bundle;
      
    } catch (error) {
      logger.error('Error creating Jito bundle:', error);
      throw error;
    }
  }

  /**
   * Create tip transaction
   * @param {Object} wallet - Wallet keypair
   * @param {number} tipLamports - Tip amount in lamports
   * @returns {Promise<VersionedTransaction>} Tip transaction
   */
  async createTipTransaction(wallet, tipLamports) {
    try {
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('finalized');
      
      // Create transfer instruction
      const tipInstruction = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: this.tipAccount,
        lamports: tipLamports
      });
      
      // Build transaction
      const transaction = new Transaction().add(tipInstruction);
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;
      
      // Sign transaction
      transaction.sign(wallet);
      
      // Convert to VersionedTransaction for consistency
      const message = transaction.compileMessage();
      const versionedTx = new VersionedTransaction(message);
      
      return versionedTx;
      
    } catch (error) {
      logger.error('Error creating tip transaction:', error);
      throw error;
    }
  }

  /**
   * Submit bundle to Jito block engine
   * @param {Array} bundle - Array of signed transactions
   * @returns {Promise<Object>} Bundle submission result
   */
  async submitBundle(bundle) {
    let retries = 0;
    let lastError;
    const startTime = Date.now();
    
    while (retries <= this.config.bundleRetries) {
      try {
        if (retries > 0) {
          logger.info(`   Retry ${retries}/${this.config.bundleRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
        
        // Serialize transactions to base58
        const serializedTransactions = bundle.map(tx => {
          if (tx instanceof VersionedTransaction) {
            return Buffer.from(tx.serialize()).toString('base64');
          } else {
            return tx.serialize({ requireAllSignatures: false }).toString('base64');
          }
        });
        
        logger.debug(`   Submitting bundle with ${serializedTransactions.length} transactions...`);
        
        // Submit to Jito
        const response = await axios.post(
          `${this.config.blockEngineUrl}/bundles`,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'sendBundle',
            params: [serializedTransactions]
          },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        if (response.data.error) {
          throw new Error(`Jito API error: ${JSON.stringify(response.data.error)}`);
        }
        
        const bundleId = response.data.result;
        
        logger.info(`✅ Bundle submitted successfully!`);
        logger.info(`   Bundle ID: ${bundleId}`);
        
        // Track stats
        this.stats.bundlesSubmitted++;
        const landTime = Date.now() - startTime;
        
        // Wait for bundle to land (with timeout)
        const landed = await this.waitForBundle(bundleId, 30000);
        
        if (landed) {
          this.stats.bundlesLanded++;
          this.stats.avgLandTime = (this.stats.avgLandTime * (this.stats.bundlesLanded - 1) + landTime) / this.stats.bundlesLanded;
          logger.info(`   Bundle landed in ${landTime}ms`);
        } else {
          this.stats.bundlesFailed++;
          logger.warn(`   Bundle did not land within timeout`);
        }
        
        // Calculate tip paid
        const tipAmount = bundle[bundle.length - 1]?.instructions?.[0]?.lamports || this.config.baseTipLamports;
        this.stats.totalTipsPaid += tipAmount;
        
        return {
          success: true,
          bundleId,
          landed,
          landTime,
          tipPaid: tipAmount / 1e9
        };
        
      } catch (error) {
        lastError = error;
        logger.warn(`   Bundle submission failed: ${error.message}`);
        retries++;
      }
    }
    
    // All retries exhausted
    this.stats.bundlesFailed++;
    throw new Error(`Bundle submission failed after ${this.config.bundleRetries} retries: ${lastError.message}`);
  }

  /**
   * Wait for bundle to land
   * @param {string} bundleId - Bundle ID
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<boolean>} Whether bundle landed
   */
  async waitForBundle(bundleId, timeoutMs = 30000) {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await axios.post(
          `${this.config.blockEngineUrl}/bundles`,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'getBundleStatuses',
            params: [[bundleId]]
          },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );
        
        if (response.data.result?.value?.[0]) {
          const status = response.data.result.value[0];
          
          if (status.confirmation_status === 'confirmed') {
            return true;
          }
          
          if (status.err) {
            logger.warn(`   Bundle error: ${JSON.stringify(status.err)}`);
            return false;
          }
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        logger.debug(`Error checking bundle status: ${error.message}`);
      }
    }
    
    return false; // Timeout
  }

  /**
   * Adjust tip based on acceptance rate
   * @returns {number} Recommended tip in lamports
   */
  getAdaptiveTip() {
    if (this.stats.bundlesSubmitted < 5) {
      return this.config.baseTipLamports; // Not enough data yet
    }
    
    const acceptanceRate = this.stats.bundlesLanded / this.stats.bundlesSubmitted;
    
    if (acceptanceRate < 0.5) {
      // Low acceptance rate - increase tip
      return this.config.highPriorityTipLamports;
    } else if (acceptanceRate < 0.8) {
      // Medium acceptance rate - use base tip
      return this.config.baseTipLamports;
    } else {
      // High acceptance rate - can try lower tip
      return Math.floor(this.config.baseTipLamports * 0.8);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const acceptanceRate = this.stats.bundlesSubmitted > 0
      ? (this.stats.bundlesLanded / this.stats.bundlesSubmitted * 100).toFixed(1)
      : '0.0';
    
    return {
      ...this.stats,
      acceptanceRate: acceptanceRate + '%',
      totalTipsPaidSOL: (this.stats.totalTipsPaid / 1e9).toFixed(4),
      avgLandTimeMs: Math.floor(this.stats.avgLandTime)
    };
  }

  /**
   * Log statistics
   */
  logStats() {
    const stats = this.getStats();
    logger.info('🛡️  Jito Bundle Stats:', {
      bundlesSubmitted: stats.bundlesSubmitted,
      bundlesLanded: stats.bundlesLanded,
      bundlesFailed: stats.bundlesFailed,
      acceptanceRate: stats.acceptanceRate,
      totalTipsPaid: stats.totalTipsPaidSOL + ' SOL',
      avgLandTime: stats.avgLandTimeMs + 'ms'
    });
  }
}

export default JitoManager;

