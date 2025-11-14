#!/usr/bin/env node

/**
 * Test Helius RPC Connection
 */

import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('\n' + '='.repeat(70));
console.log('🧪 TESTING HELIUS RPC CONNECTION');
console.log('='.repeat(70) + '\n');

async function testHelius() {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    
    console.log('RPC URL:', rpcUrl.replace(/api-key=[^&]+/, 'api-key=***'));
    console.log('\nConnecting...');
    
    const connection = new Connection(rpcUrl, 'confirmed');
    
    // Test 1: Get Version
    console.log('\n[Test 1] Getting Solana version...');
    const version = await connection.getVersion();
    console.log('✓ Version:', version['solana-core']);
    
    // Test 2: Get Slot
    console.log('\n[Test 2] Getting current slot...');
    const slot = await connection.getSlot();
    console.log('✓ Current slot:', slot);
    
    // Test 3: Get Recent Blockhash
    console.log('\n[Test 3] Getting recent blockhash...');
    const { blockhash } = await connection.getLatestBlockhash();
    console.log('✓ Blockhash:', blockhash.substring(0, 20) + '...');
    
    // Test 4: Multiple rapid requests (test rate limits)
    console.log('\n[Test 4] Testing rate limits (10 rapid requests)...');
    const startTime = Date.now();
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(connection.getSlot());
    }
    await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    console.log(`✓ Completed 10 requests in ${elapsed}ms (no rate limiting!)`);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL TESTS PASSED - HELIUS CONNECTION WORKING!');
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testHelius();

