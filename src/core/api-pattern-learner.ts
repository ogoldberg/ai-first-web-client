/**
 * API Pattern Learner
 *
 * A generalized system for learning API patterns from successful extractions
 * and applying them to new, similar sites.
 *
 * This component:
 * 1. Defines pattern templates extracted from existing handlers
 * 2. Stores learned patterns in a registry
 * 3. Matches URLs to known patterns
 * 4. Applies patterns to extract content
 */

import { logger } from '../utils/logger.js';
import { PersistentStore } from '../utils/persistent-store.js';
import type {
  ApiExtractionSuccess,
  ApiPatternTemplate,
  BootstrapPattern,
  ContentMapping,
  LearnedApiPattern,
  PatternApplicationResult,
  PatternFailureType,
  PatternLearningEvent,
  PatternLearningListener,
  PatternMatch,
  PatternMetrics,
  PatternRegistryConfig,
  PatternRegistryStats,
  PatternTemplateType,
  PatternValidation,
  VariableExtractor,
} from '../types/api-patterns.js';

// Create a logger for patterns
const patternsLogger = logger.create('ApiPatternRegistry');

// ============================================
// PATTERN TEMPLATES
// Abstracted from existing handlers
// ============================================

/**
 * Pattern templates representing the 5 major API pattern types
 * identified from the 8 existing handlers.
 */
export const PATTERN_TEMPLATES: ApiPatternTemplate[] = [
  {
    type: 'json-suffix',
    name: 'JSON Suffix',
    description:
      'Append .json to the URL to get JSON response. Common in Rails-based sites and Reddit.',
    indicators: {
      urlPatterns: [],
      responseIndicators: ['kind', 'data'],
      domainPatterns: ['reddit.com', 'old.reddit.com'],
    },
    knownImplementations: ['reddit.com'],
  },
  {
    type: 'registry-lookup',
    name: 'Package Registry Lookup',
    description:
      'Extract package name from URL and call a separate registry API. Used by package managers.',
    indicators: {
      urlPatterns: ['/package/', '/project/', '/packages/'],
      responseIndicators: ['name', 'version', 'description'],
      domainPatterns: ['npmjs.com', 'pypi.org', 'rubygems.org', 'crates.io'],
    },
    knownImplementations: ['npmjs.com', 'pypi.org'],
  },
  {
    type: 'rest-resource',
    name: 'REST Resource API',
    description:
      'Map URL path segments to a versioned REST API. Common in modern web apps.',
    indicators: {
      urlPatterns: [],
      responseIndicators: ['id', 'created_at', 'updated_at'],
      domainPatterns: ['github.com', 'gitlab.com', 'bitbucket.org'],
    },
    knownImplementations: ['github.com', 'wikipedia.org'],
  },
  {
    type: 'firebase-rest',
    name: 'Firebase-style REST',
    description:
      'Extract item ID from URL and call Firebase-style JSON endpoint (/{id}.json).',
    indicators: {
      urlPatterns: ['id='],
      responseIndicators: ['id', 'by', 'time', 'type'],
      domainPatterns: ['ycombinator.com'],
    },
    knownImplementations: ['news.ycombinator.com'],
  },
  {
    type: 'query-api',
    name: 'Query Parameter API',
    description:
      'Extract identifiers and call API with query parameters. Common in Q&A and blog sites.',
    indicators: {
      urlPatterns: ['/questions/', '/articles/'],
      responseIndicators: ['items', 'results', 'data'],
      domainPatterns: ['stackoverflow.com', 'dev.to', 'stackexchange.com'],
    },
    knownImplementations: ['stackoverflow.com', 'dev.to'],
  },
];

// ============================================
// BOOTSTRAP PATTERNS
// Pre-defined patterns from existing handlers
// ============================================

/**
 * Bootstrap patterns extracted from the 8 existing handlers.
 * These are used to seed the pattern registry with known-working patterns.
 */
export const BOOTSTRAP_PATTERNS: BootstrapPattern[] = [
  // Reddit - JSON Suffix pattern
  {
    source: 'reddit',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'json-suffix',
      urlPatterns: [
        '^https?://(www\\.|old\\.)?reddit\\.com/r/[^/]+',
        '^https?://(www\\.|old\\.)?reddit\\.com/r/[^/]+/comments/',
      ],
      endpointTemplate: '{url}.json',
      extractors: [],
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'data.children[0].data.title',
        description: 'data.children[0].data.selftext',
        body: 'data.children[0].data.selftext_html',
        metadata: {
          subreddit: 'data.children[0].data.subreddit',
          author: 'data.children[0].data.author',
          score: 'data.children[0].data.score',
          numComments: 'data.children[0].data.num_comments',
        },
      },
      validation: {
        requiredFields: ['data', 'kind'],
        minContentLength: 100,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['reddit.com', 'old.reddit.com'],
      },
    },
  },

  // NPM - Registry Lookup pattern
  {
    source: 'npm',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'registry-lookup',
      urlPatterns: ['^https?://(www\\.)?npmjs\\.com/package/([^/]+)'],
      endpointTemplate: 'https://registry.npmjs.org/{package}',
      extractors: [
        {
          name: 'package',
          source: 'path',
          pattern: '/package/([^/]+)',
          group: 1,
        },
      ],
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'name',
        description: 'description',
        body: 'readme',
        metadata: {
          version: 'dist-tags.latest',
          license: 'license',
          repository: 'repository.url',
          homepage: 'homepage',
        },
      },
      validation: {
        requiredFields: ['name', 'versions'],
        minContentLength: 50,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['npmjs.com'],
      },
    },
  },

  // PyPI - Registry Lookup pattern
  {
    source: 'pypi',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'registry-lookup',
      urlPatterns: ['^https?://(www\\.)?pypi\\.org/project/([^/]+)'],
      endpointTemplate: 'https://pypi.org/pypi/{package}/json',
      extractors: [
        {
          name: 'package',
          source: 'path',
          pattern: '/project/([^/]+)',
          group: 1,
        },
      ],
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'info.name',
        description: 'info.summary',
        body: 'info.description',
        metadata: {
          version: 'info.version',
          author: 'info.author',
          license: 'info.license',
          homepage: 'info.home_page',
        },
      },
      validation: {
        requiredFields: ['info', 'releases'],
        minContentLength: 50,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['pypi.org'],
      },
    },
  },

  // GitHub - REST Resource pattern
  {
    source: 'github',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'rest-resource',
      urlPatterns: ['^https?://github\\.com/[^/]+/[^/]+/?$'],
      endpointTemplate: 'https://api.github.com/repos/{owner}/{repo}',
      extractors: [
        {
          name: 'owner',
          source: 'path',
          pattern: '^/([^/]+)',
          group: 1,
        },
        {
          name: 'repo',
          source: 'path',
          pattern: '^/[^/]+/([^/]+)',
          group: 1,
        },
      ],
      method: 'GET',
      headers: { Accept: 'application/vnd.github.v3+json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'full_name',
        description: 'description',
        metadata: {
          stars: 'stargazers_count',
          forks: 'forks_count',
          language: 'language',
          license: 'license.name',
        },
      },
      validation: {
        requiredFields: ['id', 'full_name'],
        minContentLength: 50,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['github.com'],
      },
    },
  },

  // Wikipedia - REST Resource pattern
  {
    source: 'wikipedia',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'rest-resource',
      urlPatterns: ['^https?://([a-z]{2,3})\\.wikipedia\\.org/wiki/(.+)'],
      endpointTemplate:
        'https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}',
      extractors: [
        {
          name: 'lang',
          source: 'subdomain',
          pattern: '^([a-z]{2,3})\\.wikipedia\\.org',
          group: 1,
        },
        {
          name: 'title',
          source: 'path',
          pattern: '/wiki/(.+)',
          group: 1,
          transform: 'urlencode',
        },
      ],
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'title',
        description: 'description',
        body: 'extract',
        metadata: {
          thumbnail: 'thumbnail.source',
          pageId: 'pageid',
        },
      },
      validation: {
        requiredFields: ['title', 'extract'],
        minContentLength: 100,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['wikipedia.org'],
      },
    },
  },

  // HackerNews - Firebase REST pattern
  {
    source: 'hackernews',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'firebase-rest',
      urlPatterns: ['^https?://news\\.ycombinator\\.com/item\\?id=(\\d+)'],
      endpointTemplate:
        'https://hacker-news.firebaseio.com/v0/item/{id}.json',
      extractors: [
        {
          name: 'id',
          source: 'query',
          pattern: 'id=(\\d+)',
          group: 1,
        },
      ],
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'title',
        body: 'text',
        metadata: {
          author: 'by',
          score: 'score',
          time: 'time',
          type: 'type',
        },
      },
      validation: {
        requiredFields: ['id', 'type'],
        minContentLength: 20,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['news.ycombinator.com'],
      },
    },
  },

  // StackOverflow - Query API pattern
  {
    source: 'stackoverflow',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'query-api',
      urlPatterns: [
        '^https?://(www\\.)?stackoverflow\\.com/questions/(\\d+)',
      ],
      endpointTemplate:
        'https://api.stackexchange.com/2.3/questions/{questionId}?site=stackoverflow&filter=withbody',
      extractors: [
        {
          name: 'questionId',
          source: 'path',
          pattern: '/questions/(\\d+)',
          group: 1,
        },
      ],
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'items[0].title',
        body: 'items[0].body',
        metadata: {
          score: 'items[0].score',
          answerCount: 'items[0].answer_count',
          tags: 'items[0].tags',
        },
      },
      validation: {
        requiredFields: ['items'],
        minContentLength: 50,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['stackoverflow.com'],
      },
    },
  },

  // Dev.to - Query API pattern
  {
    source: 'devto',
    initialConfidence: 1.0,
    initialSuccessCount: 1000,
    pattern: {
      templateType: 'query-api',
      urlPatterns: ['^https?://(www\\.)?dev\\.to/[^/]+/[^/]+'],
      endpointTemplate: 'https://dev.to/api/articles/{username}/{slug}',
      extractors: [
        {
          name: 'username',
          source: 'path',
          pattern: '^/([^/]+)',
          group: 1,
        },
        {
          name: 'slug',
          source: 'path',
          pattern: '^/[^/]+/([^/]+)',
          group: 1,
        },
      ],
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping: {
        title: 'title',
        description: 'description',
        body: 'body_markdown',
        metadata: {
          author: 'user.name',
          publishedAt: 'published_at',
          reactions: 'positive_reactions_count',
          comments: 'comments_count',
          tags: 'tags',
        },
      },
      validation: {
        requiredFields: ['id', 'title'],
        minContentLength: 100,
      },
      metrics: {
        successCount: 1000,
        failureCount: 0,
        confidence: 1.0,
        domains: ['dev.to'],
      },
    },
  },
];

// ============================================
// PATTERN REGISTRY
// ============================================

/**
 * Default configuration for the pattern registry
 */
const DEFAULT_CONFIG: PatternRegistryConfig = {
  filePath: './learned-patterns.json',
  maxPatterns: 500,
  minConfidenceThreshold: 0.1,
  archiveAfterDays: 90,
  autoPersist: true,
  persistDebounceMs: 5000,
};

/**
 * API Pattern Registry - stores and manages learned patterns
 */
export class ApiPatternRegistry {
  private patterns: Map<string, LearnedApiPattern> = new Map();
  private domainIndex: Map<string, Set<string>> = new Map();
  private templateIndex: Map<PatternTemplateType, Set<string>> = new Map();
  private listeners: Set<PatternLearningListener> = new Set();
  private store: PersistentStore<LearnedApiPattern[]>;
  private config: PatternRegistryConfig;
  private initialized = false;

  constructor(config: Partial<PatternRegistryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new PersistentStore<LearnedApiPattern[]>(
      this.config.filePath,
      {
        debounceMs: this.config.persistDebounceMs,
        componentName: 'ApiPatternRegistry',
      }
    );

    // Initialize template index
    for (const template of PATTERN_TEMPLATES) {
      this.templateIndex.set(template.type, new Set());
    }
  }

  /**
   * Initialize the registry, loading persisted patterns and bootstrapping
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load persisted patterns
    const persisted = await this.store.load();
    if (persisted) {
      for (const pattern of persisted) {
        this.addToIndexes(pattern);
      }
    }

    // Bootstrap with known patterns if registry is empty
    if (this.patterns.size === 0) {
      await this.bootstrap();
    }

    this.initialized = true;
    patternsLogger.info('ApiPatternRegistry initialized', {
      patterns: this.patterns.size,
      domains: this.domainIndex.size,
    });
  }

  /**
   * Bootstrap the registry with known patterns from existing handlers
   */
  private async bootstrap(): Promise<void> {
    patternsLogger.info('Bootstrapping pattern registry');

    for (const bootstrap of BOOTSTRAP_PATTERNS) {
      const pattern: LearnedApiPattern = {
        ...bootstrap.pattern,
        id: `bootstrap:${bootstrap.source}`,
        metrics: {
          ...bootstrap.pattern.metrics,
          successCount: bootstrap.initialSuccessCount,
          confidence: bootstrap.initialConfidence,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.addToIndexes(pattern);
      this.emit({
        type: 'pattern_learned',
        pattern,
        source: 'bootstrap',
      });
    }

    await this.persist();
  }

  /**
   * Add a pattern to the internal indexes
   */
  private addToIndexes(pattern: LearnedApiPattern): void {
    this.patterns.set(pattern.id, pattern);

    // Index by domain
    for (const domain of pattern.metrics.domains) {
      if (!this.domainIndex.has(domain)) {
        this.domainIndex.set(domain, new Set());
      }
      this.domainIndex.get(domain)!.add(pattern.id);
    }

    // Index by template type
    if (!this.templateIndex.has(pattern.templateType)) {
      this.templateIndex.set(pattern.templateType, new Set());
    }
    this.templateIndex.get(pattern.templateType)!.add(pattern.id);
  }

  /**
   * Persist patterns to disk
   */
  private async persist(): Promise<void> {
    if (this.config.autoPersist) {
      await this.store.save(Array.from(this.patterns.values()));
    }
  }

  /**
   * Emit a learning event to all listeners
   */
  private emit(event: PatternLearningEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        patternsLogger.error('Pattern listener error', { error });
      }
    }
  }

  /**
   * Subscribe to pattern learning events
   */
  subscribe(listener: PatternLearningListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get a pattern by ID
   */
  getPattern(id: string): LearnedApiPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get all patterns for a domain
   */
  getPatternsForDomain(domain: string): LearnedApiPattern[] {
    const patternIds = this.domainIndex.get(domain);
    if (!patternIds) return [];

    return Array.from(patternIds)
      .map((id) => this.patterns.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.metrics.confidence - a.metrics.confidence);
  }

  /**
   * Get all patterns of a specific template type
   */
  getPatternsByType(type: PatternTemplateType): LearnedApiPattern[] {
    const patternIds = this.templateIndex.get(type);
    if (!patternIds) return [];

    return Array.from(patternIds)
      .map((id) => this.patterns.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.metrics.confidence - a.metrics.confidence);
  }

  /**
   * Find patterns that match a URL
   * Optimized to check domain-indexed patterns first before falling back to all patterns
   */
  findMatchingPatterns(url: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const checkedPatternIds = new Set<string>();

    // Extract domain from URL
    let domain: string;
    try {
      domain = new URL(url).hostname;
    } catch {
      // Invalid URL, fall back to checking all patterns
      for (const pattern of this.patterns.values()) {
        const match = this.tryMatch(url, pattern);
        if (match) {
          matches.push(match);
        }
      }
      return matches.sort((a, b) => b.confidence - a.confidence);
    }

    // First, check patterns indexed for this specific domain (most likely to match)
    const domainPatternIds = this.domainIndex.get(domain);
    if (domainPatternIds) {
      for (const patternId of domainPatternIds) {
        checkedPatternIds.add(patternId);
        const pattern = this.patterns.get(patternId);
        if (pattern) {
          const match = this.tryMatch(url, pattern);
          if (match) {
            matches.push(match);
          }
        }
      }
    }

    // If we found matches from domain-indexed patterns, return early
    // This is the common case and avoids checking all patterns
    if (matches.length > 0) {
      return matches.sort((a, b) => b.confidence - a.confidence);
    }

    // Fall back to checking remaining patterns (for cross-domain pattern discovery)
    for (const pattern of this.patterns.values()) {
      if (checkedPatternIds.has(pattern.id)) continue;
      const match = this.tryMatch(url, pattern);
      if (match) {
        matches.push(match);
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Try to match a URL against a pattern
   */
  private tryMatch(url: string, pattern: LearnedApiPattern): PatternMatch | null {
    // Check if any URL pattern matches
    for (const urlPattern of pattern.urlPatterns) {
      try {
        const regex = new RegExp(urlPattern, 'i');
        if (!regex.test(url)) continue;

        // Extract variables
        const extractedVariables: Record<string, string> = {};
        let allExtracted = true;

        for (const extractor of pattern.extractors) {
          const value = this.extractVariable(url, extractor);
          if (value === null) {
            allExtracted = false;
            break;
          }
          extractedVariables[extractor.name] = value;
        }

        if (!allExtracted) continue;

        // Build API endpoint
        let apiEndpoint = pattern.endpointTemplate;

        // Handle special case where {url} is the template
        if (apiEndpoint === '{url}') {
          apiEndpoint = url;
        } else {
          // Replace variables in template (use replaceAll for multiple occurrences)
          for (const [name, value] of Object.entries(extractedVariables)) {
            apiEndpoint = apiEndpoint.replaceAll(`{${name}}`, value);
          }
        }

        return {
          pattern,
          confidence: pattern.metrics.confidence,
          extractedVariables,
          apiEndpoint,
          matchReason: `Matched pattern ${pattern.id} via ${urlPattern}`,
        };
      } catch (error) {
        patternsLogger.debug('Pattern match error', {
          pattern: pattern.id,
          url,
          error,
        });
      }
    }

    return null;
  }

  /**
   * Extract a variable from a URL using an extractor definition
   */
  private extractVariable(
    url: string,
    extractor: VariableExtractor
  ): string | null {
    try {
      const parsed = new URL(url);
      let source: string;

      switch (extractor.source) {
        case 'path':
          source = parsed.pathname;
          break;
        case 'query':
          source = parsed.search;
          break;
        case 'subdomain':
          source = parsed.hostname;
          break;
        case 'hostname':
          source = parsed.hostname;
          break;
        default:
          return null;
      }

      const regex = new RegExp(extractor.pattern);
      const match = source.match(regex);

      if (!match || !match[extractor.group]) {
        return null;
      }

      let value = match[extractor.group];

      // Apply transformation if specified
      if (extractor.transform) {
        switch (extractor.transform) {
          case 'lowercase':
            value = value.toLowerCase();
            break;
          case 'uppercase':
            value = value.toUpperCase();
            break;
          case 'urlencode':
            value = encodeURIComponent(value);
            break;
          case 'urldecode':
            value = decodeURIComponent(value);
            break;
        }
      }

      return value;
    } catch {
      return null;
    }
  }

  /**
   * Update pattern metrics after an application attempt
   */
  async updatePatternMetrics(
    patternId: string,
    success: boolean,
    domain: string,
    responseTime?: number,
    failureReason?: string
  ): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    const oldConfidence = pattern.metrics.confidence;

    if (success) {
      pattern.metrics.successCount++;
      pattern.metrics.lastSuccess = Date.now();
      if (responseTime) {
        // Use proper rolling average: newAvg = oldAvg + (newValue - oldAvg) / N
        const currentSuccessCount = pattern.metrics.successCount;
        const oldAverage = pattern.metrics.avgResponseTime ?? responseTime;
        pattern.metrics.avgResponseTime =
          oldAverage + (responseTime - oldAverage) / currentSuccessCount;
      }
      // Add domain if new
      if (!pattern.metrics.domains.includes(domain)) {
        pattern.metrics.domains.push(domain);
      }
    } else {
      pattern.metrics.failureCount++;
      pattern.metrics.lastFailure = Date.now();
      pattern.metrics.lastFailureReason = failureReason;
    }

    // Recalculate confidence
    const total =
      pattern.metrics.successCount + pattern.metrics.failureCount;
    pattern.metrics.confidence = pattern.metrics.successCount / total;

    pattern.updatedAt = Date.now();

    this.emit({
      type: 'pattern_applied',
      patternId,
      success,
      domain,
      responseTime: responseTime || 0,
    });

    if (Math.abs(pattern.metrics.confidence - oldConfidence) > 0.01) {
      this.emit({
        type: 'confidence_decayed',
        patternId,
        oldConfidence,
        newConfidence: pattern.metrics.confidence,
      });
    }

    await this.persist();
  }

  /**
   * Learn a new pattern from a successful extraction
   */
  async learnPattern(
    templateType: PatternTemplateType,
    sourceUrl: string,
    apiEndpoint: string,
    contentMapping: ContentMapping,
    validation: PatternValidation
  ): Promise<LearnedApiPattern> {
    const domain = new URL(sourceUrl).hostname;
    const id = `learned:${domain}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Infer extractors from the URL and endpoint
    const { extractors, extractedValues } = this.inferExtractors(
      sourceUrl,
      apiEndpoint
    );

    // Create URL pattern from source URL
    const urlPattern = this.createUrlPattern(sourceUrl);

    const pattern: LearnedApiPattern = {
      id,
      templateType,
      urlPatterns: [urlPattern],
      endpointTemplate: this.createEndpointTemplate(
        apiEndpoint,
        extractedValues
      ),
      extractors,
      method: 'GET',
      headers: { Accept: 'application/json' },
      responseFormat: 'json',
      contentMapping,
      validation,
      metrics: {
        successCount: 1,
        failureCount: 0,
        confidence: 0.5, // Start with moderate confidence
        domains: [domain],
        lastSuccess: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.addToIndexes(pattern);
    this.emit({
      type: 'pattern_learned',
      pattern,
      source: 'extraction',
    });

    await this.persist();
    return pattern;
  }

  /**
   * Learn from a successful API extraction event
   * Called by ContentIntelligence when an API strategy succeeds
   */
  async learnFromExtraction(event: ApiExtractionSuccess): Promise<LearnedApiPattern | null> {
    try {
      const domain = new URL(event.sourceUrl).hostname;

      // Check if we already have a pattern that matches this URL
      const existingMatches = this.findMatchingPatterns(event.sourceUrl);
      if (existingMatches.length > 0) {
        // We have an existing pattern - update its metrics
        const match = existingMatches[0];
        await this.updatePatternMetrics(
          match.pattern.id,
          true,
          domain,
          event.responseTime
        );
        patternsLogger.debug('Updated existing pattern metrics', {
          patternId: match.pattern.id,
          domain,
        });
        return match.pattern;
      }

      // No existing pattern - learn a new one
      const templateType = this.inferTemplateType(event.strategy, event.sourceUrl, event.apiUrl);
      if (!templateType) {
        patternsLogger.debug('Could not infer template type', {
          strategy: event.strategy,
          sourceUrl: event.sourceUrl,
        });
        return null;
      }

      // Infer content mapping from the extracted content
      const contentMapping = this.inferContentMapping(event.content);

      // Create validation rules based on what we extracted
      const validation: PatternValidation = {
        requiredFields: [],
        minContentLength: Math.min(event.content.text.length, 50),
      };

      // Learn the pattern
      const pattern = await this.learnPattern(
        templateType,
        event.sourceUrl,
        event.apiUrl,
        contentMapping,
        validation
      );

      patternsLogger.info('Learned new pattern from extraction', {
        patternId: pattern.id,
        templateType,
        sourceUrl: event.sourceUrl,
        apiUrl: event.apiUrl,
      });

      return pattern;
    } catch (error) {
      patternsLogger.error('Failed to learn from extraction', {
        error,
        sourceUrl: event.sourceUrl,
      });
      return null;
    }
  }

  /**
   * Infer the template type from a strategy name and URLs
   */
  private inferTemplateType(
    strategy: string,
    sourceUrl: string,
    apiUrl: string
  ): PatternTemplateType | null {
    // Map known strategies to template types
    const strategyToTemplate: Record<string, PatternTemplateType> = {
      'api:reddit': 'json-suffix',
      'api:npm': 'registry-lookup',
      'api:pypi': 'registry-lookup',
      'api:github': 'rest-resource',
      'api:wikipedia': 'rest-resource',
      'api:hackernews': 'firebase-rest',
      'api:stackoverflow': 'query-api',
      'api:devto': 'query-api',
    };

    // Check known strategies first
    if (strategyToTemplate[strategy]) {
      return strategyToTemplate[strategy];
    }

    // Try to infer from URL transformation
    if (apiUrl === sourceUrl + '.json') {
      return 'json-suffix';
    }

    // Check for common registry patterns
    if (apiUrl.includes('registry') || apiUrl.includes('/pypi/') || apiUrl.includes('/api/')) {
      const sourceHost = new URL(sourceUrl).hostname;
      const apiHost = new URL(apiUrl).hostname;
      if (sourceHost !== apiHost) {
        return 'registry-lookup';
      }
    }

    // Check for query parameters
    if (new URL(apiUrl).search && !new URL(sourceUrl).search) {
      return 'query-api';
    }

    // Default to rest-resource for api subdomain or /api/ path
    if (apiUrl.includes('api.') || apiUrl.includes('/api/')) {
      return 'rest-resource';
    }

    // Fallback to query-api as most general
    return 'query-api';
  }

  /**
   * Infer content mapping from extracted content
   */
  private inferContentMapping(content: ApiExtractionSuccess['content']): ContentMapping {
    const mapping: ContentMapping = {
      title: 'title',
    };

    if (content.text) {
      mapping.description = 'description';
    }

    if (content.markdown && content.markdown !== content.text) {
      mapping.body = 'body';
    }

    if (content.structured) {
      mapping.metadata = {};
      // Add structured data keys as metadata mappings
      for (const key of Object.keys(content.structured)) {
        mapping.metadata[key] = key;
      }
    }

    return mapping;
  }

  /**
   * Infer variable extractors from URL and endpoint comparison
   * Returns both the extractors and the actual values that were extracted
   */
  private inferExtractors(
    sourceUrl: string,
    apiEndpoint: string
  ): { extractors: VariableExtractor[]; extractedValues: Record<string, string> } {
    // This is a simplified implementation
    // A full implementation would do more sophisticated pattern matching
    const extractors: VariableExtractor[] = [];
    const extractedValues: Record<string, string> = {};
    const parsed = new URL(sourceUrl);
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    // Look for path segments that appear in the API endpoint
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (apiEndpoint.includes(part) && part.length > 2) {
        const varName = `var${i}`;
        extractors.push({
          name: varName,
          source: 'path',
          pattern:
            '^/' +
            pathParts
              .slice(0, i + 1)
              .map((p, j) => (j === i ? '([^/]+)' : p))
              .join('/'),
          group: 1,
        });
        extractedValues[varName] = part;
      }
    }

    return { extractors, extractedValues };
  }

  /**
   * Create a URL pattern from a source URL
   */
  private createUrlPattern(sourceUrl: string): string {
    const parsed = new URL(sourceUrl);
    const hostname = parsed.hostname.replace(/\./g, '\\.');

    // Create a pattern that matches similar URLs on the same domain
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const patternParts = pathParts.map((part, i) =>
      // Keep first part literal, make others wildcards
      i === 0 ? part : '[^/]+'
    );

    return `^https?://(www\\.)?${hostname}/${patternParts.join('/')}`;
  }

  /**
   * Create an endpoint template from an API endpoint and extracted values
   * Replaces actual values with {varName} placeholders
   */
  private createEndpointTemplate(
    apiEndpoint: string,
    extractedValues: Record<string, string>
  ): string {
    let template = apiEndpoint;

    // Replace each extracted value with its placeholder
    for (const [varName, value] of Object.entries(extractedValues)) {
      // Use replaceAll to handle multiple occurrences
      template = template.replaceAll(value, `{${varName}}`);
    }

    return template;
  }

  /**
   * Get registry statistics
   */
  getStats(): PatternRegistryStats {
    const patterns = Array.from(this.patterns.values());
    const byType: Record<PatternTemplateType, number> = {
      'json-suffix': 0,
      'registry-lookup': 0,
      'rest-resource': 0,
      'firebase-rest': 0,
      'query-api': 0,
    };

    let totalConfidence = 0;
    let highConfidenceCount = 0;
    let needsVerification = 0;
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    for (const pattern of patterns) {
      byType[pattern.templateType]++;
      totalConfidence += pattern.metrics.confidence;

      if (pattern.metrics.confidence > 0.8) {
        highConfidenceCount++;
      }

      if (
        !pattern.metrics.lastSuccess ||
        Date.now() - pattern.metrics.lastSuccess > ONE_WEEK
      ) {
        needsVerification++;
      }
    }

    return {
      totalPatterns: patterns.length,
      patternsByType: byType,
      domainsCovered: this.domainIndex.size,
      avgConfidence:
        patterns.length > 0 ? totalConfidence / patterns.length : 0,
      highConfidencePatterns: highConfidenceCount,
      patternsNeedingVerification: needsVerification,
      lastUpdated: patterns.reduce((max, p) => Math.max(max, p.updatedAt), 0),
    };
  }

  /**
   * Clean up stale patterns
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    const archiveThreshold =
      this.config.archiveAfterDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, pattern] of this.patterns) {
      const lastUsed = pattern.metrics.lastSuccess || pattern.createdAt;
      const isStale = now - lastUsed > archiveThreshold;
      const isBelowThreshold =
        pattern.metrics.confidence < this.config.minConfidenceThreshold;

      if (isStale || isBelowThreshold) {
        this.patterns.delete(id);
        this.emit({
          type: 'pattern_archived',
          patternId: id,
          reason: isStale ? 'stale' : 'low_confidence',
        });
        removed++;
      }
    }

    if (removed > 0) {
      await this.persist();
      patternsLogger.info('Cleaned up stale patterns', { removed });
    }

    return removed;
  }

  /**
   * Force persist immediately
   */
  async flush(): Promise<void> {
    await this.store.flush();
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get the template for a given type
 */
export function getPatternTemplate(
  type: PatternTemplateType
): ApiPatternTemplate | undefined {
  return PATTERN_TEMPLATES.find((t) => t.type === type);
}

/**
 * Suggest a template type for a URL based on indicators
 */
export function suggestTemplateType(url: string): PatternTemplateType | null {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  for (const template of PATTERN_TEMPLATES) {
    // Check domain patterns
    if (template.indicators.domainPatterns) {
      for (const domain of template.indicators.domainPatterns) {
        if (hostname.includes(domain.toLowerCase())) {
          return template.type;
        }
      }
    }

    // Check URL patterns
    if (template.indicators.urlPatterns) {
      for (const pattern of template.indicators.urlPatterns) {
        if (url.includes(pattern)) {
          return template.type;
        }
      }
    }
  }

  return null;
}
