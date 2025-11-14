import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import { logger } from '../utils/logger.js';

/**
 * Multi-Wallet Management Module
 * Manages multiple trading wallets for parallel execution and risk distribution
 */

export class WalletManager {
  constructor(connection, config) {
    this.connection = connection;
    this.config = config;
    this.wallets = [];
    this.walletBalances = new Map();
    this.activePositions = new Map();
  }

  /**
   * Load wallets from private keys
   */
  loadWallets(privateKeys) {
    logger.info('Loading wallets...');

    this.wallets = privateKeys.map((key, index) => {
      try {
        let keypair;

        // Support both base58 and array formats
        if (typeof key === 'string') {
          keypair = Keypair.fromSecretKey(bs58.decode(key));
        } else {
          keypair = Keypair.fromSecretKey(Uint8Array.from(key));
        }

        const wallet = {
          index,
          keypair,
          publicKey: keypair.publicKey.toBase58(),
          positions: [],
          available: true
        };

        logger.info(`Wallet ${index + 1} loaded: ${wallet.publicKey}`);
        return wallet;

      } catch (error) {
        logger.error(`Failed to load wallet ${index + 1}:`, error);
        return null;
      }
    }).filter(w => w !== null);

    logger.info(`Successfully loaded ${this.wallets.length} wallets`);
    return this.wallets;
  }

  /**
   * Get all wallet balances
   */
  async updateBalances() {
    const balances = await Promise.all(
      this.wallets.map(async (wallet) => {
        try {
          const balance = await this.connection.getBalance(wallet.keypair.publicKey);
          const solBalance = balance / LAMPORTS_PER_SOL;

          this.walletBalances.set(wallet.publicKey, {
            sol: solBalance,
            lamports: balance,
            updatedAt: Date.now()
          });

          return {
            publicKey: wallet.publicKey,
            sol: solBalance,
            index: wallet.index
          };

        } catch (error) {
          logger.error(`Error fetching balance for wallet ${wallet.index}:`, error);
          return null;
        }
      })
    );

    return balances.filter(b => b !== null);
  }

  /**
   * Get total portfolio value across all wallets
   */
  async getTotalPortfolioValue() {
    const balances = await this.updateBalances();
    const totalSol = balances.reduce((sum, b) => sum + b.sol, 0);

    return {
      totalSol,
      totalUsd: totalSol * (await this.getSolPrice()),
      walletCount: this.wallets.length,
      balances
    };
  }

  /**
   * Get SOL price (simplified - use an oracle in production)
   */
  async getSolPrice() {
    // TODO: Integrate with price oracle (Jupiter, Pyth, etc.)
    return 100; // Placeholder $100/SOL
  }

  /**
   * Select best wallet for a trade
   */
  selectWalletForTrade(requiredSol, tokenMint = null) {
    // Filter available wallets with sufficient balance
    const eligible = this.wallets.filter(wallet => {
      const balance = this.walletBalances.get(wallet.publicKey);

      if (!balance || !wallet.available) return false;

      // Reserve some SOL for gas (0.01 SOL)
      const availableSol = balance.sol - 0.01;

      // Check if wallet already has a position in this token
      if (tokenMint) {
        const hasPosition = wallet.positions.some(p => p.tokenMint === tokenMint);
        if (hasPosition) return false; // Avoid same token in one wallet
      }

      return availableSol >= requiredSol;
    });

    if (eligible.length === 0) {
      logger.warn('No eligible wallets for trade');
      return null;
    }

    // Select wallet with most available balance
    eligible.sort((a, b) => {
      const balanceA = this.walletBalances.get(a.publicKey).sol;
      const balanceB = this.walletBalances.get(b.publicKey).sol;
      return balanceB - balanceA;
    });

    return eligible[0];
  }

  /**
   * Distribute a large position across multiple wallets
   */
  distributePosition(totalSol, tokenMint) {
    const maxPositionPerWallet = this.config.wallet?.maxPositionPerWallet || 0.5;

    if (totalSol <= maxPositionPerWallet) {
      // Single wallet sufficient
      const wallet = this.selectWalletForTrade(totalSol, tokenMint);
      return wallet ? [{
        wallet,
        amount: totalSol
      }] : [];
    }

    // Distribute across multiple wallets
    const distribution = [];
    let remaining = totalSol;

    while (remaining > 0 && distribution.length < this.wallets.length) {
      const amount = Math.min(remaining, maxPositionPerWallet);
      const wallet = this.selectWalletForTrade(amount, tokenMint);

      if (!wallet) break;

      distribution.push({ wallet, amount });
      wallet.available = false; // Mark as in-use temporarily
      remaining -= amount;
    }

    // Re-enable wallets
    distribution.forEach(d => d.wallet.available = true);

    if (remaining > 0) {
      logger.warn(`Could not distribute full position: ${remaining} SOL remaining`);
    }

    logger.info(`Position distributed across ${distribution.length} wallets`);
    return distribution;
  }

  /**
   * Track position in wallet
   */
  addPosition(walletPublicKey, position) {
    const wallet = this.wallets.find(w => w.publicKey === walletPublicKey);

    if (!wallet) {
      logger.error(`Wallet ${walletPublicKey} not found`);
      return false;
    }

    wallet.positions.push({
      ...position,
      addedAt: Date.now()
    });

    // Track globally
    this.activePositions.set(position.id, {
      ...position,
      walletPublicKey
    });

    logger.info(`Position added to wallet ${wallet.index}: ${position.tokenMint}`);
    return true;
  }

  /**
   * Remove position from wallet
   */
  removePosition(walletPublicKey, positionId) {
    const wallet = this.wallets.find(w => w.publicKey === walletPublicKey);

    if (!wallet) return false;

    wallet.positions = wallet.positions.filter(p => p.id !== positionId);
    this.activePositions.delete(positionId);

    logger.info(`Position ${positionId} removed from wallet ${wallet.index}`);
    return true;
  }

  /**
   * Get all positions across all wallets
   */
  getAllPositions() {
    const positions = [];

    this.wallets.forEach(wallet => {
      wallet.positions.forEach(position => {
        positions.push({
          ...position,
          walletIndex: wallet.index,
          walletPublicKey: wallet.publicKey
        });
      });
    });

    return positions;
  }

  /**
   * Get positions for specific token
   */
  getPositionsByToken(tokenMint) {
    return this.getAllPositions().filter(p => p.tokenMint === tokenMint);
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(walletPublicKey, tokenMint) {
    try {
      const walletPubkey = new PublicKey(walletPublicKey);
      const mintPubkey = new PublicKey(tokenMint);

      // Get associated token account
      const tokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        walletPubkey
      );

      const accountInfo = await this.connection.getTokenAccountBalance(tokenAccount);

      return {
        address: tokenAccount.toBase58(),
        balance: accountInfo.value.uiAmount,
        decimals: accountInfo.value.decimals
      };

    } catch (error) {
      // Account doesn't exist yet
      return {
        balance: 0,
        decimals: 0
      };
    }
  }

  /**
   * Rebalance SOL across wallets
   */
  async rebalanceWallets() {
    logger.info('Rebalancing wallets...');

    const balances = await this.updateBalances();
    const totalSol = balances.reduce((sum, b) => sum + b.sol, 0);
    const targetPerWallet = totalSol / this.wallets.length;

    logger.info(`Total SOL: ${totalSol}, Target per wallet: ${targetPerWallet}`);

    // TODO: Implement actual SOL transfer logic
    // This requires sending SOL from over-funded to under-funded wallets

    logger.warn('Rebalancing not fully implemented');
    return false;
  }

  /**
   * Get wallet by index
   */
  getWallet(index) {
    return this.wallets[index];
  }

  /**
   * Get wallet by public key
   */
  getWalletByPublicKey(publicKey) {
    return this.wallets.find(w => w.publicKey === publicKey);
  }

  /**
   * Get wallet statistics
   */
  getWalletStats() {
    return this.wallets.map(wallet => {
      const balance = this.walletBalances.get(wallet.publicKey);

      return {
        index: wallet.index,
        publicKey: wallet.publicKey,
        solBalance: balance?.sol || 0,
        activePositions: wallet.positions.length,
        available: wallet.available
      };
    });
  }

  /**
   * Emergency withdraw all tokens from all wallets
   */
  async emergencyWithdrawAll(destinationAddress) {
    logger.warn('⚠️ EMERGENCY WITHDRAWAL INITIATED');

    // TODO: Implement emergency withdrawal logic
    // This should transfer all SOL and tokens to a safe address

    logger.error('Emergency withdrawal not fully implemented');
    return false;
  }
}
