/**
 * Pattern Marketplace Service Tests (FEAT-005)
 *
 * Tests for community pattern sharing, discovery, and installation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PatternMarketplaceService,
  resetMarketplaceService,
} from '../../src/services/pattern-marketplace.js';
import type {
  PublishPatternRequest,
  RatePatternRequest,
} from '../../src/types/pattern-marketplace.js';

describe('FEAT-005: Pattern Marketplace', () => {
  let service: PatternMarketplaceService;

  beforeEach(() => {
    resetMarketplaceService();
    service = new PatternMarketplaceService();
  });

  describe('Pattern Publishing', () => {
    it('should publish a new pattern', async () => {
      const request: PublishPatternRequest = {
        patternType: 'api',
        patternData: { endpoint: '/api/users', method: 'GET' },
        name: 'User List API',
        description: 'Fetch list of users from the API',
        category: 'ecommerce',
        tags: ['api', 'users', 'rest'],
        domain: 'example.com',
        targetSite: 'Example Store',
        exampleUrl: 'https://example.com/api/users',
        tenantId: 'tenant-123',
      };

      const pattern = await service.publishPattern(request);

      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBe('User List API');
      expect(pattern.patternType).toBe('api');
      expect(pattern.authorId).toBe('tenant-123');
      expect(pattern.version).toBe('1.0.0');
      expect(pattern.moderationStatus).toBe('pending');
      expect(pattern.installCount).toBe(0);
    });

    it('should validate pattern name length', async () => {
      const request: PublishPatternRequest = {
        patternType: 'api',
        patternData: {},
        name: 'AB', // Too short
        description: 'This is a valid description that is long enough',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'tenant-123',
      };

      await expect(service.publishPattern(request)).rejects.toThrow('at least 3 characters');
    });

    it('should validate description length', async () => {
      const request: PublishPatternRequest = {
        patternType: 'api',
        patternData: {},
        name: 'Valid Name',
        description: 'Too short', // Too short
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'tenant-123',
      };

      await expect(service.publishPattern(request)).rejects.toThrow('at least 10 characters');
    });

    it('should require at least one tag', async () => {
      const request: PublishPatternRequest = {
        patternType: 'api',
        patternData: {},
        name: 'Valid Name',
        description: 'This is a valid description that is long enough',
        category: 'ecommerce',
        tags: [], // Empty tags
        domain: 'example.com',
        tenantId: 'tenant-123',
      };

      await expect(service.publishPattern(request)).rejects.toThrow('At least one tag is required');
    });

    it('should create a new version when updating', async () => {
      // Publish original
      const original = await service.publishPattern({
        patternType: 'api',
        patternData: { v: 1 },
        name: 'Test Pattern',
        description: 'Original description for the pattern',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'tenant-123',
      });

      // Update with new version
      const updated = await service.publishPattern({
        patternType: 'api',
        patternData: { v: 2 },
        name: 'Test Pattern v2',
        description: 'Updated description for version 2',
        category: 'ecommerce',
        tags: ['test', 'v2'],
        domain: 'example.com',
        updateExisting: original.id,
        version: '2.0.0',
        changelog: 'Major update with new features',
        tenantId: 'tenant-123',
      });

      expect(updated.id).not.toBe(original.id);
      expect(updated.version).toBe('2.0.0');
      expect(updated.previousVersionId).toBe(original.id);
      expect(updated.changelog).toBe('Major update with new features');
      expect(updated.moderationStatus).toBe('pending');
    });

    it('should auto-increment version if not provided', async () => {
      const original = await service.publishPattern({
        patternType: 'api',
        patternData: { v: 1 },
        name: 'Test Pattern',
        description: 'Original description for the pattern',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'tenant-123',
      });

      const updated = await service.publishPattern({
        patternType: 'api',
        patternData: { v: 2 },
        name: 'Test Pattern',
        description: 'Original description for the pattern',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        updateExisting: original.id,
        tenantId: 'tenant-123',
      });

      expect(updated.version).toBe('1.0.1'); // Patch version incremented
    });

    it('should only allow author to update', async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Test Pattern',
        description: 'Original description for the pattern',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'tenant-123',
      });

      await expect(
        service.publishPattern({
          patternType: 'api',
          patternData: {},
          name: 'Hacked',
          description: 'Original description for the pattern',
          category: 'ecommerce',
          tags: ['test'],
          domain: 'example.com',
          updateExisting: pattern.id,
          tenantId: 'different-tenant', // Different tenant
        })
      ).rejects.toThrow('Only the author can update');
    });
  });

  describe('Pattern Search and Discovery', () => {
    beforeEach(async () => {
      // Publish some test patterns
      await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'E-commerce Product API',
        description: 'Fetch product details from e-commerce site',
        category: 'ecommerce',
        tags: ['api', 'products', 'ecommerce'],
        domain: 'shop.example.com',
        tenantId: 'tenant-1',
      });

      await service.publishPattern({
        patternType: 'selector',
        patternData: {},
        name: 'News Article Extractor',
        description: 'Extract article content from news sites',
        category: 'news',
        tags: ['selector', 'news', 'articles'],
        domain: 'news.example.com',
        tenantId: 'tenant-2',
      });

      await service.publishPattern({
        patternType: 'workflow',
        patternData: {},
        name: 'Shopping Cart Checkout',
        description: 'Automate checkout process for shopping',
        category: 'ecommerce',
        tags: ['workflow', 'ecommerce', 'automation'],
        domain: 'shop.example.com',
        tenantId: 'tenant-1',
      });

      // Approve all patterns for search
      const patterns = service.getAllPatterns();
      for (const pattern of patterns) {
        await service.moderatePattern(pattern.id, 'admin', 'approved');
      }
    });

    it('should search by query', () => {
      const result = service.searchPatterns({ query: 'ecommerce' });

      expect(result.patterns.length).toBe(2);
      expect(result.patterns.every(p => p.name.toLowerCase().includes('ecommerce') || p.description.toLowerCase().includes('ecommerce') || p.category === 'ecommerce')).toBe(true);
    });

    it('should filter by category', () => {
      const result = service.searchPatterns({ category: 'news' });

      expect(result.patterns.length).toBe(1);
      expect(result.patterns[0].name).toBe('News Article Extractor');
    });

    it('should filter by pattern type', () => {
      const result = service.searchPatterns({ patternType: 'api' });

      expect(result.patterns.length).toBe(1);
      expect(result.patterns[0].patternType).toBe('api');
    });

    it('should filter by tags', () => {
      const result = service.searchPatterns({ tags: ['workflow'] });

      expect(result.patterns.length).toBe(1);
      expect(result.patterns[0].tags).toContain('workflow');
    });

    it('should filter by domain', () => {
      const result = service.searchPatterns({ domain: 'shop.example.com' });

      expect(result.patterns.length).toBe(2);
      expect(result.patterns.every(p => p.domain === 'shop.example.com')).toBe(true);
    });

    it('should filter by author', () => {
      const result = service.searchPatterns({ authorId: 'tenant-1' });

      expect(result.patterns.length).toBe(2);
      expect(result.patterns.every(p => p.authorId === 'tenant-1')).toBe(true);
    });

    it('should sort by installs', async () => {
      const patterns = service.getAllPatterns();

      // Simulate installs
      patterns[0].installCount = 100;
      patterns[1].installCount = 50;
      patterns[2].installCount = 200;

      const result = service.searchPatterns({ sortBy: 'installs', sortOrder: 'desc' });

      expect(result.patterns[0].installCount).toBe(200);
      expect(result.patterns[1].installCount).toBe(100);
      expect(result.patterns[2].installCount).toBe(50);
    });

    it('should paginate results', () => {
      const page1 = service.searchPatterns({ page: 1, limit: 2 });
      const page2 = service.searchPatterns({ page: 2, limit: 2 });

      expect(page1.patterns.length).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.hasMore).toBe(true);
      expect(page1.total).toBe(3);

      expect(page2.patterns.length).toBe(1);
      expect(page2.page).toBe(2);
      expect(page2.hasMore).toBe(false);
    });

    it('should only return approved patterns', async () => {
      // Add a pending pattern
      await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Pending Pattern',
        description: 'This pattern is pending approval and should not appear',
        category: 'other',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'tenant-3',
      });

      const result = service.searchPatterns({});

      // Should only return the 3 approved patterns
      expect(result.patterns.length).toBe(3);
      expect(result.patterns.every(p => p.moderationStatus === 'approved')).toBe(true);
    });
  });

  describe('Rating and Reviews', () => {
    let patternId: string;

    beforeEach(async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Test Pattern',
        description: 'A pattern for testing ratings and reviews',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });
      patternId = pattern.id;
    });

    it('should rate a pattern', async () => {
      const rating = await service.ratePattern(patternId, 'user-1', {
        rating: 5,
        review: 'Excellent pattern! Works perfectly.',
        title: 'Great!',
        verified: true,
      });

      expect(rating.id).toBeDefined();
      expect(rating.patternId).toBe(patternId);
      expect(rating.userId).toBe('user-1');
      expect(rating.rating).toBe(5);
      expect(rating.review).toBe('Excellent pattern! Works perfectly.');
      expect(rating.verified).toBe(true);
    });

    it('should update existing rating', async () => {
      // Rate first time
      await service.ratePattern(patternId, 'user-1', {
        rating: 4,
        review: 'Good',
      });

      // Rate again with different score
      const updated = await service.ratePattern(patternId, 'user-1', {
        rating: 5,
        review: 'Actually, it is excellent!',
        title: 'Updated Review',
      });

      expect(updated.rating).toBe(5);
      expect(updated.review).toBe('Actually, it is excellent!');

      // Should only have one rating per user
      const ratings = service.getPatternRatings(patternId);
      expect(ratings.length).toBe(1);
    });

    it('should calculate average rating', async () => {
      await service.ratePattern(patternId, 'user-1', { rating: 5 });
      await service.ratePattern(patternId, 'user-2', { rating: 4 });
      await service.ratePattern(patternId, 'user-3', { rating: 5 });

      const pattern = service.getPattern(patternId);

      expect(pattern?.avgRating).toBeCloseTo(4.67, 1);
      expect(pattern?.ratingCount).toBe(3);
    });

    it('should get all ratings for a pattern', async () => {
      await service.ratePattern(patternId, 'user-1', { rating: 5, review: 'Great!' });
      await service.ratePattern(patternId, 'user-2', { rating: 4, review: 'Good' });

      const ratings = service.getPatternRatings(patternId);

      expect(ratings.length).toBe(2);
      expect(ratings.map(r => r.userId)).toContain('user-1');
      expect(ratings.map(r => r.userId)).toContain('user-2');
    });
  });

  describe('Installation Management', () => {
    let patternId: string;

    beforeEach(async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Test Pattern',
        description: 'A pattern for testing installations',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });
      patternId = pattern.id;
    });

    it('should install a pattern', async () => {
      const installation = await service.installPattern(patternId, 'user-1');

      expect(installation.id).toBeDefined();
      expect(installation.patternId).toBe(patternId);
      expect(installation.userId).toBe('user-1');
      expect(installation.usageCount).toBe(0);
      expect(installation.autoUpdate).toBe(true);

      // Install count should increment
      const pattern = service.getPattern(patternId);
      expect(pattern?.installCount).toBe(1);
    });

    it('should not install same pattern twice', async () => {
      const install1 = await service.installPattern(patternId, 'user-1');
      const install2 = await service.installPattern(patternId, 'user-1');

      expect(install1.id).toBe(install2.id);

      const pattern = service.getPattern(patternId);
      expect(pattern?.installCount).toBe(1); // Still 1
    });

    it('should uninstall a pattern', async () => {
      await service.installPattern(patternId, 'user-1');
      await service.uninstallPattern(patternId, 'user-1');

      const installations = service.getUserInstallations('user-1');
      expect(installations.length).toBe(0);

      const pattern = service.getPattern(patternId);
      expect(pattern?.installCount).toBe(0);
    });

    it('should get user installations', async () => {
      // Install multiple patterns
      const pattern2 = await service.publishPattern({
        patternType: 'selector',
        patternData: {},
        name: 'Another Pattern',
        description: 'Second pattern for testing installations',
        category: 'news',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });

      await service.installPattern(patternId, 'user-1');
      await service.installPattern(pattern2.id, 'user-1');

      const installations = service.getUserInstallations('user-1');

      expect(installations.length).toBe(2);
      expect(installations.map(i => i.patternId)).toContain(patternId);
      expect(installations.map(i => i.patternId)).toContain(pattern2.id);
    });

    it('should record usage', async () => {
      await service.installPattern(patternId, 'user-1');

      await service.recordUsage(patternId, 'user-1', true);
      await service.recordUsage(patternId, 'user-1', true);
      await service.recordUsage(patternId, 'user-1', false);

      const installations = service.getUserInstallations('user-1');
      const installation = installations[0];

      expect(installation.usageCount).toBe(3);
      expect(installation.successCount).toBe(2);
      expect(installation.failureCount).toBe(1);

      const pattern = service.getPattern(patternId);
      expect(pattern?.totalExecutions).toBe(3);
      expect(pattern?.successfulExecutions).toBe(2);
      expect(pattern?.failedExecutions).toBe(1);
      expect(pattern?.successRate).toBeCloseTo(0.67, 1);
    });
  });

  describe('Reporting and Moderation', () => {
    let patternId: string;

    beforeEach(async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Test Pattern',
        description: 'A pattern for testing reports and moderation',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });
      patternId = pattern.id;
    });

    it('should report a pattern', async () => {
      const report = await service.reportPattern(
        patternId,
        'reporter-1',
        'spam',
        'This pattern is spam'
      );

      expect(report.id).toBeDefined();
      expect(report.patternId).toBe(patternId);
      expect(report.reportedBy).toBe('reporter-1');
      expect(report.reason).toBe('spam');
      expect(report.details).toBe('This pattern is spam');
      expect(report.status).toBe('pending');
    });

    it('should auto-flag pattern after 3 reports', async () => {
      await service.reportPattern(patternId, 'user-1', 'spam');
      await service.reportPattern(patternId, 'user-2', 'spam');
      await service.reportPattern(patternId, 'user-3', 'spam');

      const pattern = service.getPattern(patternId);
      expect(pattern?.moderationStatus).toBe('flagged');
    });

    it('should moderate a pattern', async () => {
      const moderated = await service.moderatePattern(
        patternId,
        'moderator-1',
        'approved',
        'Looks good'
      );

      expect(moderated.moderationStatus).toBe('approved');
      expect(moderated.moderatedBy).toBe('moderator-1');
      expect(moderated.moderatedAt).toBeDefined();
      expect(moderated.moderationNotes).toBe('Looks good');
    });
  });

  describe('Pattern Statistics', () => {
    let patternId: string;

    beforeEach(async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Test Pattern',
        description: 'A pattern for testing statistics',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });
      patternId = pattern.id;
    });

    it('should get pattern statistics', async () => {
      // Install and use
      await service.installPattern(patternId, 'user-1');
      await service.installPattern(patternId, 'user-2');

      await service.recordUsage(patternId, 'user-1', true);
      await service.recordUsage(patternId, 'user-1', true);
      await service.recordUsage(patternId, 'user-1', false);

      // Rate
      await service.ratePattern(patternId, 'user-1', { rating: 5 });
      await service.ratePattern(patternId, 'user-2', { rating: 4, review: 'Good' });

      // Report
      await service.reportPattern(patternId, 'user-3', 'broken');

      const stats = service.getPatternStats(patternId);

      expect(stats?.totalInstalls).toBe(2);
      expect(stats?.totalUsage).toBe(3);
      expect(stats?.successfulUsage).toBe(2);
      expect(stats?.failedUsage).toBe(1);
      expect(stats?.successRate).toBeCloseTo(0.67, 1);
      expect(stats?.avgRating).toBeCloseTo(4.5, 1);
      expect(stats?.totalReviews).toBe(1);
      expect(stats?.totalReports).toBe(1);
      expect(stats?.ratingDistribution[5]).toBe(1);
      expect(stats?.ratingDistribution[4]).toBe(1);
    });
  });

  describe('Marketplace Analytics', () => {
    beforeEach(async () => {
      // Publish multiple patterns
      await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Pattern 1',
        description: 'First test pattern for marketplace',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-1',
      });

      await service.publishPattern({
        patternType: 'selector',
        patternData: {},
        name: 'Pattern 2',
        description: 'Second test pattern for marketplace',
        category: 'news',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-1',
      });

      await service.publishPattern({
        patternType: 'workflow',
        patternData: {},
        name: 'Pattern 3',
        description: 'Third test pattern for marketplace',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-2',
      });
    });

    it('should get marketplace analytics', () => {
      const analytics = service.getMarketplaceAnalytics();

      expect(analytics.totalPatterns).toBe(3);
      expect(analytics.patternsByCategory.ecommerce).toBe(2);
      expect(analytics.patternsByCategory.news).toBe(1);
      expect(analytics.patternsByType.api).toBe(1);
      expect(analytics.patternsByType.selector).toBe(1);
      expect(analytics.patternsByType.workflow).toBe(1);
      expect(analytics.totalAuthors).toBe(2);
      expect(analytics.pendingModeration).toBe(3);
    });
  });

  describe('Pattern Deletion', () => {
    it('should delete pattern by author', async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'To Be Deleted',
        description: 'This pattern will be deleted by its author',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });

      await service.deletePattern(pattern.id, 'author-123', false);

      expect(service.getPattern(pattern.id)).toBeUndefined();
    });

    it('should delete pattern by admin', async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'To Be Deleted',
        description: 'This pattern will be deleted by admin',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });

      await service.deletePattern(pattern.id, 'admin-456', true);

      expect(service.getPattern(pattern.id)).toBeUndefined();
    });

    it('should not allow non-author to delete', async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'Protected Pattern',
        description: 'This pattern cannot be deleted by others',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });

      await expect(
        service.deletePattern(pattern.id, 'other-user', false)
      ).rejects.toThrow('Only the author or an admin can delete');
    });

    it('should remove installations when pattern deleted', async () => {
      const pattern = await service.publishPattern({
        patternType: 'api',
        patternData: {},
        name: 'To Be Deleted',
        description: 'Pattern with installations to be deleted',
        category: 'ecommerce',
        tags: ['test'],
        domain: 'example.com',
        tenantId: 'author-123',
      });

      await service.installPattern(pattern.id, 'user-1');
      await service.installPattern(pattern.id, 'user-2');

      await service.deletePattern(pattern.id, 'author-123', false);

      expect(service.getUserInstallations('user-1').length).toBe(0);
      expect(service.getUserInstallations('user-2').length).toBe(0);
    });
  });
});
