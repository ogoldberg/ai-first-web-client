/**
 * Integration Tests: smart_browse Tool
 *
 * Tests the smart_browse MCP tool handler, validating:
 * - Basic browsing functionality
 * - Options handling (contentType, pagination, etc.)
 * - Response formatting for LLM consumption
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartBrowser } from '../../src/core/smart-browser.js';
import type { SmartBrowseResult } from '../../src/core/smart-browser.js';

// Mock SmartBrowser
vi.mock('../../src/core/smart-browser.js');

describe('smart_browse Tool Integration', () => {
  let mockSmartBrowser: {
    browse: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    getDomainIntelligence: ReturnType<typeof vi.fn>;
    getLearningEngine: ReturnType<typeof vi.fn>;
    getProceduralMemoryStats: ReturnType<typeof vi.fn>;
  };

  // Helper to create a successful SmartBrowseResult
  const createBrowseResult = (overrides: Partial<SmartBrowseResult> = {}): SmartBrowseResult => ({
    url: 'https://example.com',
    title: 'Test Page',
    content: {
      html: '<html><body><h1>Test</h1><p>Content here</p></body></html>',
      markdown: '# Test\n\nContent here',
      text: 'Test Content here',
      ...(overrides.content || {}),
    },
    tables: [],
    metadata: {
      loadTime: 150,
      timestamp: Date.now(),
      finalUrl: 'https://example.com',
      statusCode: 200,
      ...(overrides.metadata || {}),
    },
    network: [],
    discoveredApis: [],
    learning: {
      confidenceLevel: 'high' as const,
      domainGroup: 'general',
      validationResult: { valid: true, reasons: [], score: 1.0 },
      contentChanged: false,
      recommendedRefreshHours: 24,
      paginationDetected: null,
      selectorsUsed: [],
      selectorsSucceeded: [],
      selectorsFailed: [],
      skillApplied: undefined,
      skillsMatched: [],
      trajectoryRecorded: false,
      renderTier: 'intelligence' as const,
      tierFellBack: false,
      tierReason: 'Intelligence tier succeeded',
      tiersAttempted: ['intelligence'],
      tierTiming: { intelligence: 100 },
      ...(overrides.learning || {}),
    },
    ...overrides,
  });

  // Helper to simulate smart_browse tool handler
  const executeSmartBrowse = async (
    smartBrowser: typeof mockSmartBrowser,
    args: Record<string, unknown>
  ) => {
    const result = await smartBrowser.browse(args.url as string, {
      contentType: args.contentType as string | undefined,
      followPagination: args.followPagination as boolean | undefined,
      maxPages: args.maxPages as number | undefined,
      checkForChanges: args.checkForChanges as boolean | undefined,
      waitForSelector: args.waitForSelector as string | undefined,
      scrollToLoad: args.scrollToLoad as boolean | undefined,
      sessionProfile: args.sessionProfile as string | undefined,
      validateContent: true,
      enableLearning: true,
    });

    // Format result for LLM consumption (matches index.ts handler)
    const formattedResult = {
      url: result.url,
      title: result.title,
      content: {
        markdown: result.content.markdown,
        textLength: result.content.text.length,
      },
      tables: result.tables,
      metadata: result.metadata,
      intelligence: {
        confidenceLevel: result.learning.confidenceLevel,
        domainGroup: result.learning.domainGroup,
        validationPassed: result.learning.validationResult?.valid,
        validationIssues: result.learning.validationResult?.reasons,
        contentChanged: result.learning.contentChanged,
        recommendedRefreshHours: result.learning.recommendedRefreshHours,
        paginationAvailable: !!result.learning.paginationDetected,
        selectorsSucceeded: result.learning.selectorsSucceeded.length,
        selectorsFailed: result.learning.selectorsFailed.length,
        skillApplied: result.learning.skillApplied,
        skillsMatched: result.learning.skillsMatched?.length || 0,
        trajectoryRecorded: result.learning.trajectoryRecorded,
        renderTier: result.learning.renderTier,
        tierFellBack: result.learning.tierFellBack,
        tierReason: result.learning.tierReason,
      },
      discoveredApis: result.discoveredApis.map(api => ({
        endpoint: api.endpoint,
        method: api.method,
        canBypassBrowser: api.canBypass,
        confidence: api.confidence,
      })),
      additionalPages: result.additionalPages?.map(page => ({
        url: page.url,
        textLength: page.content.text.length,
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedResult, null, 2),
        },
      ],
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSmartBrowser = {
      browse: vi.fn().mockResolvedValue(createBrowseResult()),
      initialize: vi.fn().mockResolvedValue(undefined),
      getDomainIntelligence: vi.fn().mockResolvedValue({
        knownPatterns: 0,
        successRate: 0,
        preferredTier: 'intelligence',
      }),
      getLearningEngine: vi.fn().mockReturnValue({
        getStats: vi.fn().mockReturnValue({
          totalDomains: 0,
          totalApiPatterns: 0,
          bypassablePatterns: 0,
          totalSelectors: 0,
          totalValidators: 0,
          domainGroups: 0,
          recentLearningEvents: [],
        }),
      }),
      getProceduralMemoryStats: vi.fn().mockReturnValue({
        totalSkills: 0,
        totalTrajectories: 0,
        avgSuccessRate: 0,
        skillsByDomain: {},
        mostUsedSkills: [],
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('should browse a URL and return formatted result', async () => {
      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledOnce();
      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          validateContent: true,
          enableLearning: true,
        })
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.url).toBe('https://example.com');
      expect(parsed.title).toBe('Test Page');
    });

    it('should include content in markdown format', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          content: {
            html: '<h1>Article</h1><p>Long article content here</p>',
            markdown: '# Article\n\nLong article content here',
            text: 'Article Long article content here',
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/article',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content.markdown).toBe('# Article\n\nLong article content here');
      expect(parsed.content.textLength).toBe(33);
    });

    it('should include metadata in response', async () => {
      const timestamp = Date.now();
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          metadata: {
            loadTime: 250,
            timestamp,
            finalUrl: 'https://example.com/redirected',
            statusCode: 200,
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.metadata.loadTime).toBe(250);
      expect(parsed.metadata.finalUrl).toBe('https://example.com/redirected');
      expect(parsed.metadata.timestamp).toBe(timestamp);
    });
  });

  describe('Options handling', () => {
    it('should pass contentType option', async () => {
      await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
        contentType: 'article',
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          contentType: 'article',
        })
      );
    });

    it('should pass followPagination option', async () => {
      await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/products',
        followPagination: true,
        maxPages: 5,
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com/products',
        expect.objectContaining({
          followPagination: true,
          maxPages: 5,
        })
      );
    });

    it('should pass checkForChanges option', async () => {
      await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
        checkForChanges: true,
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          checkForChanges: true,
        })
      );
    });

    it('should pass waitForSelector option', async () => {
      await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/spa',
        waitForSelector: '.content-loaded',
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com/spa',
        expect.objectContaining({
          waitForSelector: '.content-loaded',
        })
      );
    });

    it('should pass scrollToLoad option', async () => {
      await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/infinite-scroll',
        scrollToLoad: true,
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com/infinite-scroll',
        expect.objectContaining({
          scrollToLoad: true,
        })
      );
    });

    it('should pass sessionProfile option', async () => {
      await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/dashboard',
        sessionProfile: 'authenticated-user',
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com/dashboard',
        expect.objectContaining({
          sessionProfile: 'authenticated-user',
        })
      );
    });

    it('should always set validateContent and enableLearning to true', async () => {
      await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
      });

      expect(mockSmartBrowser.browse).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          validateContent: true,
          enableLearning: true,
        })
      );
    });
  });

  describe('Response formatting', () => {
    it('should format intelligence insights correctly', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          learning: {
            confidenceLevel: 'high',
            domainGroup: 'ecommerce',
            validationResult: { valid: true, reasons: [], score: 0.95 },
            contentChanged: true,
            recommendedRefreshHours: 12,
            paginationDetected: { type: 'numbered', totalPages: 5 },
            selectorsUsed: ['main', 'article'],
            selectorsSucceeded: ['main', 'article'],
            selectorsFailed: [],
            skillApplied: 'ecommerce-product-list',
            skillsMatched: ['ecommerce-product-list', 'general-article'],
            trajectoryRecorded: true,
            renderTier: 'intelligence',
            tierFellBack: false,
            tierReason: 'Cached pattern matched',
            tiersAttempted: ['intelligence'],
            tierTiming: { intelligence: 50 },
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://shop.example.com/products',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.intelligence).toEqual({
        confidenceLevel: 'high',
        domainGroup: 'ecommerce',
        validationPassed: true,
        validationIssues: [],
        contentChanged: true,
        recommendedRefreshHours: 12,
        paginationAvailable: true,
        selectorsSucceeded: 2,
        selectorsFailed: 0,
        skillApplied: 'ecommerce-product-list',
        skillsMatched: 2,
        trajectoryRecorded: true,
        renderTier: 'intelligence',
        tierFellBack: false,
        tierReason: 'Cached pattern matched',
      });
    });

    it('should format discovered APIs correctly', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          discoveredApis: [
            {
              endpoint: 'https://api.example.com/products',
              method: 'GET',
              canBypass: true,
              confidence: 'high',
              headers: {},
              params: {},
            },
            {
              endpoint: 'https://api.example.com/cart',
              method: 'POST',
              canBypass: false,
              confidence: 'medium',
              headers: {},
              params: {},
            },
          ],
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.discoveredApis).toHaveLength(2);
      expect(parsed.discoveredApis[0]).toEqual({
        endpoint: 'https://api.example.com/products',
        method: 'GET',
        canBypassBrowser: true,
        confidence: 'high',
      });
      expect(parsed.discoveredApis[1]).toEqual({
        endpoint: 'https://api.example.com/cart',
        method: 'POST',
        canBypassBrowser: false,
        confidence: 'medium',
      });
    });

    it('should format additional pages when pagination followed', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          additionalPages: [
            {
              url: 'https://example.com/products?page=2',
              content: { html: '', markdown: '', text: 'Page 2 content with items' },
            },
            {
              url: 'https://example.com/products?page=3',
              content: { html: '', markdown: '', text: 'Page 3 content' },
            },
          ],
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/products',
        followPagination: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.additionalPages).toHaveLength(2);
      expect(parsed.additionalPages[0]).toEqual({
        url: 'https://example.com/products?page=2',
        textLength: 25, // 'Page 2 content with items'.length
      });
      expect(parsed.additionalPages[1]).toEqual({
        url: 'https://example.com/products?page=3',
        textLength: 14,
      });
    });

    it('should include tables when present', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          tables: [
            {
              headers: ['Name', 'Price', 'Stock'],
              rows: [
                ['Product A', '$10.00', '100'],
                ['Product B', '$20.00', '50'],
              ],
            },
          ],
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/inventory',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tables).toHaveLength(1);
      expect(parsed.tables[0].headers).toEqual(['Name', 'Price', 'Stock']);
      expect(parsed.tables[0].rows).toHaveLength(2);
    });

    it('should handle tier fallback information', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          learning: {
            confidenceLevel: 'medium',
            domainGroup: 'spa',
            validationResult: { valid: true, reasons: [], score: 0.7 },
            contentChanged: false,
            recommendedRefreshHours: 6,
            paginationDetected: null,
            selectorsUsed: [],
            selectorsSucceeded: [],
            selectorsFailed: ['article', 'main'],
            skillApplied: undefined,
            skillsMatched: [],
            trajectoryRecorded: false,
            renderTier: 'playwright',
            tierFellBack: true,
            tierReason: 'Required full browser rendering',
            tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
            tierTiming: { intelligence: 100, lightweight: 200, playwright: 1500 },
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://spa.example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.intelligence.renderTier).toBe('playwright');
      expect(parsed.intelligence.tierFellBack).toBe(true);
      expect(parsed.intelligence.tierReason).toBe('Required full browser rendering');
      expect(parsed.intelligence.selectorsFailed).toBe(2);
    });
  });

  describe('Error handling', () => {
    it('should propagate browse errors', async () => {
      mockSmartBrowser.browse.mockRejectedValue(new Error('Network timeout'));

      await expect(
        executeSmartBrowse(mockSmartBrowser, {
          url: 'https://slow.example.com',
        })
      ).rejects.toThrow('Network timeout');
    });

    it('should propagate validation errors', async () => {
      mockSmartBrowser.browse.mockRejectedValue(
        new Error('Content validation failed: insufficient content')
      );

      await expect(
        executeSmartBrowse(mockSmartBrowser, {
          url: 'https://empty.example.com',
        })
      ).rejects.toThrow('Content validation failed');
    });

    it('should propagate all-tiers-failed errors', async () => {
      mockSmartBrowser.browse.mockRejectedValue(
        new Error('All rendering tiers failed: intelligence, lightweight, playwright')
      );

      await expect(
        executeSmartBrowse(mockSmartBrowser, {
          url: 'https://broken.example.com',
        })
      ).rejects.toThrow('All rendering tiers failed');
    });
  });

  describe('Validation result handling', () => {
    it('should include validation issues when validation fails', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          learning: {
            confidenceLevel: 'low',
            domainGroup: 'general',
            validationResult: {
              valid: false,
              reasons: ['Content too short', 'Missing main content area'],
              score: 0.3,
            },
            contentChanged: false,
            recommendedRefreshHours: 1,
            paginationDetected: null,
            selectorsUsed: [],
            selectorsSucceeded: [],
            selectorsFailed: [],
            skillApplied: undefined,
            skillsMatched: [],
            trajectoryRecorded: false,
            renderTier: 'playwright',
            tierFellBack: true,
            tierReason: 'Validation issues detected',
            tiersAttempted: ['intelligence', 'lightweight', 'playwright'],
            tierTiming: {},
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://problematic.example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.intelligence.validationPassed).toBe(false);
      expect(parsed.intelligence.validationIssues).toEqual([
        'Content too short',
        'Missing main content area',
      ]);
    });

    it('should handle undefined validationResult', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          learning: {
            confidenceLevel: 'unknown',
            domainGroup: 'unknown',
            validationResult: undefined,
            contentChanged: false,
            recommendedRefreshHours: 24,
            paginationDetected: null,
            selectorsUsed: [],
            selectorsSucceeded: [],
            selectorsFailed: [],
            skillApplied: undefined,
            skillsMatched: [],
            trajectoryRecorded: false,
            renderTier: 'intelligence',
            tierFellBack: false,
            tierReason: '',
            tiersAttempted: ['intelligence'],
            tierTiming: {},
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.intelligence.validationPassed).toBeUndefined();
      expect(parsed.intelligence.validationIssues).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty content gracefully', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          content: {
            html: '',
            markdown: '',
            text: '',
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/empty',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.content.markdown).toBe('');
      expect(parsed.content.textLength).toBe(0);
    });

    it('should handle missing additionalPages', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          additionalPages: undefined,
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.additionalPages).toBeUndefined();
    });

    it('should handle empty discoveredApis', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          discoveredApis: [],
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://static.example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.discoveredApis).toEqual([]);
    });

    it('should handle special characters in content', async () => {
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          title: 'Test & Demo <Page>',
          content: {
            html: '<p>Content with "quotes" & special chars</p>',
            markdown: 'Content with "quotes" & special chars',
            text: 'Content with "quotes" & special chars',
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: 'https://example.com/special',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.title).toBe('Test & Demo <Page>');
      expect(parsed.content.markdown).toBe('Content with "quotes" & special chars');
    });

    it('should handle very long URLs', async () => {
      const longUrl = 'https://example.com/search?' + 'q='.repeat(500);
      mockSmartBrowser.browse.mockResolvedValue(
        createBrowseResult({
          url: longUrl,
          metadata: {
            loadTime: 100,
            timestamp: Date.now(),
            finalUrl: longUrl,
            statusCode: 200,
          },
        })
      );

      const result = await executeSmartBrowse(mockSmartBrowser, {
        url: longUrl,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.url).toBe(longUrl);
      expect(parsed.metadata.finalUrl).toBe(longUrl);
    });
  });
});
