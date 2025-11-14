import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import SwapExecutor from './src/execution/swapExecutor.js';
import { logger } from './src/utils/logger.js';
import bs58 from 'bs58';

dotenv.config();

/**
 * Test swap execution (dry run - simulation only)
 */
async function testSwapDryRun() {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🧪 SWAP EXECUTION DRY RUN TEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    // Initialize connection
    const rpcUrl = process.env.MAINNET_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    logger.info(`🔌 Connected to: ${rpcUrl.split('?')[0]}...`);
    
    // Load wallet (first wallet from env)
    const privateKeysString = process.env.WALLET_PRIVATE_KEYS;
    if (!privateKeysString) {
      throw new Error('WALLET_PRIVATE_KEYS not configured in .env');
    }
    
    const privateKeys = privateKeysString.split(',');
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKeys[0]));
    
    logger.info(`💼 Wallet: ${wallet.publicKey.toString()}`);
    
    // Initialize swap executor
    const swapExecutor = new SwapExecutor(connection, wallet, {
      jupiterEnabled: true,
      raydiumEnabled: false,
      slippageBps: 100,
      maxRetries: 1
    });
    
    // Test tokens
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    
    // Test 1: Get Jupiter quote for SOL -> USDC
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST 1: Get Quote (SOL → USDC)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const amount = 100000000; // 0.1 SOL
    logger.info(`Requesting quote for ${amount / 1e9} SOL → USDC...`);
    
    const quote = await swapExecutor.getJupiterQuote(SOL_MINT, USDC_MINT, amount);
    
    if (quote) {
      logger.info('✅ Quote received:');
      logger.info(`   Input: ${quote.inAmount / 1e9} SOL`);
      logger.info(`   Output: ${quote.outAmount / 1e6} USDC`);
      logger.info(`   Price Impact: ${quote.priceImpactPct}%`);
      logger.info(`   Slippage: ${quote.slippageBps / 100}%`);
    } else {
      logger.warn('❌ No quote available');
    }
    
    // Test 2: Token account check
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 TEST 2: Token Account Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.info(`Checking if wallet has USDC token account...`);
    
    try {
      const usdcAta = await swapExecutor.ensureTokenAccount(USDC_MINT);
      logger.info(`✅ USDC Token Account: ${usdcAta.toString()}`);
    } catch (error) {
      logger.warn(`⚠️  Token account check skipped: ${error.message}`);
    }
    
    // Test 3: Compare quotes for different routes
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 TEST 3: Compare Routes (SOL → BONK)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const bonkQuote = await swapExecutor.getJupiterQuote(SOL_MINT, BONK_MINT, amount);
    
    if (bonkQuote) {
      logger.info('✅ BONK Quote:');
      logger.info(`   Input: ${bonkQuote.inAmount / 1e9} SOL`);
      logger.info(`   Output: ${(bonkQuote.outAmount / 1e5).toFixed(2)} BONK`);
      logger.info(`   Price Impact: ${bonkQuote.priceImpactPct}%`);
    } else {
      logger.warn('❌ No BONK quote available');
    }
    
    // Test 4: Statistics
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 SWAP EXECUTOR STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    swapExecutor.logStats();
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('⚠️  NOTE: This was a dry run. No actual swaps were executed.');
    console.log('   To execute real swaps, set TRADING_MODE=live in .env');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  }
}

// Run test
testSwapDryRun()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

