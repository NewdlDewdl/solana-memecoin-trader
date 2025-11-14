import SafetyMonitor from './src/safety/safetyMonitor.js';
import { logger } from './src/utils/logger.js';
import fs from 'fs';

/**
 * Test emergency stop mechanisms
 */
async function testEmergencyStops() {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 EMERGENCY STOP MECHANISMS TEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    // Initialize safety monitor
    const safetyMonitor = new SafetyMonitor({
      maxDrawdownPercent: 20,
      maxConsecutiveLosses: 5,
      maxRpcFailures: 10,
      maxPortfolioHeat: 80,
      minSolBalance: 0.5,
      emergencyStopFile: '.stop.test',
      checkIntervalMs: 1000 // Fast checks for testing
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST 1: Initial State');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    safetyMonitor.logStatus();
    
    if (!safetyMonitor.isSafeToTrade()) {
      throw new Error('Initial state should be safe to trade');
    }
    logger.info('✅ Initial state: SAFE');
    
    // Test 2: Consecutive Losses
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📉 TEST 2: Consecutive Losses Trigger');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.info('Simulating 5 consecutive losses...');
    for (let i = 1; i <= 5; i++) {
      safetyMonitor.recordTradeResult(false);
      logger.info(`   Loss ${i}/5 recorded`);
    }
    
    const shouldStopAfterLosses = !safetyMonitor.isSafeToTrade();
    if (shouldStopAfterLosses) {
      logger.info('✅ Circuit breaker triggered after 5 consecutive losses');
    } else {
      throw new Error('Circuit breaker should have triggered');
    }
    
    // Reset for next test
    safetyMonitor.resetCircuitBreaker();
    logger.info('🔄 Circuit breaker reset');
    
    // Test 3: Max Drawdown
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📉 TEST 3: Max Drawdown Trigger');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.info('Simulating 25% drawdown...');
    safetyMonitor.updatePortfolioMetrics(100, 100); // Start at 100 SOL
    safetyMonitor.updatePortfolioMetrics(75, 100);  // Drop to 75 SOL (-25%)
    safetyMonitor.checkSafety();
    
    const shouldStopAfterDrawdown = !safetyMonitor.isSafeToTrade();
    if (shouldStopAfterDrawdown) {
      logger.info('✅ Circuit breaker triggered after 25% drawdown');
    } else {
      throw new Error('Circuit breaker should have triggered');
    }
    
    // Reset for next test
    safetyMonitor.resetCircuitBreaker();
    logger.info('🔄 Circuit breaker reset');
    
    // Test 4: RPC Failures
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔌 TEST 4: RPC Failures Trigger');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.info('Simulating 10 RPC failures...');
    for (let i = 1; i <= 10; i++) {
      safetyMonitor.recordRpcFailure();
    }
    safetyMonitor.checkSafety();
    
    const shouldStopAfterRpcFailures = !safetyMonitor.isSafeToTrade();
    if (shouldStopAfterRpcFailures) {
      logger.info('✅ Circuit breaker triggered after 10 RPC failures');
    } else {
      throw new Error('Circuit breaker should have triggered');
    }
    
    // Reset for next test
    safetyMonitor.resetCircuitBreaker();
    logger.info('🔄 Circuit breaker reset');
    
    // Test 5: Low Balance
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 TEST 5: Low Balance Trigger');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.info('Simulating balance drop to 0.3 SOL (min: 0.5)...');
    safetyMonitor.updateBalance(0.3);
    safetyMonitor.checkSafety();
    
    const shouldStopAfterLowBalance = !safetyMonitor.isSafeToTrade();
    if (shouldStopAfterLowBalance) {
      logger.info('✅ Circuit breaker triggered after low balance');
    } else {
      throw new Error('Circuit breaker should have triggered');
    }
    
    // Reset for next test
    safetyMonitor.resetCircuitBreaker();
    logger.info('🔄 Circuit breaker reset');
    
    // Test 6: Manual Stop File
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🛑 TEST 6: Manual Stop File');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.info('Creating emergency stop file...');
    fs.writeFileSync('.stop.test', 'EMERGENCY STOP');
    
    safetyMonitor.checkSafety();
    
    const shouldStopWithFile = !safetyMonitor.isSafeToTrade();
    if (shouldStopWithFile) {
      logger.info('✅ Circuit breaker triggered by stop file');
    } else {
      throw new Error('Circuit breaker should have triggered');
    }
    
    // Clean up
    logger.info('Removing emergency stop file...');
    fs.unlinkSync('.stop.test');
    
    // Test 7: Recovery
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 TEST 7: Recovery After Reset');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    safetyMonitor.resetCircuitBreaker();
    logger.info('Circuit breaker reset');
    
    // Update to healthy state
    safetyMonitor.updateBalance(2.0);
    safetyMonitor.updatePortfolioMetrics(100, 100);
    safetyMonitor.checkSafety();
    
    const canTradeAfterReset = safetyMonitor.isSafeToTrade();
    if (canTradeAfterReset) {
      logger.info('✅ Trading re-enabled after reset and healthy state');
    } else {
      throw new Error('Trading should be enabled after reset');
    }
    
    // Final Statistics
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 FINAL STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    safetyMonitor.logStatus();
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ ALL EMERGENCY STOP TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    
    // Clean up test file if it exists
    try {
      fs.unlinkSync('.stop.test');
    } catch (e) {
      // Ignore
    }
    
    process.exit(1);
  }
}

// Run test
testEmergencyStops()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

