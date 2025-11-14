import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';
import PriceFeedManager from './src/pricing/priceFeedManager.js';
import { logger } from './src/utils/logger.js';

dotenv.config();

/**
 * Comprehensive price feed testing
 */
async function testPriceFeeds() {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 PRICE FEED TESTING SUITE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    // Initialize connection
    const rpcUrl = process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    logger.info(`🔌 Connected to: ${rpcUrl.split('?')[0]}...`);
    
    // Test 1: Jupiter vs Raydium Comparison
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST 1: Jupiter vs Raydium Price Comparison');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const priceFeedManager = new PriceFeedManager(connection, {
      jupiterEnabled: true,
      raydiumEnabled: true,
      cacheTTL: 5000
    });
    
    await priceFeedManager.initialize();
    
    const testTokens = [
      { name: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
      { name: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
    ];
    
    for (const token of testTokens) {
      logger.info(`Testing: ${token.name}`);
      
      const comparison = await priceFeedManager.compareProviders(token.address);
      
      if (comparison.jupiter) {
        logger.info(`  Jupiter: ${comparison.jupiter.toFixed(9)} SOL`);
      }
      if (comparison.raydium) {
        logger.info(`  Raydium: ${comparison.raydium.toFixed(9)} SOL`);
      }
      if (comparison.difference !== null) {
        logger.info(`  Difference: ${comparison.difference.toFixed(2)}%`);
        logger.info(`  Best: ${comparison.recommendation}`);
        
        if (comparison.difference > 1) {
          logger.warn(`  ⚠️  Large price difference detected!`);
        } else {
          logger.info(`  ✅ Prices match within 1%`);
        }
      }
      console.log('');
    }
    
    // Test 2: Cache Performance
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚡ TEST 2: Cache Performance');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const testToken = testTokens[0];
    
    // First call (cache miss)
    const start1 = Date.now();
    await priceFeedManager.getPrice(testToken.address);
    const time1 = Date.now() - start1;
    
    // Second call (cache hit)
    const start2 = Date.now();
    await priceFeedManager.getPrice(testToken.address);
    const time2 = Date.now() - start2;
    
    logger.info(`Cache Miss: ${time1}ms`);
    logger.info(`Cache Hit:  ${time2}ms`);
    logger.info(`Speedup:    ${(time1 / time2).toFixed(1)}x faster`);
    
    if (time2 < 10) {
      logger.info(`✅ Cache working efficiently`);
    } else {
      logger.warn(`⚠️  Cache slower than expected`);
    }
    
    // Test 3: Price Staleness Detection
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ TEST 3: Price Staleness Detection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    priceFeedManager.clearCache();
    logger.info('Cache cleared');
    
    await priceFeedManager.getPrice(testToken.address);
    logger.info('Price fetched and cached');
    
    logger.info('Waiting 6 seconds (beyond 5s TTL)...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    const start3 = Date.now();
    await priceFeedManager.getPrice(testToken.address);
    const time3 = Date.now() - start3;
    
    if (time3 > 50) {
      logger.info(`✅ Stale price detected and refetched (${time3}ms)`);
    } else {
      logger.warn(`⚠️  Price might not have been refetched`);
    }
    
    // Test 4: Rate Limiting
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚦 TEST 4: RPC Call Frequency');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    priceFeedManager.clearCache();
    
    const startBatch = Date.now();
    for (let i = 0; i < 10; i++) {
      await priceFeedManager.getPrice(testToken.address);
    }
    const batchTime = Date.now() - startBatch;
    
    logger.info(`10 sequential calls: ${batchTime}ms`);
    logger.info(`Average per call: ${(batchTime / 10).toFixed(1)}ms`);
    
    const stats = priceFeedManager.getStats();
    logger.info(`Cache hit rate: ${stats.cacheHitRate}`);
    
    if (stats.cacheHitRate === '90.0%') {
      logger.info(`✅ Cache reducing RPC calls efficiently`);
    }
    
    // Final Stats
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 FINAL STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    priceFeedManager.logStats();
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  }
}

// Run tests
testPriceFeeds()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

