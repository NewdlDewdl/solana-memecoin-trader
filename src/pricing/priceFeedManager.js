import { Connection, PublicKey } from '@solana/web3.js';
import pkg from '@jup-ag/api';
const { Jupiter } = pkg;
import axios from 'axios';
import { logger } from '../utils/logger.js';

/**
 * Price Feed Manager
 * Integrates multiple price sources (Jupiter, Raydium) for accurate, real-time pricing
 */
export class PriceFeedManager {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = config;
    
    // Price cache to avoid redundant RPC calls
    this.priceCache = new Map(); // tokenAddress -> { price, timestamp }
    this.cacheTTL = config.cacheTTL || 5000; // 5 seconds default
    
    // Jupiter client for price quotes
    this.jupiter = null;
    this.jupiterEnabled = config.jupiterEnabled !== false;
    
    // Raydium configuration
    this.raydiumEnabled = config.raydiumEnabled !== false;
    
    // Stats tracking
    this.stats = {
      jupiterCalls: 0,
      raydiumCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0
    };
    
    logger.info('💰 Price Feed Manager initialized');
  }

  /**
   * Initialize Jupiter client
   */
  async initialize() {
    try {
      if (this.jupiterEnabled) {
        // Jupiter v6 initialization
        this.jupiter = await Jupiter.load({
          connection: this.connection,
          cluster: 'mainnet-beta',
          user: null, // We'll use different user wallets per trade
        });
        logger.info('✅ Jupiter price feed initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize Jupiter:', error);
      this.jupiterEnabled = false;
    }
  }

  /**
   * Get current market price for a token
   * @param {string} tokenAddress - Token mint address
   * @returns {Promise<number>} Price in SOL
   */
  async getPrice(tokenAddress) {
    try {
      // Check cache first
      const cached = this.getCachedPrice(tokenAddress);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      
      this.stats.cacheMisses++;
      
      // Try Jupiter first (more reliable)
      if (this.jupiterEnabled) {
        try {
          const jupiterPrice = await this.getJupiterPrice(tokenAddress);
          if (jupiterPrice) {
            this.cachePrice(tokenAddress, jupiterPrice);
            return jupiterPrice;
          }
        } catch (error) {
          logger.debug(`Jupiter price fetch failed for ${tokenAddress}:`, error.message);
        }
      }
      
      // Fallback to Raydium
      if (this.raydiumEnabled) {
        try {
          const raydiumPrice = await this.getRaydiumPrice(tokenAddress);
          if (raydiumPrice) {
            this.cachePrice(tokenAddress, raydiumPrice);
            return raydiumPrice;
          }
        } catch (error) {
          logger.debug(`Raydium price fetch failed for ${tokenAddress}:`, error.message);
        }
      }
      
      throw new Error(`Unable to fetch price for ${tokenAddress} from any source`);
      
    } catch (error) {
      this.stats.errors++;
      logger.error(`Error getting price for ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get price from Jupiter
   * @param {string} tokenAddress - Token mint address
   * @returns {Promise<number>} Price in SOL
   */
  async getJupiterPrice(tokenAddress) {
    try {
      this.stats.jupiterCalls++;
      
      // Use Jupiter API v6 for quotes
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${tokenAddress}&outputMint=So11111111111111111111111111111111111111112&amount=1000000`;
      
      const response = await axios.get(quoteUrl, {
        timeout: 3000
      });
      
      if (response.data && response.data.outAmount) {
        // Convert lamports to SOL
        const priceInSol = response.data.outAmount / 1e9;
        logger.debug(`Jupiter price for ${tokenAddress}: ${priceInSol} SOL`);
        return priceInSol;
      }
      
      return null;
      
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug(`Token ${tokenAddress} not found on Jupiter`);
      } else {
        logger.debug(`Jupiter API error:`, error.message);
      }
      return null;
    }
  }

  /**
   * Get price from Raydium pools
   * @param {string} tokenAddress - Token mint address
   * @returns {Promise<number>} Price in SOL
   */
  async getRaydiumPrice(tokenAddress) {
    try {
      this.stats.raydiumCalls++;
      
      // Use Raydium API to find pools
      const poolsUrl = `https://api.raydium.io/v2/main/pairs`;
      const response = await axios.get(poolsUrl, {
        timeout: 3000
      });
      
      if (response.data) {
        // Find pools with this token
        const pools = response.data.filter(pool => 
          pool.baseMint === tokenAddress || pool.quoteMint === tokenAddress
        );
        
        if (pools.length === 0) {
          logger.debug(`No Raydium pools found for ${tokenAddress}`);
          return null;
        }
        
        // Get price from most liquid pool
        const sortedPools = pools.sort((a, b) => b.liquidity - a.liquidity);
        const bestPool = sortedPools[0];
        
        // Calculate price in SOL
        let priceInSol;
        if (bestPool.baseMint === tokenAddress) {
          // Token is base, SOL is quote
          priceInSol = parseFloat(bestPool.price);
        } else {
          // Token is quote, SOL is base
          priceInSol = 1 / parseFloat(bestPool.price);
        }
        
        logger.debug(`Raydium price for ${tokenAddress}: ${priceInSol} SOL`);
        return priceInSol;
      }
      
      return null;
      
    } catch (error) {
      logger.debug(`Raydium API error:`, error.message);
      return null;
    }
  }

  /**
   * Get best quote for a swap
   * @param {string} inputMint - Input token address
   * @param {string} outputMint - Output token address
   * @param {number} amount - Amount in smallest unit
   * @param {string} side - 'buy' or 'sell'
   * @returns {Promise<Object>} Quote with route info
   */
  async getBestQuote(inputMint, outputMint, amount, side = 'buy') {
    try {
      // Get quotes from Jupiter (primary)
      if (this.jupiterEnabled) {
        const jupiterQuote = await this.getJupiterQuote(inputMint, outputMint, amount);
        if (jupiterQuote) {
          return {
            provider: 'jupiter',
            ...jupiterQuote
          };
        }
      }
      
      // Fallback to Raydium direct swap quote
      if (this.raydiumEnabled) {
        const raydiumQuote = await this.getRaydiumQuote(inputMint, outputMint, amount);
        if (raydiumQuote) {
          return {
            provider: 'raydium',
            ...raydiumQuote
          };
        }
      }
      
      throw new Error(`Unable to get quote for ${inputMint} -> ${outputMint}`);
      
    } catch (error) {
      logger.error('Error getting best quote:', error);
      throw error;
    }
  }

  /**
   * Get Jupiter swap quote
   */
  async getJupiterQuote(inputMint, outputMint, amount) {
    try {
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
      
      const response = await axios.get(quoteUrl, {
        timeout: 5000
      });
      
      if (response.data) {
        return {
          inAmount: response.data.inAmount,
          outAmount: response.data.outAmount,
          priceImpactPct: response.data.priceImpactPct,
          route: response.data.route || response.data.routePlan,
          otherAmountThreshold: response.data.otherAmountThreshold,
          swapMode: response.data.swapMode,
          contextSlot: response.data.contextSlot,
          timeTaken: response.data.timeTaken
        };
      }
      
      return null;
      
    } catch (error) {
      logger.debug('Jupiter quote error:', error.message);
      return null;
    }
  }

  /**
   * Get Raydium swap quote
   */
  async getRaydiumQuote(inputMint, outputMint, amount) {
    try {
      // For now, return null - full Raydium SDK integration would go here
      // This would require loading pool keys, calculating CPMM math, etc.
      logger.debug('Raydium quote not yet implemented');
      return null;
    } catch (error) {
      logger.debug('Raydium quote error:', error.message);
      return null;
    }
  }

  /**
   * Compare prices across providers
   * @param {string} tokenAddress - Token to compare
   * @returns {Promise<Object>} Comparison results
   */
  async compareProviders(tokenAddress) {
    const results = {
      jupiter: null,
      raydium: null,
      difference: null,
      recommendation: null
    };
    
    try {
      // Get Jupiter price
      if (this.jupiterEnabled) {
        try {
          results.jupiter = await this.getJupiterPrice(tokenAddress);
        } catch (error) {
          logger.debug('Jupiter comparison failed:', error.message);
        }
      }
      
      // Get Raydium price
      if (this.raydiumEnabled) {
        try {
          results.raydium = await this.getRaydiumPrice(tokenAddress);
        } catch (error) {
          logger.debug('Raydium comparison failed:', error.message);
        }
      }
      
      // Calculate difference
      if (results.jupiter && results.raydium) {
        results.difference = Math.abs(results.jupiter - results.raydium) / results.jupiter * 100;
        
        // Recommend better price
        results.recommendation = results.jupiter > results.raydium ? 'jupiter' : 'raydium';
        
        if (results.difference > 5) {
          logger.warn(`Large price difference detected: ${results.difference.toFixed(2)}%`);
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('Error comparing providers:', error);
      return results;
    }
  }

  /**
   * Get cached price if valid
   */
  getCachedPrice(tokenAddress) {
    const cached = this.priceCache.get(tokenAddress);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      // Stale price - remove from cache
      this.priceCache.delete(tokenAddress);
      return null;
    }
    
    return cached.price;
  }

  /**
   * Cache a price
   */
  cachePrice(tokenAddress, price) {
    this.priceCache.set(tokenAddress, {
      price,
      timestamp: Date.now()
    });
  }

  /**
   * Clear price cache
   */
  clearCache() {
    this.priceCache.clear();
    logger.info('Price cache cleared');
  }

  /**
   * Get statistics
   */
  getStats() {
    const cacheSize = this.priceCache.size;
    const totalCalls = this.stats.jupiterCalls + this.stats.raydiumCalls;
    const cacheHitRate = totalCalls > 0 
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100 
      : 0;
    
    return {
      ...this.stats,
      cacheSize,
      cacheHitRate: cacheHitRate.toFixed(1) + '%',
      jupiterEnabled: this.jupiterEnabled,
      raydiumEnabled: this.raydiumEnabled
    };
  }

  /**
   * Log statistics
   */
  logStats() {
    const stats = this.getStats();
    logger.info('📊 Price Feed Stats:', {
      jupiterCalls: stats.jupiterCalls,
      raydiumCalls: stats.raydiumCalls,
      cacheHits: stats.cacheHits,
      cacheHitRate: stats.cacheHitRate,
      errors: stats.errors,
      cacheSize: stats.cacheSize
    });
  }
}

export default PriceFeedManager;

