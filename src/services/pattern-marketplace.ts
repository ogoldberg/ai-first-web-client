/**
 * Pattern Marketplace Service (FEAT-005)
 *
 * Community-driven pattern sharing, discovery, and installation.
 * Enables collective learning by allowing users to publish and consume
 * learned patterns from other users.
 */

import { randomUUID } from 'crypto';
import type {
  PublishedPattern,
  PublishPatternRequest,
  UpdatePatternRequest,
  PatternRating,
  RatePatternRequest,
  PatternInstallation,
  PatternSearchFilters,
  PatternSearchResult,
  PatternReport,
  PatternStats,
  MarketplaceAnalytics,
  PatternCollection,
  ModerationStatus,
  PatternCategory,
  PatternType,
} from '../types/pattern-marketplace.js';

/**
 * Marketplace service for managing pattern publishing, discovery, and installation
 */
export class PatternMarketplaceService {
  private patterns: Map<string, PublishedPattern> = new Map();
  private ratings: Map<string, PatternRating[]> = new Map();
  private installations: Map<string, PatternInstallation[]> = new Map();
  private reports: Map<string, PatternReport[]> = new Map();
  private collections: Map<string, PatternCollection> = new Map();

  // Stats tracking
  private installsByDay: Map<string, Map<string, number>> = new Map(); // patternId -> date -> count
  private usageByDay: Map<string, Map<string, number>> = new Map(); // patternId -> date -> count

  /**
   * Publish a new pattern to the marketplace
   */
  async publishPattern(request: PublishPatternRequest): Promise<PublishedPattern> {
    // Validate request
    this.validatePublishRequest(request);

    // Check if updating existing pattern
    if (request.updateExisting) {
      const existing = this.patterns.get(request.updateExisting);
      if (!existing) {
        throw new Error(`Pattern ${request.updateExisting} not found`);
      }
      if (existing.authorId !== request.tenantId) {
        throw new Error('Only the author can update a pattern');
      }

      // Create new version
      return this.createNewVersion(existing, request);
    }

    // Create new pattern
    const pattern: PublishedPattern = {
      id: randomUUID(),
      patternType: request.patternType,
      patternData: request.patternData,
      name: request.name,
      description: request.description,
      category: request.category,
      tags: request.tags,
      authorId: request.tenantId,
      domain: request.domain,
      targetSite: request.targetSite,
      exampleUrl: request.exampleUrl,
      version: request.version || '1.0.0',
      changelog: request.changelog,
      installCount: 0,
      ratingCount: 0,
      moderationStatus: 'pending',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: request.tenantId,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      requiresAuth: request.patternData.requiresAuth || false,
    };

    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Create a new version of an existing pattern
   */
  private createNewVersion(existing: PublishedPattern, request: PublishPatternRequest): PublishedPattern {
    const newVersion: PublishedPattern = {
      ...existing,
      id: randomUUID(),
      version: request.version || this.incrementVersion(existing.version),
      changelog: request.changelog,
      patternData: request.patternData,
      name: request.name || existing.name,
      description: request.description || existing.description,
      category: request.category || existing.category,
      tags: request.tags || existing.tags,
      targetSite: request.targetSite || existing.targetSite,
      exampleUrl: request.exampleUrl || existing.exampleUrl,
      previousVersionId: existing.id,
      installCount: 0, // Reset for new version
      ratingCount: 0,
      moderationStatus: 'pending',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.patterns.set(newVersion.id, newVersion);
    return newVersion;
  }

  /**
   * Update a published pattern (metadata only)
   */
  async updatePattern(patternId: string, authorId: string, update: UpdatePatternRequest): Promise<PublishedPattern> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }
    if (pattern.authorId !== authorId) {
      throw new Error('Only the author can update a pattern');
    }

    const updated: PublishedPattern = {
      ...pattern,
      name: update.name || pattern.name,
      description: update.description || pattern.description,
      category: update.category || pattern.category,
      tags: update.tags || pattern.tags,
      targetSite: update.targetSite || pattern.targetSite,
      exampleUrl: update.exampleUrl || pattern.exampleUrl,
      version: update.version || pattern.version,
      changelog: update.changelog || pattern.changelog,
      patternData: update.patternData || pattern.patternData,
      updatedAt: Date.now(),
    };

    this.patterns.set(patternId, updated);
    return updated;
  }

  /**
   * Delete a pattern (only by author or admin)
   */
  async deletePattern(patternId: string, userId: string, isAdmin: boolean = false): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }
    if (!isAdmin && pattern.authorId !== userId) {
      throw new Error('Only the author or an admin can delete a pattern');
    }

    this.patterns.delete(patternId);
    this.ratings.delete(patternId);
    this.reports.delete(patternId);

    // Delete installations for this pattern
    for (const [userId, installations] of this.installations.entries()) {
      const filtered = installations.filter(i => i.patternId !== patternId);
      if (filtered.length === 0) {
        this.installations.delete(userId);
      } else {
        this.installations.set(userId, filtered);
      }
    }
  }

  /**
   * Get a pattern by ID
   */
  getPattern(patternId: string): PublishedPattern | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * Search patterns with filters
   */
  searchPatterns(filters: PatternSearchFilters): PatternSearchResult {
    let results = Array.from(this.patterns.values());

    // Apply filters
    if (filters.query) {
      const query = filters.query.toLowerCase();
      results = results.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (filters.category) {
      results = results.filter(p => p.category === filters.category);
    }

    if (filters.patternType) {
      results = results.filter(p => p.patternType === filters.patternType);
    }

    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(p =>
        filters.tags!.some(tag => p.tags.includes(tag))
      );
    }

    if (filters.domain) {
      results = results.filter(p => p.domain === filters.domain);
    }

    if (filters.authorId) {
      results = results.filter(p => p.authorId === filters.authorId);
    }

    if (filters.minRating !== undefined) {
      results = results.filter(p => (p.avgRating || 0) >= filters.minRating!);
    }

    if (filters.minInstalls !== undefined) {
      results = results.filter(p => p.installCount >= filters.minInstalls!);
    }

    if (filters.verified) {
      results = results.filter(p => p.moderationStatus === 'approved');
    }

    if (filters.featured) {
      results = results.filter(p => p.isFeatured === true);
    }

    if (filters.official) {
      results = results.filter(p => p.isOfficial === true);
    }

    // Only show approved patterns (unless admin)
    results = results.filter(p => p.moderationStatus === 'approved');

    // Sort results
    const sortBy = filters.sortBy || 'relevance';
    const sortOrder = filters.sortOrder || 'desc';

    results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'rating':
          comparison = (b.avgRating || 0) - (a.avgRating || 0);
          break;
        case 'installs':
          comparison = b.installCount - a.installCount;
          break;
        case 'newest':
          comparison = b.publishedAt - a.publishedAt;
          break;
        case 'updated':
          comparison = b.updatedAt - a.updatedAt;
          break;
        case 'relevance':
        default:
          // Score by combination of rating, installs, and recency
          const scoreA = (a.avgRating || 0) * 0.4 + Math.log(a.installCount + 1) * 0.3 + (Date.now() - a.publishedAt) / 1000000000 * 0.3;
          const scoreB = (b.avgRating || 0) * 0.4 + Math.log(b.installCount + 1) * 0.3 + (Date.now() - b.publishedAt) / 1000000000 * 0.3;
          comparison = scoreB - scoreA;
          break;
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const total = results.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const patterns = results.slice(start, end);

    return {
      patterns,
      total,
      page,
      limit,
      hasMore: end < total,
    };
  }

  /**
   * Rate a pattern
   */
  async ratePattern(patternId: string, userId: string, request: RatePatternRequest): Promise<PatternRating> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    // Check if user already rated this pattern
    const existingRatings = this.ratings.get(patternId) || [];
    const existingRating = existingRatings.find(r => r.userId === userId);

    if (existingRating) {
      // Update existing rating
      existingRating.rating = request.rating;
      existingRating.review = request.review;
      existingRating.title = request.title;
      existingRating.verified = request.verified;
      existingRating.updatedAt = Date.now();

      this.recalculateRating(patternId);
      return existingRating;
    }

    // Create new rating
    const rating: PatternRating = {
      id: randomUUID(),
      patternId,
      userId,
      rating: request.rating,
      review: request.review,
      title: request.title,
      helpful: 0,
      notHelpful: 0,
      verified: request.verified,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    existingRatings.push(rating);
    this.ratings.set(patternId, existingRatings);

    this.recalculateRating(patternId);
    return rating;
  }

  /**
   * Recalculate average rating for a pattern
   */
  private recalculateRating(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    const ratings = this.ratings.get(patternId) || [];
    if (ratings.length === 0) {
      pattern.avgRating = undefined;
      pattern.ratingCount = 0;
      return;
    }

    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    pattern.avgRating = sum / ratings.length;
    pattern.ratingCount = ratings.length;
  }

  /**
   * Get ratings for a pattern
   */
  getPatternRatings(patternId: string): PatternRating[] {
    return this.ratings.get(patternId) || [];
  }

  /**
   * Install a pattern for a user
   */
  async installPattern(patternId: string, userId: string): Promise<PatternInstallation> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    // Check if already installed
    const userInstallations = this.installations.get(userId) || [];
    const existing = userInstallations.find(i => i.patternId === patternId);

    if (existing) {
      return existing;
    }

    // Create installation
    const installation: PatternInstallation = {
      id: randomUUID(),
      patternId,
      userId,
      installedAt: Date.now(),
      usageCount: 0,
      successCount: 0,
      failureCount: 0,
      installedVersion: pattern.version,
      autoUpdate: true,
    };

    userInstallations.push(installation);
    this.installations.set(userId, userInstallations);

    // Increment install count
    pattern.installCount++;

    // Track install by day
    this.trackInstallByDay(patternId);

    return installation;
  }

  /**
   * Uninstall a pattern for a user
   */
  async uninstallPattern(patternId: string, userId: string): Promise<void> {
    const userInstallations = this.installations.get(userId) || [];
    const filtered = userInstallations.filter(i => i.patternId !== patternId);

    if (filtered.length === userInstallations.length) {
      throw new Error(`Pattern ${patternId} not installed for user ${userId}`);
    }

    if (filtered.length === 0) {
      this.installations.delete(userId);
    } else {
      this.installations.set(userId, filtered);
    }

    // Decrement install count
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.installCount = Math.max(0, pattern.installCount - 1);
    }
  }

  /**
   * Get user's installed patterns
   */
  getUserInstallations(userId: string): PatternInstallation[] {
    return this.installations.get(userId) || [];
  }

  /**
   * Record pattern usage
   */
  async recordUsage(patternId: string, userId: string, success: boolean): Promise<void> {
    const userInstallations = this.installations.get(userId) || [];
    const installation = userInstallations.find(i => i.patternId === patternId);

    if (installation) {
      installation.usageCount++;
      installation.lastUsedAt = Date.now();
      if (success) {
        installation.successCount++;
      } else {
        installation.failureCount++;
      }
    }

    // Update pattern execution stats
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.totalExecutions = (pattern.totalExecutions || 0) + 1;
      if (success) {
        pattern.successfulExecutions = (pattern.successfulExecutions || 0) + 1;
      } else {
        pattern.failedExecutions = (pattern.failedExecutions || 0) + 1;
      }

      // Calculate success rate
      pattern.successRate = (pattern.successfulExecutions || 0) / (pattern.totalExecutions || 1);
    }

    // Track usage by day
    this.trackUsageByDay(patternId);
  }

  /**
   * Report a pattern
   */
  async reportPattern(
    patternId: string,
    userId: string,
    reason: 'spam' | 'broken' | 'inappropriate' | 'duplicate' | 'malicious' | 'other',
    details?: string
  ): Promise<PatternReport> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const report: PatternReport = {
      id: randomUUID(),
      patternId,
      reportedBy: userId,
      reason,
      details,
      reportedAt: Date.now(),
      status: 'pending',
    };

    const reports = this.reports.get(patternId) || [];
    reports.push(report);
    this.reports.set(patternId, reports);

    // Auto-flag if multiple reports
    if (reports.length >= 3 && pattern.moderationStatus !== 'flagged') {
      pattern.moderationStatus = 'flagged';
    }

    return report;
  }

  /**
   * Moderate a pattern (admin only)
   */
  async moderatePattern(
    patternId: string,
    moderatorId: string,
    status: ModerationStatus,
    notes?: string
  ): Promise<PublishedPattern> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    pattern.moderationStatus = status;
    pattern.moderatedAt = Date.now();
    pattern.moderatedBy = moderatorId;
    pattern.moderationNotes = notes;
    pattern.updatedAt = Date.now();

    return pattern;
  }

  /**
   * Get pattern statistics (for authors)
   */
  getPatternStats(patternId: string): PatternStats | undefined {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return undefined;

    const ratings = this.ratings.get(patternId) || [];
    const installsByDay = this.installsByDay.get(patternId) || new Map();
    const usageByDay = this.usageByDay.get(patternId) || new Map();

    // Calculate install windows
    const now = Date.now();
    const day7Ago = now - 7 * 24 * 60 * 60 * 1000;
    const day30Ago = now - 30 * 24 * 60 * 60 * 1000;

    let installsLast7Days = 0;
    let installsLast30Days = 0;

    for (const [date, count] of installsByDay.entries()) {
      const timestamp = new Date(date).getTime();
      if (timestamp >= day7Ago) {
        installsLast7Days += count;
      }
      if (timestamp >= day30Ago) {
        installsLast30Days += count;
      }
    }

    // Rating distribution
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const rating of ratings) {
      ratingDistribution[rating.rating]++;
    }

    const stats: PatternStats = {
      patternId,
      totalInstalls: pattern.installCount,
      installsLast7Days,
      installsLast30Days,
      totalUsage: pattern.totalExecutions || 0,
      successfulUsage: pattern.successfulExecutions || 0,
      failedUsage: pattern.failedExecutions || 0,
      successRate: pattern.successRate || 0,
      avgRating: pattern.avgRating || 0,
      ratingDistribution,
      totalReviews: ratings.filter(r => r.review).length,
      totalReports: (this.reports.get(patternId) || []).length,
      installsByDay: Array.from(installsByDay.entries()).map(([date, count]) => ({ date, count })),
      usageByDay: Array.from(usageByDay.entries()).map(([date, count]) => ({ date, count })),
    };

    return stats;
  }

  /**
   * Get marketplace analytics (admin only)
   */
  getMarketplaceAnalytics(): MarketplaceAnalytics {
    const patterns = Array.from(this.patterns.values());
    const now = Date.now();
    const day7Ago = now - 7 * 24 * 60 * 60 * 1000;
    const day30Ago = now - 30 * 24 * 60 * 60 * 1000;

    // Pattern stats
    const patternsByCategory: Record<PatternCategory, number> = {} as any;
    const patternsByType: Record<PatternType, number> = {} as any;

    for (const pattern of patterns) {
      patternsByCategory[pattern.category] = (patternsByCategory[pattern.category] || 0) + 1;
      patternsByType[pattern.patternType] = (patternsByType[pattern.patternType] || 0) + 1;
    }

    const pendingModeration = patterns.filter(p => p.moderationStatus === 'pending').length;
    const featuredPatterns = patterns.filter(p => p.isFeatured).length;
    const officialPatterns = patterns.filter(p => p.isOfficial).length;

    // Growth stats
    const newPatternsLast7Days = patterns.filter(p => p.publishedAt >= day7Ago).length;
    const newPatternsLast30Days = patterns.filter(p => p.publishedAt >= day30Ago).length;

    const uniqueAuthors = new Set(patterns.map(p => p.authorId));
    const newAuthorsLast7Days = new Set(patterns.filter(p => p.publishedAt >= day7Ago).map(p => p.authorId)).size;
    const newAuthorsLast30Days = new Set(patterns.filter(p => p.publishedAt >= day30Ago).map(p => p.authorId)).size;

    // Engagement stats
    const totalInstalls = patterns.reduce((sum, p) => sum + p.installCount, 0);
    const totalRatings = patterns.reduce((sum, p) => sum + p.ratingCount, 0);
    const avgRating = totalRatings > 0
      ? patterns.reduce((sum, p) => sum + (p.avgRating || 0) * p.ratingCount, 0) / totalRatings
      : 0;

    // Top patterns
    const topPatterns = patterns
      .filter(p => p.moderationStatus === 'approved')
      .sort((a, b) => b.installCount - a.installCount)
      .slice(0, 10);

    // Top authors
    const authorStats = new Map<string, { patternCount: number; authorName?: string }>();
    for (const pattern of patterns) {
      const stats = authorStats.get(pattern.authorId) || { patternCount: 0, authorName: pattern.authorName };
      stats.patternCount++;
      authorStats.set(pattern.authorId, stats);
    }

    const topAuthors = Array.from(authorStats.entries())
      .map(([authorId, stats]) => ({ authorId, ...stats }))
      .sort((a, b) => b.patternCount - a.patternCount)
      .slice(0, 10);

    return {
      totalPatterns: patterns.length,
      patternsByCategory,
      patternsByType,
      pendingModeration,
      totalAuthors: uniqueAuthors.size,
      totalInstalls,
      totalRatings,
      avgRating,
      newPatternsLast7Days,
      newPatternsLast30Days,
      newAuthorsLast7Days,
      newAuthorsLast30Days,
      featuredPatterns,
      officialPatterns,
      topPatterns,
      topAuthors,
    };
  }

  /**
   * Track install by day
   */
  private trackInstallByDay(patternId: string): void {
    const today = new Date().toISOString().split('T')[0];
    const byDay = this.installsByDay.get(patternId) || new Map();
    byDay.set(today, (byDay.get(today) || 0) + 1);
    this.installsByDay.set(patternId, byDay);
  }

  /**
   * Track usage by day
   */
  private trackUsageByDay(patternId: string): void {
    const today = new Date().toISOString().split('T')[0];
    const byDay = this.usageByDay.get(patternId) || new Map();
    byDay.set(today, (byDay.get(today) || 0) + 1);
    this.usageByDay.set(patternId, byDay);
  }

  /**
   * Validate publish request
   */
  private validatePublishRequest(request: PublishPatternRequest): void {
    if (!request.name || request.name.length < 3) {
      throw new Error('Pattern name must be at least 3 characters');
    }
    if (!request.description || request.description.length < 10) {
      throw new Error('Pattern description must be at least 10 characters');
    }
    if (!request.domain) {
      throw new Error('Domain is required');
    }
    if (!request.patternData) {
      throw new Error('Pattern data is required');
    }
    if (request.tags.length === 0) {
      throw new Error('At least one tag is required');
    }
  }

  /**
   * Increment semantic version
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3) return '1.0.0';

    // Increment patch version
    parts[2]++;
    return parts.join('.');
  }

  /**
   * Get all patterns (admin only)
   */
  getAllPatterns(): PublishedPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get all reports (admin only)
   */
  getAllReports(): PatternReport[] {
    return Array.from(this.reports.values()).flat();
  }

  /**
   * Clear all data (testing only)
   */
  clear(): void {
    this.patterns.clear();
    this.ratings.clear();
    this.installations.clear();
    this.reports.clear();
    this.collections.clear();
    this.installsByDay.clear();
    this.usageByDay.clear();
  }
}

// Singleton instance
let marketplaceService: PatternMarketplaceService | undefined;

/**
 * Get singleton marketplace service instance
 */
export function getMarketplaceService(): PatternMarketplaceService {
  if (!marketplaceService) {
    marketplaceService = new PatternMarketplaceService();
  }
  return marketplaceService;
}

/**
 * Reset marketplace service (testing only)
 */
export function resetMarketplaceService(): void {
  marketplaceService = undefined;
}
