import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

/**
 * Configuration Manager
 * Loads and manages bot configuration from environment and JSON files
 */

export class Config {
  constructor() {
    this.loadConfig();
  }

  /**
   * Load configuration from files and environment
   */
  loadConfig() {
    // Load default config
    const defaultConfigPath = path.join(__dirname, '../../config/default.json');
    const defaultConfig = this.loadJsonFile(defaultConfigPath) || {};

    // Load strategy config
    const strategyConfigPath = path.join(__dirname, '../../config/strategy.json');
    const strategyConfig = this.loadJsonFile(strategyConfigPath) || {};

    // Merge configurations
    this.config = {
      ...defaultConfig,
      ...strategyConfig,

      // Environment overrides
      solana: {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        rpcWs: process.env.SOLANA_RPC_WS || 'wss://api.mainnet-beta.solana.com',
        commitment: 'confirmed'
      },

      wallets: {
        privateKeys: this.loadPrivateKeys()
      },

      api: {
        twitter: process.env.TWITTER_BEARER_TOKEN || null,
        telegram: process.env.TELEGRAM_BOT_TOKEN || null
      },

      risk: {
        maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_SOL) || defaultConfig.risk?.maxPositionSize || 0.1,
        maxTotalExposure: parseFloat(process.env.MAX_TOTAL_EXPOSURE_SOL) || defaultConfig.risk?.maxTotalExposure || 1.0,
        defaultSlippage: parseInt(process.env.DEFAULT_SLIPPAGE_BPS) || defaultConfig.risk?.defaultSlippage || 300
      },

      paperTrading: {
        enabled: process.env.PAPER_TRADING_ENABLED === 'true',
        startingBalance: parseFloat(process.env.PAPER_TRADING_STARTING_BALANCE) || 10,
        reportInterval: parseInt(process.env.PAPER_TRADING_REPORT_INTERVAL) || 300000
      },

      entry: {
        minSafetyScore: parseInt(process.env.MIN_SAFETY_SCORE) || 60,
        minHolderHealth: parseInt(process.env.MIN_HOLDER_HEALTH) || 60,
        minHolders: parseInt(process.env.MIN_HOLDERS) || 50,
        maxWalletConcentration: parseInt(process.env.MAX_WALLET_CONCENTRATION) || 15
      },

      dryRun: process.env.DRY_RUN_MODE === 'true',

      logging: {
        level: process.env.LOG_LEVEL || 'info'
      }
    };
  }

  /**
   * Load JSON file
   */
  loadJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);

    } catch (error) {
      console.error(`Error loading config file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Load wallet private keys from environment
   */
  loadPrivateKeys() {
    const keysString = process.env.WALLET_PRIVATE_KEYS;

    if (!keysString) {
      console.warn('⚠️ No wallet private keys found in environment');
      return [];
    }

    // Split by comma and trim
    const keys = keysString.split(',').map(k => k.trim());

    console.log(`Loaded ${keys.length} wallet private key(s)`);

    return keys;
  }

  /**
   * Get full config
   */
  getConfig() {
    return this.config;
  }

  /**
   * Get specific config section
   */
  get(section) {
    return this.config[section];
  }

  /**
   * Get nested config value
   */
  getValue(path) {
    const parts = path.split('.');
    let value = this.config;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set config value
   */
  setValue(path, value) {
    const parts = path.split('.');
    let obj = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in obj)) {
        obj[part] = {};
      }
      obj = obj[part];
    }

    obj[parts[parts.length - 1]] = value;
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];

    // Check required fields
    if (!this.config.solana?.rpcUrl) {
      errors.push('Solana RPC URL is required');
    }

    if (!this.config.wallets?.privateKeys || this.config.wallets.privateKeys.length === 0) {
      errors.push('At least one wallet private key is required');
    }

    if (!this.config.risk) {
      errors.push('Risk configuration is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export config to file
   */
  export(filePath) {
    try {
      // Don't export sensitive data
      const exportConfig = {
        ...this.config,
        wallets: undefined,
        api: undefined
      };

      fs.writeFileSync(
        filePath,
        JSON.stringify(exportConfig, null, 2),
        'utf8'
      );

      return true;

    } catch (error) {
      console.error('Error exporting config:', error);
      return false;
    }
  }
}

export default new Config();
