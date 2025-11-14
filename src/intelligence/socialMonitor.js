import { TwitterApi } from 'twitter-api-v2';
import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger.js';

/**
 * Social Sentiment Monitoring Module
 * Tracks Twitter, Telegram, and other social platforms for token mentions
 */

export class SocialMonitor {
  constructor(config) {
    this.config = config;
    this.twitterClient = null;
    this.telegramBot = null;
    this.mentionCache = new Map();

    this.initialize();
  }

  /**
   * Initialize social media clients
   */
  initialize() {
    // Initialize Twitter client if token provided
    if (process.env.TWITTER_BEARER_TOKEN) {
      try {
        this.twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
        logger.info('Twitter client initialized');
      } catch (error) {
        logger.warn('Failed to initialize Twitter client:', error.message);
      }
    }

    // Initialize Telegram bot if token provided
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        this.telegramBot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
        logger.info('Telegram bot initialized');
      } catch (error) {
        logger.warn('Failed to initialize Telegram bot:', error.message);
      }
    }
  }

  /**
   * Analyze social sentiment for a token
   */
  async analyzeSentiment(tokenSymbol, tokenMint) {
    logger.info(`Analyzing social sentiment for ${tokenSymbol}...`);

    const results = {
      tokenSymbol,
      tokenMint,
      twitter: await this.analyzeTwitter(tokenSymbol, tokenMint),
      telegram: await this.analyzeTelegram(tokenSymbol),
      overallScore: 0,
      recommendation: 'NEUTRAL',
      analyzedAt: Date.now()
    };

    // Calculate overall sentiment score (0-100)
    results.overallScore = this.calculateOverallScore(results);
    results.recommendation = this.getRecommendation(results.overallScore);

    return results;
  }

  /**
   * Analyze Twitter mentions and sentiment
   */
  async analyzeTwitter(tokenSymbol, tokenMint) {
    if (!this.twitterClient) {
      return {
        available: false,
        message: 'Twitter API not configured'
      };
    }

    try {
      // Search for recent tweets mentioning the token
      const searchQuery = `${tokenSymbol} OR ${tokenMint} -is:retweet lang:en`;

      const tweets = await this.twitterClient.v2.search(searchQuery, {
        max_results: 100,
        'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
        'user.fields': ['username', 'public_metrics']
      });

      const tweetData = tweets.data?.data || [];

      // Analyze metrics
      const totalTweets = tweetData.length;
      const totalEngagement = tweetData.reduce((sum, tweet) => {
        const metrics = tweet.public_metrics || {};
        return sum + (metrics.like_count || 0) + (metrics.retweet_count || 0) + (metrics.reply_count || 0);
      }, 0);

      // Simple sentiment analysis based on keywords
      const positiveTweets = tweetData.filter(t =>
        this.hasPositiveKeywords(t.text)
      ).length;

      const negativeTweets = tweetData.filter(t =>
        this.hasNegativeKeywords(t.text)
      ).length;

      const sentimentRatio = totalTweets > 0
        ? (positiveTweets - negativeTweets) / totalTweets
        : 0;

      // Check for influencer mentions
      const influencerMentions = tweetData.filter(t => {
        const authorMetrics = t.author?.public_metrics || {};
        return (authorMetrics.followers_count || 0) > 10000;
      }).length;

      return {
        available: true,
        totalMentions: totalTweets,
        totalEngagement,
        averageEngagement: totalTweets > 0 ? totalEngagement / totalTweets : 0,
        positiveTweets,
        negativeTweets,
        sentimentRatio,
        influencerMentions,
        score: this.calculateTwitterScore({
          totalTweets,
          totalEngagement,
          sentimentRatio,
          influencerMentions
        })
      };

    } catch (error) {
      logger.error('Error analyzing Twitter:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze Telegram group activity
   */
  async analyzeTelegram(tokenSymbol) {
    // Telegram analysis is more complex and requires group monitoring
    // This is a placeholder for future implementation

    return {
      available: false,
      message: 'Telegram analysis not fully implemented',
      groupMembers: 0,
      recentMessages: 0,
      score: 0
    };
  }

  /**
   * Check for positive sentiment keywords
   */
  hasPositiveKeywords(text) {
    const positiveKeywords = [
      'moon', 'bullish', 'buy', 'gem', 'pump',
      'ath', 'breakout', 'up', 'gain', 'profit',
      '🚀', '💎', '🔥', '📈', '💰'
    ];

    const lowerText = text.toLowerCase();
    return positiveKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Check for negative sentiment keywords
   */
  hasNegativeKeywords(text) {
    const negativeKeywords = [
      'rug', 'scam', 'dump', 'sell', 'bearish',
      'warning', 'avoid', 'fake', 'fraud', 'crash',
      '⚠️', '🚨', '📉'
    ];

    const lowerText = text.toLowerCase();
    return negativeKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Calculate Twitter engagement score (0-100)
   */
  calculateTwitterScore(metrics) {
    let score = 0;

    // Volume score (max 40 points)
    if (metrics.totalTweets > 100) score += 40;
    else if (metrics.totalTweets > 50) score += 30;
    else if (metrics.totalTweets > 20) score += 20;
    else if (metrics.totalTweets > 10) score += 10;

    // Engagement score (max 30 points)
    if (metrics.totalEngagement > 1000) score += 30;
    else if (metrics.totalEngagement > 500) score += 20;
    else if (metrics.totalEngagement > 100) score += 10;

    // Sentiment score (max 20 points)
    if (metrics.sentimentRatio > 0.5) score += 20;
    else if (metrics.sentimentRatio > 0.2) score += 10;
    else if (metrics.sentimentRatio < -0.2) score -= 10;

    // Influencer score (max 10 points)
    if (metrics.influencerMentions > 5) score += 10;
    else if (metrics.influencerMentions > 2) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate overall social score
   */
  calculateOverallScore(results) {
    const scores = [];

    if (results.twitter.available) {
      scores.push(results.twitter.score);
    }

    if (results.telegram.available) {
      scores.push(results.telegram.score);
    }

    if (scores.length === 0) return 50; // Neutral if no data

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Get recommendation based on social score
   */
  getRecommendation(score) {
    if (score >= 70) return 'STRONG_BUY';
    if (score >= 50) return 'BUY';
    if (score >= 30) return 'NEUTRAL';
    return 'AVOID';
  }

  /**
   * Monitor token mentions in real-time
   */
  async startMonitoring(tokenSymbol, callback) {
    if (!this.twitterClient) {
      logger.warn('Cannot start monitoring: Twitter client not available');
      return;
    }

    try {
      // Set up Twitter stream for real-time mentions
      const stream = await this.twitterClient.v2.searchStream({
        'tweet.fields': ['created_at', 'public_metrics'],
        expansions: ['author_id']
      });

      // Add rule for this token
      await this.twitterClient.v2.updateStreamRules({
        add: [{ value: tokenSymbol, tag: tokenSymbol }]
      });

      logger.info(`Started monitoring Twitter for ${tokenSymbol}`);

      stream.on('data', (tweet) => {
        logger.debug(`New mention: ${tweet.data.text}`);
        callback && callback({
          platform: 'twitter',
          tokenSymbol,
          tweet: tweet.data
        });
      });

      stream.on('error', (error) => {
        logger.error('Twitter stream error:', error);
      });

      return stream;

    } catch (error) {
      logger.error('Error starting Twitter monitoring:', error);
      return null;
    }
  }

  /**
   * Get cached sentiment data
   */
  getCachedSentiment(tokenMint, maxAgeMs = 300000) { // 5 minutes default
    const cached = this.mentionCache.get(tokenMint);

    if (!cached) return null;

    const age = Date.now() - cached.analyzedAt;
    if (age > maxAgeMs) return null;

    return cached;
  }

  /**
   * Cache sentiment data
   */
  cacheSentiment(tokenMint, data) {
    this.mentionCache.set(tokenMint, data);

    // Clean old cache entries
    setTimeout(() => {
      this.mentionCache.delete(tokenMint);
    }, 600000); // Remove after 10 minutes
  }
}
