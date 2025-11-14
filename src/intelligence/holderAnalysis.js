import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from '../utils/logger.js';

/**
 * Holder Analysis Module
 * Analyzes token holder distribution and whale activity
 */

export class HolderAnalysis {
  constructor(connection, config) {
    this.connection = connection;
    this.config = config;
    this.holderCache = new Map();
  }

  /**
   * Comprehensive holder analysis
   */
  async analyzeHolders(tokenMint) {
    logger.info(`Analyzing holders for ${tokenMint}...`);

    try {
      // Get all token holders
      logger.debug(`📊 Fetching token holders from RPC...`);
      const holders = await this.getTokenHolders(tokenMint);

      if (!holders || holders.length === 0) {
        logger.warn(`⚠️ No holders found for ${tokenMint}`);
        return {
          tokenMint,
          error: 'No holders found',
          isHealthy: false
        };
      }

      logger.info(`✅ Found ${holders.length} holders`);

      // For tokens with >1000 holders, use sampled analysis (performance optimization)
      const useSampling = holders.length > 1000;
      const analysisHolders = useSampling ? holders.slice(0, 1000) : holders;

      if (useSampling) {
        logger.info(`⚡ Large token detected (${holders.length} holders) - analyzing top 1000 for performance`);
      }

      // Calculate distribution metrics (use full holder list for percentiles, sampled for Gini)
      logger.info(`📈 Calculating distribution metrics...`);
      const distribution = this.calculateDistribution(holders, analysisHolders);

      // Identify whales and their behavior (always use full list for whale detection)
      logger.info(`🐋 Identifying whales...`);
      const whales = this.identifyWhales(holders, distribution.totalSupply);
      logger.info(`🐋 Found ${whales.count} whales (${whales.totalPercentage.toFixed(1)}% of supply)`);

      // Calculate concentration risk (use sampled data for large tokens)
      logger.info(`⚖️ Calculating concentration risk...`);
      const concentration = this.calculateConcentration(analysisHolders, distribution.totalSupply, useSampling);
      logger.info(`⚖️ Concentration calculated`);

      // Analyze holder age
      logger.info(`⏰ Analyzing holder age...`);
      const ageAnalysis = await this.analyzeHolderAge(holders);
      logger.info(`⏰ Age analysis complete`);

      const analysis = {
        tokenMint,
        totalHolders: holders.length,
        distribution,
        whales,
        concentration,
        ageAnalysis,
        healthScore: this.calculateHealthScore({
          distribution,
          concentration,
          whales
        }),
        analyzedAt: Date.now()
      };

      // Cache results
      this.cacheAnalysis(tokenMint, analysis);

      logger.info(`✅ Holder analysis complete: ${holders.length} holders | Health Score: ${analysis.healthScore}/100 | Risk: ${concentration.riskLevel}`);

      return analysis;

    } catch (error) {
      logger.error('Error analyzing holders:', error);
      return {
        tokenMint,
        error: error.message,
        isHealthy: false
      };
    }
  }

  /**
   * Get all token holders with balances
   */
  async getTokenHolders(tokenMint) {
    try {
      const mintPubkey = new PublicKey(tokenMint);

      // Get all token accounts for this mint
      const accounts = await this.connection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            {
              dataSize: 165 // Token account size
            },
            {
              memcmp: {
                offset: 0,
                bytes: mintPubkey.toBase58()
              }
            }
          ]
        }
      );

      const holders = accounts
        .map(acc => {
          const info = acc.account.data.parsed.info;
          return {
            address: info.owner,
            balance: info.tokenAmount.uiAmount,
            decimals: info.tokenAmount.decimals,
            account: acc.pubkey.toBase58()
          };
        })
        .filter(h => h.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      return holders;

    } catch (error) {
      logger.error('Error getting token holders:', error);
      throw error;
    }
  }

  /**
   * Calculate holder distribution metrics
   * @param {Array} holders - Full holder list (for percentiles)
   * @param {Array} analysisHolders - Sampled holders (for expensive calculations like Gini)
   */
  calculateDistribution(holders, analysisHolders = null) {
    const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);

    // Calculate percentiles (use full holder list - these are cheap O(n) operations)
    const top1 = holders.slice(0, 1).reduce((sum, h) => sum + h.balance, 0) / totalSupply;
    const top5 = holders.slice(0, 5).reduce((sum, h) => sum + h.balance, 0) / totalSupply;
    const top10 = holders.slice(0, 10).reduce((sum, h) => sum + h.balance, 0) / totalSupply;
    const top20 = holders.slice(0, 20).reduce((sum, h) => sum + h.balance, 0) / totalSupply;
    const top100 = holders.slice(0, Math.min(100, holders.length)).reduce((sum, h) => sum + h.balance, 0) / totalSupply;

    // Use sampled data for expensive Gini calculation (O(n²) complexity)
    const giniHolders = analysisHolders || holders;

    return {
      totalSupply,
      top1Percentage: top1,
      top5Percentage: top5,
      top10Percentage: top10,
      top20Percentage: top20,
      top100Percentage: top100,
      giniCoefficient: this.calculateGini(giniHolders, totalSupply),
      sampled: giniHolders.length < holders.length
    };
  }

  /**
   * Calculate Gini coefficient (wealth inequality measure)
   * 0 = perfect equality, 1 = perfect inequality
   */
  calculateGini(holders, totalSupply) {
    if (holders.length === 0) return 1;

    const n = holders.length;
    let sumOfDifferences = 0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumOfDifferences += Math.abs(holders[i].balance - holders[j].balance);
      }
    }

    const meanBalance = totalSupply / n;
    const gini = sumOfDifferences / (2 * n * n * meanBalance);

    return gini;
  }

  /**
   * Identify whale holders (>1% of supply)
   */
  identifyWhales(holders, totalSupply) {
    const whaleThreshold = totalSupply * 0.01; // 1% of supply

    const whales = holders
      .filter(h => h.balance >= whaleThreshold)
      .map(h => ({
        address: h.address,
        balance: h.balance,
        percentage: (h.balance / totalSupply) * 100,
        account: h.account
      }));

    return {
      count: whales.length,
      totalHolding: whales.reduce((sum, w) => sum + w.balance, 0),
      totalPercentage: whales.reduce((sum, w) => sum + w.percentage, 0),
      list: whales
    };
  }

  /**
   * Calculate concentration risk metrics
   * @param {Array} holders - Holder list (may be sampled for large tokens)
   * @param {Number} totalSupply - Total token supply
   * @param {Boolean} sampled - Whether using sampled data
   */
  calculateConcentration(holders, totalSupply, sampled = false) {
    const herfindahlIndex = holders.reduce((sum, h) => {
      const marketShare = h.balance / totalSupply;
      return sum + (marketShare * marketShare);
    }, 0);

    // Categorize concentration
    let riskLevel;
    if (herfindahlIndex > 0.25) riskLevel = 'EXTREME';
    else if (herfindahlIndex > 0.15) riskLevel = 'HIGH';
    else if (herfindahlIndex > 0.10) riskLevel = 'MODERATE';
    else riskLevel = 'LOW';

    return {
      herfindahlIndex,
      riskLevel,
      description: this.getConcentrationDescription(riskLevel),
      sampled
    };
  }

  /**
   * Get concentration risk description
   */
  getConcentrationDescription(riskLevel) {
    const descriptions = {
      EXTREME: 'Extremely concentrated - very high rug pull risk',
      HIGH: 'Highly concentrated - significant whale control',
      MODERATE: 'Moderately concentrated - some whale influence',
      LOW: 'Well distributed - healthy holder base'
    };
    return descriptions[riskLevel] || 'Unknown';
  }

  /**
   * Analyze holder account ages
   */
  async analyzeHolderAge(holders) {
    // PAPER TRADING MODE: Skip age analysis (too many RPC calls, not critical for validation)
    logger.info(`⏰ Skipping age analysis for performance (paper trading mode)`);
    
    // Return mock data
    return {
      newAccounts: 0,
      oldAccounts: 0,
      averageAge: 0,
      skipped: true
    };
    
    /* Original code (commented out for paper trading):
    // Sample top 5 holders to check account age (reduced for performance)
    const sampled = holders.slice(0, Math.min(5, holders.length));
    logger.info(`⏰ Checking age of ${sampled.length} accounts...`);

    let newAccounts = 0;
    let oldAccounts = 0;

    for (const holder of sampled) {
      try {
        const age = await this.getAccountAge(holder.address);

        if (age < 86400) { // Less than 1 day old
          newAccounts++;
        } else if (age > 2592000) { // More than 30 days old
          oldAccounts++;
        }

      } catch (error) {
        // Ignore errors for individual accounts
        logger.debug(`Error checking age for ${holder.address}:`, error.message);
      }
    }

    const newAccountRatio = newAccounts / sampled.length;

    return {
      sampled: sampled.length,
      newAccounts,
      oldAccounts,
      newAccountRatio,
      warning: newAccountRatio > 0.5 ? 'Many new accounts detected - possible bot activity' : null
    };
    */
  }

  /**
   * Get account age in seconds
   */
  async getAccountAge(address) {
    try {
      const pubkey = new PublicKey(address);

      // Get earliest transaction
      const signatures = await this.connection.getSignaturesForAddress(
        pubkey,
        { limit: 1 }
      );

      if (signatures.length === 0) return 0;

      const oldestSig = signatures[signatures.length - 1];
      const tx = await this.connection.getTransaction(oldestSig.signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.blockTime) return 0;

      const currentTime = Math.floor(Date.now() / 1000);
      return currentTime - tx.blockTime;

    } catch (error) {
      logger.debug('Error getting account age:', error);
      return 0;
    }
  }

  /**
   * Calculate overall holder health score (0-100)
   */
  calculateHealthScore({ distribution, concentration, whales }) {
    let score = 100;

    // Penalize high concentration
    if (concentration.riskLevel === 'EXTREME') score -= 50;
    else if (concentration.riskLevel === 'HIGH') score -= 30;
    else if (concentration.riskLevel === 'MODERATE') score -= 15;

    // Penalize top holder dominance
    if (distribution.top1Percentage > 0.5) score -= 30;
    else if (distribution.top1Percentage > 0.3) score -= 20;
    else if (distribution.top1Percentage > 0.1) score -= 10;

    // Reward good distribution
    if (distribution.giniCoefficient < 0.5) score += 10;

    // Penalize too many whales
    if (whales.totalPercentage > 80) score -= 20;
    else if (whales.totalPercentage > 60) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Monitor whale activity
   */
  async monitorWhales(tokenMint, whaleAddresses, callback) {
    logger.info(`Monitoring ${whaleAddresses.length} whales for ${tokenMint}`);

    const subscriptions = [];

    for (const address of whaleAddresses) {
      try {
        const pubkey = new PublicKey(address);

        const subscriptionId = this.connection.onAccountChange(
          pubkey,
          (accountInfo, context) => {
            callback && callback({
              address,
              slot: context.slot,
              accountInfo
            });
          },
          'confirmed'
        );

        subscriptions.push(subscriptionId);

      } catch (error) {
        logger.error(`Error monitoring whale ${address}:`, error);
      }
    }

    return subscriptions;
  }

  /**
   * Get cached analysis
   */
  getCachedAnalysis(tokenMint, maxAgeMs = 300000) { // 5 minutes
    const cached = this.holderCache.get(tokenMint);

    if (!cached) return null;

    const age = Date.now() - cached.analyzedAt;
    if (age > maxAgeMs) return null;

    return cached;
  }

  /**
   * Cache analysis results
   */
  cacheAnalysis(tokenMint, analysis) {
    this.holderCache.set(tokenMint, analysis);

    // Auto-cleanup after 10 minutes
    setTimeout(() => {
      this.holderCache.delete(tokenMint);
    }, 600000);
  }
}
