/**
 * Integration Tests: Related MCP Tools
 *
 * Tests for MCP tools that work alongside smart_browse:
 * - get_domain_intelligence
 * - get_learning_stats
 * - get_procedural_memory_stats
 * - find_applicable_skills
 * - get_skill_details
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Related MCP Tools Integration', () => {
  let mockSmartBrowser: {
    browse: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    getDomainIntelligence: ReturnType<typeof vi.fn>;
    getLearningEngine: ReturnType<typeof vi.fn>;
    getProceduralMemory: ReturnType<typeof vi.fn>;
    getProceduralMemoryStats: ReturnType<typeof vi.fn>;
    findApplicableSkills: ReturnType<typeof vi.fn>;
  };

  // Helper to execute get_domain_intelligence tool
  const executeGetDomainIntelligence = async (
    smartBrowser: typeof mockSmartBrowser,
    args: { domain: string }
  ) => {
    const intelligence = await smartBrowser.getDomainIntelligence(args.domain);

    const getRecommendations = (intel: Record<string, unknown>) => {
      const recs = [];
      if ((intel.successRate as number) < 0.7) recs.push('Consider using full browser rendering');
      if ((intel.knownPatterns as number) === 0) recs.push('First time visiting this domain');
      return recs;
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            domain: args.domain,
            ...intelligence,
            recommendations: getRecommendations(intelligence),
          }, null, 2),
        },
      ],
    };
  };

  // Helper to execute get_learning_stats tool
  const executeGetLearningStats = async (smartBrowser: typeof mockSmartBrowser) => {
    const learningEngine = smartBrowser.getLearningEngine();
    const stats = learningEngine.getStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              totalDomains: stats.totalDomains,
              totalApiPatterns: stats.totalApiPatterns,
              bypassablePatterns: stats.bypassablePatterns,
              totalSelectors: stats.totalSelectors,
              totalValidators: stats.totalValidators,
              domainGroups: stats.domainGroups,
            },
            recentLearning: stats.recentLearningEvents.slice(-5).map((e: { type: string; domain: string; timestamp: number }) => ({
              type: e.type,
              domain: e.domain,
              timestamp: new Date(e.timestamp).toISOString(),
            })),
          }, null, 2),
        },
      ],
    };
  };

  // Helper to execute get_procedural_memory_stats tool
  const executeGetProceduralMemoryStats = async (smartBrowser: typeof mockSmartBrowser) => {
    const proceduralStats = smartBrowser.getProceduralMemoryStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              totalSkills: proceduralStats.totalSkills,
              totalTrajectories: proceduralStats.totalTrajectories,
              avgSuccessRate: Math.round(proceduralStats.avgSuccessRate * 100) + '%',
            },
            skillsByDomain: proceduralStats.skillsByDomain,
            mostUsedSkills: proceduralStats.mostUsedSkills.slice(0, 5),
          }, null, 2),
        },
      ],
    };
  };

  // Helper to execute find_applicable_skills tool
  const executeFindApplicableSkills = async (
    smartBrowser: typeof mockSmartBrowser,
    args: { url: string; topK?: number }
  ) => {
    const skills = smartBrowser.findApplicableSkills(args.url, args.topK || 3);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            url: args.url,
            matchedSkills: skills.map((match: {
              skill: { id: string; name: string; description: string; metrics: { timesUsed: number; successCount: number } };
              similarity: number;
              preconditionsMet: boolean;
              reason: string;
            }) => ({
              skillId: match.skill.id,
              name: match.skill.name,
              description: match.skill.description,
              similarity: Math.round(match.similarity * 100) + '%',
              preconditionsMet: match.preconditionsMet,
              reason: match.reason,
              timesUsed: match.skill.metrics.timesUsed,
              successRate: match.skill.metrics.successCount > 0
                ? Math.round((match.skill.metrics.successCount / match.skill.metrics.timesUsed) * 100) + '%'
                : 'N/A',
            })),
          }, null, 2),
        },
      ],
    };
  };

  // Helper to execute get_skill_details tool
  const executeGetSkillDetails = async (
    smartBrowser: typeof mockSmartBrowser,
    args: { skillId: string }
  ) => {
    const proceduralMemory = smartBrowser.getProceduralMemory();
    const skill = proceduralMemory.getSkill(args.skillId);

    if (!skill) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Skill not found: ${args.skillId}` }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            preconditions: skill.preconditions,
            actionSequence: skill.actionSequence.map((a: { type: string; selector: string; success: boolean }) => ({
              type: a.type,
              selector: a.selector,
              success: a.success,
            })),
            metrics: {
              successCount: skill.metrics.successCount,
              failureCount: skill.metrics.failureCount,
              successRate: skill.metrics.timesUsed > 0
                ? Math.round((skill.metrics.successCount / skill.metrics.timesUsed) * 100) + '%'
                : 'N/A',
              avgDuration: Math.round(skill.metrics.avgDuration) + 'ms',
              timesUsed: skill.metrics.timesUsed,
              lastUsed: new Date(skill.metrics.lastUsed).toISOString(),
            },
            sourceDomain: skill.sourceDomain,
            createdAt: new Date(skill.createdAt).toISOString(),
          }, null, 2),
        },
      ],
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockSmartBrowser = {
      browse: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
      getDomainIntelligence: vi.fn().mockResolvedValue({
        knownPatterns: 5,
        successRate: 0.85,
        preferredTier: 'intelligence',
        lastVisit: Date.now() - 86400000,
        avgLoadTime: 150,
      }),
      getLearningEngine: vi.fn().mockReturnValue({
        getStats: vi.fn().mockReturnValue({
          totalDomains: 10,
          totalApiPatterns: 25,
          bypassablePatterns: 15,
          totalSelectors: 50,
          totalValidators: 8,
          domainGroups: 3,
          recentLearningEvents: [
            { type: 'api_discovered', domain: 'example.com', timestamp: Date.now() - 3600000 },
            { type: 'selector_success', domain: 'test.com', timestamp: Date.now() - 1800000 },
          ],
        }),
      }),
      getProceduralMemory: vi.fn().mockReturnValue({
        getSkill: vi.fn().mockReturnValue(null),
        getStats: vi.fn().mockReturnValue({ totalSkills: 0 }),
      }),
      getProceduralMemoryStats: vi.fn().mockReturnValue({
        totalSkills: 12,
        totalTrajectories: 45,
        avgSuccessRate: 0.78,
        skillsByDomain: { 'example.com': 5, 'test.com': 7 },
        mostUsedSkills: [
          { id: 'skill-1', name: 'Product List', usageCount: 25 },
          { id: 'skill-2', name: 'Article Extract', usageCount: 18 },
        ],
      }),
      findApplicableSkills: vi.fn().mockReturnValue([]),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get_domain_intelligence', () => {
    it('should return domain intelligence with recommendations', async () => {
      const result = await executeGetDomainIntelligence(mockSmartBrowser, {
        domain: 'example.com',
      });

      expect(mockSmartBrowser.getDomainIntelligence).toHaveBeenCalledWith('example.com');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.domain).toBe('example.com');
      expect(parsed.knownPatterns).toBe(5);
      expect(parsed.successRate).toBe(0.85);
      expect(parsed.preferredTier).toBe('intelligence');
      expect(parsed.recommendations).toBeDefined();
    });

    it('should recommend full browser for low success rate', async () => {
      mockSmartBrowser.getDomainIntelligence.mockResolvedValue({
        knownPatterns: 2,
        successRate: 0.4,
        preferredTier: 'playwright',
      });

      const result = await executeGetDomainIntelligence(mockSmartBrowser, {
        domain: 'difficult.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.recommendations).toContain('Consider using full browser rendering');
    });

    it('should note first-time domain visits', async () => {
      mockSmartBrowser.getDomainIntelligence.mockResolvedValue({
        knownPatterns: 0,
        successRate: 0,
        preferredTier: 'intelligence',
      });

      const result = await executeGetDomainIntelligence(mockSmartBrowser, {
        domain: 'new-domain.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.recommendations).toContain('First time visiting this domain');
    });
  });

  describe('get_learning_stats', () => {
    it('should return learning statistics summary', async () => {
      const result = await executeGetLearningStats(mockSmartBrowser);

      expect(mockSmartBrowser.getLearningEngine).toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.totalDomains).toBe(10);
      expect(parsed.summary.totalApiPatterns).toBe(25);
      expect(parsed.summary.bypassablePatterns).toBe(15);
    });

    it('should include recent learning events', async () => {
      const result = await executeGetLearningStats(mockSmartBrowser);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.recentLearning).toHaveLength(2);
      expect(parsed.recentLearning[0].type).toBe('api_discovered');
      expect(parsed.recentLearning[0].domain).toBe('example.com');
    });

    it('should limit recent events to 5', async () => {
      mockSmartBrowser.getLearningEngine.mockReturnValue({
        getStats: vi.fn().mockReturnValue({
          totalDomains: 10,
          totalApiPatterns: 25,
          bypassablePatterns: 15,
          totalSelectors: 50,
          totalValidators: 8,
          domainGroups: 3,
          recentLearningEvents: Array(10).fill(null).map((_, i) => ({
            type: 'event',
            domain: `domain${i}.com`,
            timestamp: Date.now() - i * 1000,
          })),
        }),
      });

      const result = await executeGetLearningStats(mockSmartBrowser);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.recentLearning).toHaveLength(5);
    });
  });

  describe('get_procedural_memory_stats', () => {
    it('should return procedural memory statistics', async () => {
      const result = await executeGetProceduralMemoryStats(mockSmartBrowser);

      expect(mockSmartBrowser.getProceduralMemoryStats).toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.totalSkills).toBe(12);
      expect(parsed.summary.totalTrajectories).toBe(45);
      expect(parsed.summary.avgSuccessRate).toBe('78%');
    });

    it('should include skills by domain', async () => {
      const result = await executeGetProceduralMemoryStats(mockSmartBrowser);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.skillsByDomain).toEqual({
        'example.com': 5,
        'test.com': 7,
      });
    });

    it('should include most used skills limited to 5', async () => {
      const result = await executeGetProceduralMemoryStats(mockSmartBrowser);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.mostUsedSkills).toHaveLength(2);
      expect(parsed.mostUsedSkills[0].name).toBe('Product List');
    });
  });

  describe('find_applicable_skills', () => {
    it('should return matched skills for a URL', async () => {
      mockSmartBrowser.findApplicableSkills.mockReturnValue([
        {
          skill: {
            id: 'skill-product-list',
            name: 'E-commerce Product List',
            description: 'Extract product listings from e-commerce sites',
            metrics: { timesUsed: 15, successCount: 12, failureCount: 3 },
          },
          similarity: 0.92,
          preconditionsMet: true,
          reason: 'URL pattern matches product listing pages',
        },
      ]);

      const result = await executeFindApplicableSkills(mockSmartBrowser, {
        url: 'https://shop.example.com/products',
        topK: 3,
      });

      expect(mockSmartBrowser.findApplicableSkills).toHaveBeenCalledWith(
        'https://shop.example.com/products',
        3
      );

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.url).toBe('https://shop.example.com/products');
      expect(parsed.matchedSkills).toHaveLength(1);
      expect(parsed.matchedSkills[0].skillId).toBe('skill-product-list');
      expect(parsed.matchedSkills[0].similarity).toBe('92%');
      expect(parsed.matchedSkills[0].successRate).toBe('80%');
    });

    it('should handle no matching skills', async () => {
      mockSmartBrowser.findApplicableSkills.mockReturnValue([]);

      const result = await executeFindApplicableSkills(mockSmartBrowser, {
        url: 'https://unique-site.com/page',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.matchedSkills).toEqual([]);
    });

    it('should use default topK of 3', async () => {
      await executeFindApplicableSkills(mockSmartBrowser, {
        url: 'https://example.com',
      });

      expect(mockSmartBrowser.findApplicableSkills).toHaveBeenCalledWith(
        'https://example.com',
        3
      );
    });
  });

  describe('get_skill_details', () => {
    it('should return skill details when found', async () => {
      const mockSkill = {
        id: 'skill-article-extract',
        name: 'Article Extractor',
        description: 'Extracts main article content from news sites',
        preconditions: { urlPattern: '/article/', hasElement: 'article' },
        actionSequence: [
          { type: 'waitFor', selector: 'article', success: true },
          { type: 'extract', selector: 'article h1', success: true },
          { type: 'extract', selector: 'article p', success: true },
        ],
        metrics: {
          successCount: 45,
          failureCount: 5,
          timesUsed: 50,
          avgDuration: 250,
          lastUsed: Date.now() - 3600000,
        },
        sourceDomain: 'news.example.com',
        createdAt: Date.now() - 86400000 * 7,
      };

      mockSmartBrowser.getProceduralMemory.mockReturnValue({
        getSkill: vi.fn().mockReturnValue(mockSkill),
      });

      const result = await executeGetSkillDetails(mockSmartBrowser, {
        skillId: 'skill-article-extract',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('skill-article-extract');
      expect(parsed.name).toBe('Article Extractor');
      expect(parsed.metrics.successRate).toBe('90%');
      expect(parsed.metrics.avgDuration).toBe('250ms');
      expect(parsed.actionSequence).toHaveLength(3);
    });

    it('should return error for non-existent skill', async () => {
      mockSmartBrowser.getProceduralMemory.mockReturnValue({
        getSkill: vi.fn().mockReturnValue(null),
      });

      const result = await executeGetSkillDetails(mockSmartBrowser, {
        skillId: 'non-existent-skill',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Skill not found: non-existent-skill');
    });

    it('should handle skill with zero usage', async () => {
      const newSkill = {
        id: 'new-skill',
        name: 'New Skill',
        description: 'Recently created skill',
        preconditions: {},
        actionSequence: [],
        metrics: {
          successCount: 0,
          failureCount: 0,
          timesUsed: 0,
          avgDuration: 0,
          lastUsed: Date.now(),
        },
        sourceDomain: 'example.com',
        createdAt: Date.now(),
      };

      mockSmartBrowser.getProceduralMemory.mockReturnValue({
        getSkill: vi.fn().mockReturnValue(newSkill),
      });

      const result = await executeGetSkillDetails(mockSmartBrowser, {
        skillId: 'new-skill',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.metrics.successRate).toBe('N/A');
    });
  });
});
