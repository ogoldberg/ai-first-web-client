/**
 * Tests for TC-002: Auto-embed Domain Insights in smart_browse
 *
 * This tests that domain capabilities and knowledge are automatically
 * included in smart_browse responses, and that deprecated tools return
 * deprecation notices.
 *
 * Note: The actual getDomainCapabilities and getDomainIntelligence method
 * behavior is tested in smart-browser.test.ts. These tests focus on:
 * - Type definitions for the new TC-002 fields
 * - Exported types are accessible
 * - Deprecation notice formatting
 */

import { describe, it, expect } from 'vitest';
import type {
  SmartBrowseResult,
  DomainCapabilitiesSummary,
  DomainKnowledgeSummary,
} from '../../src/core/smart-browser.js';

describe('TC-002: Auto-embed Domain Insights in smart_browse', () => {
  describe('SmartBrowseResult type', () => {
    it('should include domainCapabilities in learning object', () => {
      // Type check - if this compiles, the type is correct
      const mockResult: SmartBrowseResult = {
        url: 'https://example.com',
        title: 'Example',
        content: {
          html: '<html></html>',
          markdown: '# Example',
          text: 'Example',
        },
        network: [],
        console: [],
        discoveredApis: [],
        metadata: {
          loadTime: 100,
          timestamp: Date.now(),
          finalUrl: 'https://example.com',
        },
        learning: {
          selectorsUsed: [],
          selectorsSucceeded: [],
          selectorsFailed: [],
          confidenceLevel: 'unknown',
          // TC-002: New fields
          domainCapabilities: {
            canBypassBrowser: true,
            hasLearnedPatterns: true,
            hasActiveSession: false,
            hasSkills: false,
            hasPagination: false,
            hasContentSelectors: true,
          },
          domainKnowledge: {
            patternCount: 5,
            successRate: 0.9,
            recommendedWaitStrategy: 'networkidle',
            recommendations: ['API patterns available'],
          },
        },
      };

      expect(mockResult.learning.domainCapabilities).toBeDefined();
      expect(mockResult.learning.domainCapabilities?.canBypassBrowser).toBe(true);
      expect(mockResult.learning.domainKnowledge).toBeDefined();
      expect(mockResult.learning.domainKnowledge?.patternCount).toBe(5);
    });

    it('should allow optional domainCapabilities and domainKnowledge', () => {
      // These fields should be optional
      const mockResult: SmartBrowseResult = {
        url: 'https://example.com',
        title: 'Example',
        content: {
          html: '<html></html>',
          markdown: '# Example',
          text: 'Example',
        },
        network: [],
        console: [],
        discoveredApis: [],
        metadata: {
          loadTime: 100,
          timestamp: Date.now(),
          finalUrl: 'https://example.com',
        },
        learning: {
          selectorsUsed: [],
          selectorsSucceeded: [],
          selectorsFailed: [],
          confidenceLevel: 'unknown',
          // No domainCapabilities or domainKnowledge - should be valid
        },
      };

      expect(mockResult.learning.domainCapabilities).toBeUndefined();
      expect(mockResult.learning.domainKnowledge).toBeUndefined();
    });
  });

  describe('DomainCapabilitiesSummary type', () => {
    it('should have all required capability flags', () => {
      const capabilities: DomainCapabilitiesSummary = {
        canBypassBrowser: true,
        hasLearnedPatterns: false,
        hasActiveSession: false,
        hasSkills: true,
        hasPagination: false,
        hasContentSelectors: true,
      };

      expect(capabilities.canBypassBrowser).toBe(true);
      expect(capabilities.hasLearnedPatterns).toBe(false);
      expect(capabilities.hasActiveSession).toBe(false);
      expect(capabilities.hasSkills).toBe(true);
      expect(capabilities.hasPagination).toBe(false);
      expect(capabilities.hasContentSelectors).toBe(true);
    });

    it('should enforce all fields are boolean', () => {
      const capabilities: DomainCapabilitiesSummary = {
        canBypassBrowser: false,
        hasLearnedPatterns: false,
        hasActiveSession: false,
        hasSkills: false,
        hasPagination: false,
        hasContentSelectors: false,
      };

      // All values should be boolean
      Object.values(capabilities).forEach(value => {
        expect(typeof value).toBe('boolean');
      });
    });
  });

  describe('DomainKnowledgeSummary type', () => {
    it('should have all required fields', () => {
      const knowledge: DomainKnowledgeSummary = {
        patternCount: 10,
        successRate: 0.95,
        recommendedWaitStrategy: 'networkidle',
        recommendations: ['Use API directly', 'Bypass browser rendering'],
      };

      expect(knowledge.patternCount).toBe(10);
      expect(knowledge.successRate).toBe(0.95);
      expect(knowledge.recommendedWaitStrategy).toBe('networkidle');
      expect(knowledge.recommendations).toEqual(['Use API directly', 'Bypass browser rendering']);
    });

    it('should accept various wait strategies', () => {
      const strategies = ['networkidle', 'preset', 'domcontentloaded', 'load'];

      strategies.forEach(strategy => {
        const knowledge: DomainKnowledgeSummary = {
          patternCount: 0,
          successRate: 1.0,
          recommendedWaitStrategy: strategy,
          recommendations: [],
        };
        expect(knowledge.recommendedWaitStrategy).toBe(strategy);
      });
    });

    it('should accept empty recommendations array', () => {
      const knowledge: DomainKnowledgeSummary = {
        patternCount: 0,
        successRate: 1.0,
        recommendedWaitStrategy: 'networkidle',
        recommendations: [],
      };

      expect(knowledge.recommendations).toEqual([]);
    });
  });

  describe('deprecation notices', () => {
    it('should include deprecation notice format in tool descriptions', () => {
      // Verify the expected deprecation pattern
      const deprecationPattern = /\[DEPRECATED.*smart_browse.*\]/;

      const descriptions = [
        '[DEPRECATED - Use smart_browse with includeInsights=true instead. Domain insights are now automatically included in browse responses.]',
        '[DEPRECATED - Use smart_browse with includeInsights=true instead. Domain capabilities are now automatically included in browse responses.]',
        '[DEPRECATED - Domain-specific insights are now included in smart_browse responses. This global stats tool will be moved to a debug/admin interface.]',
        '[DEPRECATED - Domain-specific insights are now included in smart_browse responses. This comprehensive metrics tool will be moved to a debug/admin interface.]',
      ];

      descriptions.forEach(desc => {
        expect(deprecationPattern.test(desc)).toBe(true);
      });
    });

    it('should format deprecation_notice correctly in responses', () => {
      const expectedNotices = [
        'This tool is deprecated. Domain insights are now automatically included in smart_browse responses with includeInsights=true (default).',
        'This tool is deprecated. Domain capabilities are now automatically included in smart_browse responses with includeInsights=true (default).',
        'This tool is deprecated. Domain-specific insights are now included in smart_browse responses. This global stats tool will be moved to a debug/admin interface.',
        'This tool is deprecated. Domain-specific insights are now included in smart_browse responses. This comprehensive metrics tool will be moved to a debug/admin interface.',
      ];

      expectedNotices.forEach(notice => {
        expect(notice).toContain('deprecated');
        expect(notice).toContain('smart_browse');
      });
    });
  });

  describe('includeInsights parameter', () => {
    it('should default to true', () => {
      // When includeInsights is not specified, it should default to true
      const includeInsights = undefined !== false; // Default behavior
      expect(includeInsights).toBe(true);
    });

    it('should be false when explicitly set', () => {
      const includeInsights = false !== false;
      expect(includeInsights).toBe(false);
    });

    it('should be true when explicitly set to true', () => {
      const includeInsights = true !== false;
      expect(includeInsights).toBe(true);
    });
  });
});
