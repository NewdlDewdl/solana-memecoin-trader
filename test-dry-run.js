#!/usr/bin/env node

/**
 * Dry-Run Test Script
 * Tests bot initialization without starting actual trading
 */

import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';
import { WalletManager } from './src/wallet/walletManager.js';
import config from './src/utils/config.js';

dotenv.config();

console.log('\n' + '='.repeat(70));
console.log('🧪 DRY-RUN TEST - BOT INITIALIZATION');
console.log('='.repeat(70) + '\n');

async function main() {
  try {
    // Check dry-run mode
    const isDryRun = process.env.DRY_RUN_MODE === 'true';
    
    if (!isDryRun) {
      console.log('⚠️  WARNING: DRY_RUN_MODE is not enabled!\n');
      console.log('For safety, please set DRY_RUN_MODE=true in your .env file');
      console.log('before running this test.\n');
      
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      await new Promise((resolve) => {
        rl.question('Continue anyway? (yes/no): ', (answer) => {
          rl.close();
          if (answer.toLowerCase() !== 'yes') {
            console.log('\nTest cancelled.');
            process.exit(0);
          }
          resolve();
        });
      });
    } else {
      console.log('✓ DRY_RUN_MODE: Enabled\n');
    }

    // Load configuration
    console.log('Step 1: Loading configuration...\n');
    const cfg = config.getConfig();
    
    console.log('  Configuration loaded:');
    console.log(`    Network: ${cfg.solana?.network || process.env.SOLANA_NETWORK || 'devnet'}`);
    console.log(`    RPC URL: ${cfg.solana?.rpcUrl}`);
    console.log(`    Max Position Size: ${cfg.risk?.maxPositionSize} SOL`);
    console.log(`    Max Total Exposure: ${cfg.risk?.maxTotalExposure} SOL`);
    console.log(`    Default Slippage: ${cfg.risk?.defaultSlippage} bps`);
    console.log('');

    // Validate configuration
    console.log('Step 2: Validating configuration...\n');
    const validation = config.validate();
    
    if (!validation.valid) {
      console.error('  ❌ Configuration validation failed:');
      validation.errors.forEach(error => {
        console.error(`     - ${error}`);
      });
      process.exit(1);
    }
    
    console.log('  ✓ Configuration is valid\n');

    // Connect to Solana
    console.log('Step 3: Connecting to Solana...\n');
    const connection = new Connection(cfg.solana.rpcUrl, 'confirmed');
    
    try {
      const version = await connection.getVersion();
      const slot = await connection.getSlot();
      console.log(`  ✓ Connected successfully`);
      console.log(`    Version: ${version['solana-core']}`);
      console.log(`    Current Slot: ${slot}`);
    } catch (error) {
      console.error(`  ✗ Connection failed: ${error.message}`);
      process.exit(1);
    }
    console.log('');

    // Initialize Wallet Manager
    console.log('Step 4: Initializing Wallet Manager...\n');
    const walletManager = new WalletManager(connection, cfg);
    
    // Load wallets
    const wallets = walletManager.loadWallets(cfg.wallets.privateKeys);
    console.log(`  ✓ Loaded ${wallets.length} wallet(s)\n`);

    // Check balances
    console.log('Step 5: Checking wallet balances...\n');
    const balances = await walletManager.updateBalances();
    
    let totalSol = 0;
    let readyWallets = 0;
    
    balances.forEach((balance, index) => {
      const status = balance.sol > 0.01 ? '✓ Ready' : '⚠ Needs funding';
      const icon = balance.sol > 0.01 ? '✓' : '⚠';
      
      console.log(`  ${icon} Wallet ${index + 1}:`);
      console.log(`     Public Key: ${balance.publicKey}`);
      console.log(`     Balance: ${balance.sol.toFixed(4)} SOL`);
      console.log(`     Status: ${status}`);
      console.log('');
      
      totalSol += balance.sol;
      if (balance.sol > 0.01) readyWallets++;
    });

    console.log(`  Total Available: ${totalSol.toFixed(4)} SOL across ${readyWallets} funded wallet(s)\n`);

    // Display wallet stats
    console.log('Step 6: Wallet statistics...\n');
    const stats = walletManager.getWalletStats();
    
    stats.forEach(stat => {
      console.log(`  Wallet ${stat.index}:`);
      console.log(`    Public Key: ${stat.publicKey}`);
      console.log(`    Balance: ${stat.solBalance.toFixed(4)} SOL`);
      console.log(`    Active Positions: ${stat.activePositions}`);
      console.log(`    Available: ${stat.available ? 'Yes' : 'No'}`);
      console.log('');
    });

    // Test wallet selection
    console.log('Step 7: Testing wallet selection...\n');
    
    const testAmount = 0.1; // Try to select a wallet for 0.1 SOL trade
    const selectedWallet = walletManager.selectWalletForTrade(testAmount);
    
    if (selectedWallet) {
      console.log(`  ✓ Wallet selection test passed`);
      console.log(`    Selected wallet: ${selectedWallet.publicKey}`);
      console.log(`    For trade amount: ${testAmount} SOL`);
    } else {
      console.log(`  ⚠ No wallet has sufficient balance for ${testAmount} SOL trade`);
    }
    console.log('');

    // Summary
    console.log('='.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70) + '\n');

    const allPassed = validation.valid && wallets.length > 0 && readyWallets > 0;
    
    if (allPassed) {
      console.log('✅ STATUS: ALL TESTS PASSED\n');
      console.log('Your bot is ready for testing!\n');
      console.log('Key Metrics:');
      console.log(`  • Total Wallets: ${wallets.length}`);
      console.log(`  • Funded Wallets: ${readyWallets}`);
      console.log(`  • Total Capital: ${totalSol.toFixed(4)} SOL`);
      console.log(`  • Network: ${cfg.solana?.network || process.env.SOLANA_NETWORK || 'devnet'}`);
      console.log(`  • Dry-Run Mode: ${isDryRun ? 'Enabled ✓' : 'Disabled ⚠️'}`);
    } else {
      console.log('⚠️  STATUS: SOME ISSUES DETECTED\n');
      
      if (!validation.valid) {
        console.log('  • Configuration has errors');
      }
      if (wallets.length === 0) {
        console.log('  • No wallets loaded');
      }
      if (readyWallets === 0) {
        console.log('  • No funded wallets');
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('🚀 NEXT STEPS');
    console.log('='.repeat(70) + '\n');

    if (allPassed && isDryRun) {
      console.log('You can now:');
      console.log('');
      console.log('1. Start the bot in dry-run mode:');
      console.log('   npm start');
      console.log('');
      console.log('2. Monitor wallet balances:');
      console.log('   node test-wallet-setup.js');
      console.log('');
      console.log('3. Check configuration:');
      console.log('   cat .env | grep -v "^#"');
      console.log('');
    } else if (allPassed && !isDryRun) {
      console.log('⚠️  IMPORTANT: Enable dry-run mode before starting!');
      console.log('');
      console.log('Add this to your .env file:');
      console.log('  DRY_RUN_MODE=true');
      console.log('');
    } else {
      console.log('Fix the issues above and run this test again:');
      console.log('  node test-dry-run.js');
      console.log('');
    }

    console.log('='.repeat(70) + '\n');

    // Safety reminder
    if (!isDryRun) {
      console.log('⚠️  SAFETY REMINDER:');
      console.log('Always test on devnet with DRY_RUN_MODE=true first!');
      console.log('');
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  }
}

main();

