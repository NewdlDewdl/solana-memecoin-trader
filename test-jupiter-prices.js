import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import PriceFeedManager from './src/pricing/priceFeedManager.js';
import { logger } from './src/utils/logger.js';

dotenv.config();

/**
 * Test Jupiter price feeds
 */
async function testJupiterPrices() {
  try {
    logger.info('🧪 Testing Jupiter Price Feeds');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Initialize connection
    const rpcUrl = process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    logger.info(`Connected to: ${rpcUrl}`);
    
    // Initialize price feed manager
    const priceFeedManager = new PriceFeedManager(connection, {
      jupiterEnabled: true,
      raydiumEnabled: false,
      cacheTTL: 5000
    });
    
    await priceFeedManager.initialize();
    
    // Test tokens (well-known tokens on Solana)
    const testTokens = [
      { name: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
      { name: 'USDT', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
      { name: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
    ];
    
    logger.info('\n📊 Fetching prices from Jupiter...\n');
    
    for (const token of testTokens) {
      try {
        logger.info(`Testing ${token.name} (${token.address.slice(0, 8)}...)`);
        
        const startTime = Date.now();
        const price = await priceFeedManager.getPrice(token.address);
        const elapsed = Date.now() - startTime;
        
        if (price) {
          logger.info(`✅ ${token.name}: ${price.toFixed(9)} SOL (fetched in ${elapsed}ms)`);
          
          // Test cache (should be instant)
          const startTime2 = Date.now();
          const cachedPrice = await priceFeedManager.getPrice(token.address);
          const elapsed2 = Date.now() - startTime2;
          
          logger.info(`   Cache hit: ${cachedPrice.toFixed(9)} SOL (fetched in ${elapsed2}ms)`);
        } else {
          logger.warn(`❌ ${token.name}: No price available`);
        }
        
        logger.info('');
        
      } catch (error) {
        logger.error(`❌ ${token.name}: Error - ${error.message}`);
      }
    }
    
    // Print stats
    logger.info('\n📈 Price Feed Statistics:');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    priceFeedManager.logStats();
    
    logger.info('\n✅ Jupiter price feed test complete!');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run test
testJupiterPrices()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });

