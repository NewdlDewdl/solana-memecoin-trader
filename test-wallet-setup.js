#!/usr/bin/env node

/**
 * Wallet Setup Verification Script
 * Verifies that wallets are properly configured and funded
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('\n' + '='.repeat(70));
console.log('🔍 WALLET SETUP VERIFICATION');
console.log('='.repeat(70) + '\n');

async function main() {
  try {
    // Step 1: Load configuration
    console.log('Step 1: Loading configuration...\n');
    
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const network = process.env.SOLANA_NETWORK || 'devnet';
    const privateKeysString = process.env.WALLET_PRIVATE_KEYS;

    console.log(`  Network: ${network}`);
    console.log(`  RPC URL: ${rpcUrl}`);
    
    if (!privateKeysString) {
      console.error('\n❌ ERROR: WALLET_PRIVATE_KEYS not found in .env file');
      console.log('\nPlease ensure your .env file contains:');
      console.log('WALLET_PRIVATE_KEYS=key1,key2,key3\n');
      process.exit(1);
    }

    // Step 2: Parse wallet keys
    console.log('\nStep 2: Parsing wallet private keys...\n');
    
    const privateKeys = privateKeysString.split(',').map(k => k.trim());
    console.log(`  Found ${privateKeys.length} private key(s)\n`);

    // Step 3: Load wallets
    console.log('Step 3: Loading wallets...\n');
    
    const wallets = [];
    for (let i = 0; i < privateKeys.length; i++) {
      try {
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKeys[i]));
        wallets.push({
          index: i + 1,
          keypair,
          publicKey: keypair.publicKey.toBase58()
        });
        console.log(`  ✓ Wallet ${i + 1}: ${keypair.publicKey.toBase58()}`);
      } catch (error) {
        console.error(`  ✗ Wallet ${i + 1}: Failed to load - ${error.message}`);
      }
    }

    if (wallets.length === 0) {
      console.error('\n❌ ERROR: No wallets could be loaded');
      process.exit(1);
    }

    // Step 4: Connect to Solana
    console.log('\nStep 4: Connecting to Solana...\n');
    
    const connection = new Connection(rpcUrl, 'confirmed');
    
    try {
      const version = await connection.getVersion();
      console.log(`  ✓ Connected successfully`);
      console.log(`  Solana version: ${version['solana-core']}`);
    } catch (error) {
      console.error(`  ✗ Connection failed: ${error.message}`);
      process.exit(1);
    }

    // Step 5: Check wallet balances
    console.log('\nStep 5: Checking wallet balances...\n');
    
    let totalBalance = 0;
    let fundedWallets = 0;
    const balances = [];

    for (const wallet of wallets) {
      try {
        const balance = await connection.getBalance(wallet.keypair.publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        
        totalBalance += solBalance;
        if (solBalance > 0.01) {
          fundedWallets++;
        }

        balances.push({
          wallet: wallet.index,
          publicKey: wallet.publicKey,
          balance: solBalance,
          status: solBalance > 0.01 ? '✓ Ready' : '⚠ Needs funding'
        });

        const statusIcon = solBalance > 0.01 ? '✓' : '⚠';
        const statusColor = solBalance > 0.01 ? '' : '';
        
        console.log(`  ${statusIcon} Wallet ${wallet.index}:`);
        console.log(`     Address: ${wallet.publicKey}`);
        console.log(`     Balance: ${solBalance.toFixed(4)} SOL`);
        console.log(`     Status:  ${balances[balances.length - 1].status}`);
        console.log('');
        
      } catch (error) {
        console.error(`  ✗ Wallet ${wallet.index}: Error checking balance - ${error.message}`);
        balances.push({
          wallet: wallet.index,
          publicKey: wallet.publicKey,
          balance: 0,
          status: '✗ Error',
          error: error.message
        });
      }
    }

    // Step 6: Summary
    console.log('='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70) + '\n');

    console.log(`Total Wallets:     ${wallets.length}`);
    console.log(`Funded Wallets:    ${fundedWallets}`);
    console.log(`Unfunded Wallets:  ${wallets.length - fundedWallets}`);
    console.log(`Total SOL:         ${totalBalance.toFixed(4)} SOL`);
    console.log(`Network:           ${network}`);

    console.log('\n' + '-'.repeat(70) + '\n');

    // Status assessment
    if (fundedWallets === 0) {
      console.log('❌ STATUS: NOT READY');
      console.log('\nNo wallets have funds. You need to fund at least one wallet.');
      console.log('\nTo fund your wallets, visit: https://faucet.solana.com/');
      console.log('\nOr use the Solana CLI:');
      balances.forEach(b => {
        if (b.balance < 0.01) {
          console.log(`  solana airdrop 2 ${b.publicKey} --url devnet`);
        }
      });
    } else if (fundedWallets < wallets.length) {
      console.log('⚠️  STATUS: PARTIALLY READY');
      console.log(`\n${fundedWallets} out of ${wallets.length} wallets are funded.`);
      console.log('You can start testing with the funded wallets!');
      console.log('\nUnfunded wallets will automatically become available once funded.');
      console.log('\nTo fund remaining wallets:');
      balances.forEach(b => {
        if (b.balance < 0.01) {
          console.log(`  solana airdrop 2 ${b.publicKey} --url devnet`);
        }
      });
    } else {
      console.log('✅ STATUS: READY');
      console.log('\nAll wallets are funded and ready for trading!');
    }

    console.log('\n' + '='.repeat(70));
    console.log('🔗 EXPLORER LINKS');
    console.log('='.repeat(70) + '\n');

    const explorerBase = network === 'devnet' 
      ? 'https://explorer.solana.com/address'
      : 'https://explorer.solana.com/address';
    
    const cluster = network === 'devnet' ? '?cluster=devnet' : '';

    balances.forEach(b => {
      console.log(`Wallet ${b.wallet}: ${explorerBase}/${b.publicKey}${cluster}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('🚀 NEXT STEPS');
    console.log('='.repeat(70) + '\n');

    if (fundedWallets > 0) {
      console.log('1. Run the dry-run test:');
      console.log('   node test-dry-run.js\n');
      console.log('2. Or start the bot (ensure DRY_RUN_MODE=true in .env):');
      console.log('   npm start\n');
    } else {
      console.log('1. Fund your wallets using the faucet or CLI commands above\n');
      console.log('2. Run this script again to verify:');
      console.log('   node test-wallet-setup.js\n');
    }

    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

main();

