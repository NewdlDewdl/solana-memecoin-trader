import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Simple JSON file-based database for storing trade history and analytics
 * For production, consider using a proper database (PostgreSQL, MongoDB, etc.)
 */

export class Database {
  constructor(dataDir = path.join(__dirname, '../../data')) {
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  /**
   * Ensure data directory exists
   */
  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger.info(`Created data directory: ${this.dataDir}`);
    }
  }

  /**
   * Get file path for a collection
   */
  getFilePath(collection) {
    return path.join(this.dataDir, `${collection}.json`);
  }

  /**
   * Read data from collection
   */
  read(collection) {
    try {
      const filePath = this.getFilePath(collection);

      if (!fs.existsSync(filePath)) {
        return [];
      }

      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);

    } catch (error) {
      logger.error(`Error reading ${collection}:`, error);
      return [];
    }
  }

  /**
   * Write data to collection
   */
  write(collection, data) {
    try {
      const filePath = this.getFilePath(collection);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;

    } catch (error) {
      logger.error(`Error writing ${collection}:`, error);
      return false;
    }
  }

  /**
   * Insert record into collection
   */
  insert(collection, record) {
    const data = this.read(collection);
    data.push({
      ...record,
      _id: this.generateId(),
      _createdAt: Date.now()
    });
    return this.write(collection, data);
  }

  /**
   * Find records in collection
   */
  find(collection, query = {}) {
    const data = this.read(collection);

    if (Object.keys(query).length === 0) {
      return data;
    }

    return data.filter(record => {
      return Object.keys(query).every(key => {
        return record[key] === query[key];
      });
    });
  }

  /**
   * Find one record
   */
  findOne(collection, query) {
    const results = this.find(collection, query);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Update records
   */
  update(collection, query, updates) {
    const data = this.read(collection);
    let updated = 0;

    const newData = data.map(record => {
      const matches = Object.keys(query).every(key => {
        return record[key] === query[key];
      });

      if (matches) {
        updated++;
        return {
          ...record,
          ...updates,
          _updatedAt: Date.now()
        };
      }

      return record;
    });

    this.write(collection, newData);
    return updated;
  }

  /**
   * Delete records
   */
  delete(collection, query) {
    const data = this.read(collection);

    const newData = data.filter(record => {
      return !Object.keys(query).every(key => {
        return record[key] === query[key];
      });
    });

    const deleted = data.length - newData.length;
    this.write(collection, newData);

    return deleted;
  }

  /**
   * Get all collections
   */
  getCollections() {
    const files = fs.readdirSync(this.dataDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  /**
   * Export collection to CSV
   */
  exportToCsv(collection, outputPath) {
    const data = this.read(collection);

    if (data.length === 0) {
      logger.warn(`No data in ${collection} to export`);
      return false;
    }

    // Get all unique keys
    const keys = [...new Set(data.flatMap(Object.keys))];

    // Create CSV header
    const header = keys.join(',');

    // Create CSV rows
    const rows = data.map(record => {
      return keys.map(key => {
        const value = record[key];
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return value || '';
      }).join(',');
    });

    const csv = [header, ...rows].join('\n');

    fs.writeFileSync(outputPath, csv, 'utf8');
    logger.info(`Exported ${data.length} records to ${outputPath}`);

    return true;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get database statistics
   */
  getStats() {
    const collections = this.getCollections();

    const stats = {};

    for (const collection of collections) {
      const data = this.read(collection);
      stats[collection] = {
        count: data.length,
        size: this.getCollectionSize(collection)
      };
    }

    return stats;
  }

  /**
   * Get collection file size
   */
  getCollectionSize(collection) {
    try {
      const filePath = this.getFilePath(collection);
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clear collection
   */
  clear(collection) {
    return this.write(collection, []);
  }
}

export default new Database();
