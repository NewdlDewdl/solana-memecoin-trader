import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from '../utils/logger.js';

/**
 * Rug Pull Detection Module
 * Analyzes token contracts for common rug pull indicators
 */

export class RugDetection {
  constructor(connection, config) {
    this.connection = connection;
    this.config = config;
  }

  /**
   * Comprehensive rug detection analysis
   * Returns safety score (0-100) and detected risks
   */
  async analyzeToken(tokenMint) {
    logger.info(`Analyzing token ${tokenMint} for rug risks...`);

    const risks = [];
    let safetyScore = 100;

    try {
      // 1. Check mint authority
      const mintAuthority = await this.checkMintAuthority(tokenMint);
      if (mintAuthority.hasAuthority) {
        risks.push({
          severity: 'CRITICAL',
          type: 'MINT_AUTHORITY_NOT_REVOKED',
          message: 'Mint authority is not revoked - unlimited token minting possible',
          impact: -40
        });
        safetyScore -= 40;
      }

      // 2. Check freeze authority
      const freezeAuthority = await this.checkFreezeAuthority(tokenMint);
      if (freezeAuthority.hasAuthority) {
        risks.push({
          severity: 'CRITICAL',
          type: 'FREEZE_AUTHORITY_NOT_REVOKED',
          message: 'Freeze authority is not revoked - tokens can be frozen',
          impact: -40
        });
        safetyScore -= 40;
      }

      // 3. Analyze holder distribution
      const holderAnalysis = await this.analyzeHolderDistribution(tokenMint);
      if (holderAnalysis.topHolderPercentage > 0.3) {
        risks.push({
          severity: 'HIGH',
          type: 'HIGH_WHALE_CONCENTRATION',
          message: `Top holder owns ${(holderAnalysis.topHolderPercentage * 100).toFixed(1)}% of supply`,
          impact: -20
        });
        safetyScore -= 20;
      }

      // 4. Check liquidity lock status
      const liquidityStatus = await this.checkLiquidityLock(tokenMint);
      if (!liquidityStatus.isLocked && !liquidityStatus.isBurned) {
        risks.push({
          severity: 'HIGH',
          type: 'LIQUIDITY_NOT_LOCKED',
          message: 'Liquidity is not locked or burned - rug pull possible',
          impact: -25
        });
        safetyScore -= 25;
      }

      // 5. Check token age
      const tokenAge = await this.getTokenAge(tokenMint);
      if (tokenAge < 3600) { // Less than 1 hour old
        risks.push({
          severity: 'MEDIUM',
          type: 'VERY_NEW_TOKEN',
          message: `Token is only ${Math.floor(tokenAge / 60)} minutes old`,
          impact: -10
        });
        safetyScore -= 10;
      }

      // 6. Check total holders count
      if (holderAnalysis.totalHolders < this.config.entry?.minHolders || 50) {
        risks.push({
          severity: 'MEDIUM',
          type: 'LOW_HOLDER_COUNT',
          message: `Only ${holderAnalysis.totalHolders} holders`,
          impact: -15
        });
        safetyScore -= 15;
      }

      const analysis = {
        tokenMint,
        safetyScore: Math.max(0, safetyScore),
        risks,
        recommendation: this.getRecommendation(safetyScore),
        details: {
          mintAuthority,
          freezeAuthority,
          holderAnalysis,
          liquidityStatus,
          tokenAge
        },
        analyzedAt: Date.now()
      };

      logger.info(`Token ${tokenMint} analysis complete: Safety Score ${analysis.safetyScore}/100`);

      return analysis;

    } catch (error) {
      logger.error('Error analyzing token:', error);
      return {
        tokenMint,
        safetyScore: 0,
        risks: [{
          severity: 'CRITICAL',
          type: 'ANALYSIS_FAILED',
          message: error.message,
          impact: -100
        }],
        recommendation: 'REJECT',
        error: error.message
      };
    }
  }

  /**
   * Check if mint authority is revoked
   */
  async checkMintAuthority(tokenMint) {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);

      if (!mintInfo.value) {
        throw new Error('Mint account not found');
      }

      const mintAuthority = mintInfo.value.data.parsed.info.mintAuthority;

      return {
        hasAuthority: mintAuthority !== null,
        authority: mintAuthority,
        isRevoked: mintAuthority === null
      };

    } catch (error) {
      logger.error('Error checking mint authority:', error);
      return { hasAuthority: true, error: error.message };
    }
  }

  /**
   * Check if freeze authority is revoked
   */
  async checkFreezeAuthority(tokenMint) {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);

      if (!mintInfo.value) {
        throw new Error('Mint account not found');
      }

      const freezeAuthority = mintInfo.value.data.parsed.info.freezeAuthority;

      return {
        hasAuthority: freezeAuthority !== null,
        authority: freezeAuthority,
        isRevoked: freezeAuthority === null
      };

    } catch (error) {
      logger.error('Error checking freeze authority:', error);
      return { hasAuthority: true, error: error.message };
    }
  }

  /**
   * Analyze holder distribution to detect whale concentration
   */
  async analyzeHolderDistribution(tokenMint) {
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
        .map(acc => ({
          owner: acc.account.data.parsed.info.owner,
          balance: acc.account.data.parsed.info.tokenAmount.uiAmount
        }))
        .filter(h => h.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);
      const topHolderPercentage = holders.length > 0 ? holders[0].balance / totalSupply : 0;
      const top10Percentage = holders.slice(0, 10).reduce((sum, h) => sum + h.balance, 0) / totalSupply;

      return {
        totalHolders: holders.length,
        topHolderPercentage,
        top10Percentage,
        totalSupply,
        topHolders: holders.slice(0, 10)
      };

    } catch (error) {
      // Handle "too many accounts" error for popular tokens (e.g., USDC, USDT)
      if (error.message && error.message.includes('Too many accounts requested')) {
        logger.debug(`Token has too many holders to analyze (likely established token) - skipping holder analysis`);
        return {
          totalHolders: 999999, // Indicates very popular token
          topHolderPercentage: 0, // Assume well distributed
          top10Percentage: 0,
          totalSupply: 0,
          isPopularToken: true
        };
      }
      
      logger.error('Error analyzing holder distribution:', error);
      return {
        totalHolders: 0,
        topHolderPercentage: 1,
        error: error.message
      };
    }
  }

  /**
   * Check if liquidity is locked or burned
   */
  async checkLiquidityLock(tokenMint) {
    // This is complex and depends on the DEX
    // For Raydium, check if LP tokens are in a known lock contract or burned
    // For now, return a placeholder

    try {
      // TODO: Implement actual liquidity lock checking
      // Check common lock programs: Token Vesting, Bonfida, etc.

      return {
        isLocked: false,
        isBurned: false,
        lockDuration: 0,
        message: 'Liquidity lock check not fully implemented'
      };

    } catch (error) {
      logger.error('Error checking liquidity lock:', error);
      return {
        isLocked: false,
        isBurned: false,
        error: error.message
      };
    }
  }

  /**
   * Get token age in seconds
   */
  async getTokenAge(tokenMint) {
    try {
      const mintPubkey = new PublicKey(tokenMint);

      // Get signatures for this mint account
      const signatures = await this.connection.getSignaturesForAddress(
        mintPubkey,
        { limit: 1 }
      );

      if (signatures.length === 0) return 0;

      const firstSignature = signatures[signatures.length - 1];
      const tx = await this.connection.getTransaction(firstSignature.signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.blockTime) return 0;

      const creationTime = tx.blockTime;
      const currentTime = Math.floor(Date.now() / 1000);

      return currentTime - creationTime;

    } catch (error) {
      logger.error('Error getting token age:', error);
      return 0;
    }
  }

  /**
   * Get trading recommendation based on safety score
   */
  getRecommendation(safetyScore) {
    if (safetyScore >= 80) return 'SAFE';
    if (safetyScore >= 60) return 'MODERATE';
    if (safetyScore >= 40) return 'RISKY';
    return 'REJECT';
  }

  /**
   * Quick safety check (faster, less thorough)
   */
  async quickCheck(tokenMint) {
    const mintAuth = await this.checkMintAuthority(tokenMint);
    const freezeAuth = await this.checkFreezeAuthority(tokenMint);

    const isSafe = !mintAuth.hasAuthority && !freezeAuth.hasAuthority;

    return {
      isSafe,
      mintAuthorityRevoked: !mintAuth.hasAuthority,
      freezeAuthorityRevoked: !freezeAuth.hasAuthority
    };
  }
}
