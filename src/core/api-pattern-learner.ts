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
  ApiDomainGroup,
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
  PatternTransferOptions,
  PatternTransferResult,
  PatternValidation,
  SiteSimilarityScore,
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
// API DOMAIN GROUPS
// Groups of similar sites for cross-site pattern transfer
// ============================================

/**
 * API domain groups for cross-site pattern transfer.
 * Sites in the same group are more likely to have similar API patterns.
 */
// Static timestamp for domain groups (when this configuration was last updated)
const DOMAIN_GROUPS_LAST_UPDATED = new Date('2025-12-19T00:00:00Z').getTime();

export const API_DOMAIN_GROUPS: ApiDomainGroup[] = [
  {
    name: 'package_registries',
    domains: ['npmjs.com', 'registry.npmjs.org', 'pypi.org', 'rubygems.org', 'crates.io', 'packagist.org'],
    sharedPatterns: {
      pathPatterns: ['/package/', '/project/', '/crate/', '/packages/'],
      responseFields: ['name', 'version', 'description', 'author', 'license'],
      authType: 'none',
    },
    commonTemplateTypes: ['registry-lookup'],
    lastUpdated: DOMAIN_GROUPS_LAST_UPDATED,
  },
  {
    name: 'code_hosting',
    domains: ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'],
    sharedPatterns: {
      pathPatterns: ['/repos/', '/projects/', '/users/', '/api/'],
      responseFields: ['id', 'name', 'full_name', 'description', 'created_at'],
      authType: 'bearer',
    },
    commonTemplateTypes: ['rest-resource'],
    lastUpdated: DOMAIN_GROUPS_LAST_UPDATED,
  },
  {
    name: 'qa_forums',
    domains: ['stackoverflow.com', 'stackexchange.com', 'serverfault.com', 'superuser.com', 'askubuntu.com'],
    sharedPatterns: {
      pathPatterns: ['/questions/', '/answers/', '/users/'],
      responseFields: ['items', 'question_id', 'answer_id', 'body', 'title'],
      authType: 'api_key',
    },
    commonTemplateTypes: ['query-api'],
    lastUpdated: DOMAIN_GROUPS_LAST_UPDATED,
  },
  {
    name: 'knowledge_bases',
    domains: ['wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'wikiquote.org'],
    sharedPatterns: {
      pathPatterns: ['/wiki/', '/api/rest_v1/'],
      responseFields: ['title', 'extract', 'pageid', 'content'],
      authType: 'none',
    },
    commonTemplateTypes: ['rest-resource'],
    lastUpdated: DOMAIN_GROUPS_LAST_UPDATED,
  },
  {
    name: 'social_news',
    domains: ['reddit.com', 'old.reddit.com', 'news.ycombinator.com', 'lobste.rs'],
    sharedPatterns: {
      pathPatterns: ['/r/', '/comments/', '/item', '/s/'],
      responseFields: ['title', 'text', 'score', 'by', 'author'],
      authType: 'none',
    },
    commonTemplateTypes: ['json-suffix', 'firebase-rest'],
    lastUpdated: DOMAIN_GROUPS_LAST_UPDATED,
  },
  {
    name: 'developer_blogs',
    domains: ['dev.to', 'medium.com', 'hashnode.com', 'substack.com'],
    sharedPatterns: {
      pathPatterns: ['/api/articles/', '/@', '/p/'],
      responseFields: ['title', 'body', 'body_markdown', 'author', 'published_at'],
      authType: 'none',
    },
    commonTemplateTypes: ['query-api'],
    lastUpdated: DOMAIN_GROUPS_LAST_UPDATED,
  },
];

// ============================================
// CROSS-SITE TRANSFER CONSTANTS
// ============================================

/** Default minimum similarity for pattern transfer */
const DEFAULT_MIN_SIMILARITY = 0.3;

/** Default confidence decay when transferring patterns */
const DEFAULT_CONFIDENCE_DECAY = 0.5;

/** Confidence boost multiplier when a transferred pattern succeeds */
const TRANSFERRED_CONFIDENCE_BOOST = 1.3;

/** Confidence penalty multiplier when a transferred pattern fails */
const TRANSFERRED_CONFIDENCE_PENALTY = 0.6;

/** Weights for similarity score components */
const SIMILARITY_WEIGHTS = {
  urlStructure: 0.25,
  responseFormat: 0.15,
  templateType: 0.35,
  domainGroup: 0.25,
};

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

    // Parse URLs once and reuse
    const parsedSourceUrl = new URL(sourceUrl);
    const parsedApiUrl = new URL(apiUrl);

    // Check for common registry patterns
    if (apiUrl.includes('registry') || apiUrl.includes('/pypi/') || apiUrl.includes('/api/')) {
      if (parsedSourceUrl.hostname !== parsedApiUrl.hostname) {
        return 'registry-lookup';
      }
    }

    // Check for query parameters
    if (parsedApiUrl.search && !parsedSourceUrl.search) {
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
   * Searches for extracted values within the structured response to find their JSON paths
   */
  private inferContentMapping(content: ApiExtractionSuccess['content']): ContentMapping {
    const mapping: ContentMapping = {
      title: 'title', // Default, may be overwritten if found in structured data
    };

    if (content.structured) {
      // Search for where the title value appears in the structured data
      const titlePath = this.findValuePath(content.structured, content.title);
      if (titlePath) {
        mapping.title = titlePath;
      }

      // Search for where the text/description value appears
      if (content.text) {
        const textPath = this.findValuePath(content.structured, content.text);
        mapping.description = textPath || 'description';
      }

      // Search for where the markdown/body value appears
      if (content.markdown && content.markdown !== content.text) {
        const bodyPath = this.findValuePath(content.structured, content.markdown);
        mapping.body = bodyPath || 'body';
      }

      // For metadata, map top-level keys to their paths
      mapping.metadata = {};
      for (const key of Object.keys(content.structured)) {
        mapping.metadata[key] = key;
      }
    } else {
      // No structured data to search, use default mappings
      if (content.text) {
        mapping.description = 'description';
      }
      if (content.markdown && content.markdown !== content.text) {
        mapping.body = 'body';
      }
    }

    return mapping;
  }

  /**
   * Recursively search for a value within an object and return its JSON path
   * Returns null if the value is not found
   */
  private findValuePath(obj: unknown, target: unknown, path = ''): string | null {
    // Don't search for empty or very short strings
    if (typeof target === 'string' && target.length < 3) {
      return null;
    }

    // Direct match at current path
    if (obj === target) {
      return path || null;
    }

    // Can't recurse into non-objects
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    // Search through object properties
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      const found = this.findValuePath(value, target, newPath);
      if (found) {
        return found;
      }
    }

    return null;
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

  // ============================================
  // CROSS-SITE TRANSFER METHODS (L-005)
  // ============================================

  /**
   * Get the API domain group for a domain
   */
  getApiDomainGroup(domain: string): ApiDomainGroup | null {
    for (const group of API_DOMAIN_GROUPS) {
      if (group.domains.some(d => domain.includes(d) || d.includes(domain))) {
        return group;
      }
    }
    return null;
  }

  /**
   * Calculate similarity score between a source pattern and a target domain
   */
  calculateSimilarity(
    sourcePattern: LearnedApiPattern,
    targetDomain: string
  ): SiteSimilarityScore {
    const sourceDomain = sourcePattern.metrics.domains[0] || '';
    const sourceGroup = this.getApiDomainGroup(sourceDomain);
    const targetGroup = this.getApiDomainGroup(targetDomain);

    // URL structure similarity - check if path patterns might match
    let urlStructure = 0;
    for (const urlPattern of sourcePattern.urlPatterns) {
      // Extract path-like components from the pattern (including numbers for versioned APIs)
      const pathMatch = urlPattern.match(/\/([a-z0-9_-]+)/i);
      if (pathMatch) {
        // If the target domain is in the same group, paths are likely similar
        if (sourceGroup && targetGroup && sourceGroup.name === targetGroup.name) {
          urlStructure = 0.8;
          break;
        }
        urlStructure = 0.3; // Base similarity for having path patterns
      }
    }

    // Response format similarity - JSON is most common, so same format is a bonus
    const responseFormat = sourcePattern.responseFormat === 'json' ? 0.8 : 0.5;

    // Template type compatibility - if target domain's group uses same template types
    let templateType = 0;
    if (targetGroup?.commonTemplateTypes?.includes(sourcePattern.templateType)) {
      templateType = 1.0;
    }
    // Note: We only check if target's group supports the template type, not source's group,
    // because source group compatibility doesn't tell us anything about the target domain.

    // Domain group match - strongest indicator of similarity
    let domainGroup = 0;
    if (sourceGroup && targetGroup && sourceGroup.name === targetGroup.name) {
      domainGroup = 1.0;
    } else if (sourceGroup || targetGroup) {
      // One is in a group, the other isn't - partial match
      domainGroup = 0.2;
    }

    // Calculate weighted overall score
    const overall =
      urlStructure * SIMILARITY_WEIGHTS.urlStructure +
      responseFormat * SIMILARITY_WEIGHTS.responseFormat +
      templateType * SIMILARITY_WEIGHTS.templateType +
      domainGroup * SIMILARITY_WEIGHTS.domainGroup;

    // Build explanation
    const explanationParts: string[] = [];
    if (domainGroup === 1.0) {
      explanationParts.push(`both in '${sourceGroup!.name}' group`);
    }
    if (templateType >= 0.5) {
      explanationParts.push(`compatible template type '${sourcePattern.templateType}'`);
    }
    if (urlStructure >= 0.5) {
      explanationParts.push('similar URL structure');
    }
    if (responseFormat >= 0.7) {
      explanationParts.push('JSON response format');
    }

    return {
      overall,
      urlStructure,
      responseFormat,
      templateType,
      domainGroup,
      explanation: explanationParts.length > 0
        ? `Similarity based on: ${explanationParts.join(', ')}`
        : 'Low similarity - no matching indicators',
    };
  }

  /**
   * Find patterns that can potentially be transferred to a target domain
   * Returns patterns from similar sites that might work for the target
   */
  findTransferablePatterns(
    targetDomain: string,
    options: PatternTransferOptions = {}
  ): Array<{ pattern: LearnedApiPattern; similarity: SiteSimilarityScore }> {
    const minSimilarity = options.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
    const results: Array<{ pattern: LearnedApiPattern; similarity: SiteSimilarityScore }> = [];

    // Skip if we already have patterns for this domain
    if (this.domainIndex.has(targetDomain)) {
      return results;
    }

    // Check all patterns for transferability
    for (const pattern of this.patterns.values()) {
      // Skip patterns that already include this domain
      if (pattern.metrics.domains.includes(targetDomain)) {
        continue;
      }

      const similarity = this.calculateSimilarity(pattern, targetDomain);
      if (similarity.overall >= minSimilarity) {
        results.push({ pattern, similarity });
      }
    }

    // Sort by similarity (highest first)
    return results.sort((a, b) => b.similarity.overall - a.similarity.overall);
  }

  /**
   * Transfer a pattern to a new target domain
   * Creates a new pattern derived from the source with reduced confidence
   */
  async transferPattern(
    sourcePatternId: string,
    targetDomain: string,
    targetUrlPattern: string,
    options: PatternTransferOptions = {}
  ): Promise<PatternTransferResult> {
    const minSimilarity = options.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
    const confidenceDecay = options.confidenceDecay ?? DEFAULT_CONFIDENCE_DECAY;

    const sourcePattern = this.patterns.get(sourcePatternId);
    if (!sourcePattern) {
      return {
        success: false,
        similarityScore: {
          overall: 0,
          urlStructure: 0,
          responseFormat: 0,
          templateType: 0,
          domainGroup: 0,
          explanation: 'Source pattern not found',
        },
        transferredConfidence: 0,
        reason: `Source pattern '${sourcePatternId}' not found`,
      };
    }

    // Calculate similarity
    const similarity = this.calculateSimilarity(sourcePattern, targetDomain);
    if (similarity.overall < minSimilarity) {
      return {
        success: false,
        similarityScore: similarity,
        transferredConfidence: 0,
        reason: `Similarity ${similarity.overall.toFixed(2)} below minimum ${minSimilarity}`,
      };
    }

    // Calculate transferred confidence with decay
    const transferredConfidence = sourcePattern.metrics.confidence * confidenceDecay;

    // Create the transferred pattern with deep copy to prevent mutations to source
    // JSON parse/stringify creates a true deep copy of all nested objects
    const sourceDeepCopy = JSON.parse(JSON.stringify(sourcePattern)) as LearnedApiPattern;
    const transferredPattern: LearnedApiPattern = {
      ...sourceDeepCopy,
      id: `transfer:${sourcePatternId}:${targetDomain}:${Date.now()}`,
      urlPatterns: [targetUrlPattern],
      metrics: {
        ...sourceDeepCopy.metrics,
        successCount: 0,
        failureCount: 0,
        lastSuccess: undefined,
        lastFailure: undefined,
        lastFailureReason: undefined,
        confidence: transferredConfidence,
        domains: [targetDomain],
        avgResponseTime: undefined,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Add to registry
    this.addToIndexes(transferredPattern);
    await this.persist();

    // Emit learning event
    this.emit({
      type: 'pattern_learned',
      pattern: transferredPattern,
      source: 'transfer',
    });

    patternsLogger.info('Pattern transferred', {
      sourcePatternId,
      newPatternId: transferredPattern.id,
      targetDomain,
      similarity: similarity.overall,
      transferredConfidence,
    });

    return {
      success: true,
      newPatternId: transferredPattern.id,
      transferredPattern,
      similarityScore: similarity,
      transferredConfidence,
      reason: `Successfully transferred pattern from ${sourcePattern.metrics.domains[0]} to ${targetDomain}`,
    };
  }

  /**
   * Automatically transfer applicable patterns to a new domain
   * Called when visiting a domain without existing patterns
   */
  async autoTransferPatterns(
    targetDomain: string,
    targetUrl: string,
    options: PatternTransferOptions = {}
  ): Promise<PatternTransferResult[]> {
    const results: PatternTransferResult[] = [];

    // Find transferable patterns
    const transferable = this.findTransferablePatterns(targetDomain, options);
    if (transferable.length === 0) {
      patternsLogger.debug('No transferable patterns found', { targetDomain });
      return results;
    }

    // Transfer the top patterns (limit to avoid too many)
    const maxTransfers = 3;
    for (const { pattern, similarity } of transferable.slice(0, maxTransfers)) {
      // Generate URL pattern for the target domain
      const targetUrlPattern = this.generateUrlPatternForDomain(targetDomain, targetUrl, pattern);

      const result = await this.transferPattern(
        pattern.id,
        targetDomain,
        targetUrlPattern,
        options
      );

      results.push(result);

      // If one succeeds, that's often enough
      if (result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Generate a URL pattern for a new domain based on the source pattern
   */
  private generateUrlPatternForDomain(
    targetDomain: string,
    targetUrl: string,
    _sourcePattern: LearnedApiPattern
  ): string {
    // Escape the target domain for regex
    const escapedDomain = targetDomain.replace(/\./g, '\\.');

    // Try to extract path structure from the target URL
    try {
      const parsed = new URL(targetUrl);
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      if (pathParts.length > 0) {
        // Create a pattern that matches the path structure
        // Replace specific IDs/slugs with wildcards
        const patternPath = pathParts.map(part => {
          // If it looks like an ID (all numbers, or UUID-like), use a wildcard
          if (/^\d+$/.test(part) || /^[a-f0-9-]{8,}$/i.test(part)) {
            return '[^/]+';
          }
          // Keep the literal part
          return part;
        }).join('/');

        // Anchor pattern to domain and path start to avoid over-matching
        return `^https?://(www\\.)?${escapedDomain}/${patternPath}`;
      }
    } catch {
      // If URL parsing fails, just use the domain
    }

    // Fallback: match the domain with any path, properly anchored
    return `^https?://(www\\.)?${escapedDomain}/.*`;
  }

  /**
   * Record the outcome of using a transferred pattern
   * Boosts confidence on success, reduces on failure
   */
  async recordTransferOutcome(
    patternId: string,
    success: boolean,
    domain: string,
    responseTime: number,
    failureReason?: string
  ): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      return;
    }

    // Check if this is a transferred pattern
    const isTransferred = patternId.startsWith('transfer:');

    // Update metrics (slightly different for transferred patterns)
    await this.updatePatternMetrics(
      patternId,
      success,
      domain,
      responseTime,
      failureReason
    );

    // For transferred patterns, apply additional confidence adjustments
    if (isTransferred) {
      const updatedPattern = this.patterns.get(patternId);
      if (updatedPattern) {
        if (success) {
          // Successful transfer - boost confidence significantly
          const newConfidence = Math.min(1.0, updatedPattern.metrics.confidence * TRANSFERRED_CONFIDENCE_BOOST);
          updatedPattern.metrics.confidence = newConfidence;

          patternsLogger.info('Transferred pattern validated', {
            patternId,
            domain,
            newConfidence,
          });
        } else {
          // Failed transfer - reduce confidence more aggressively
          const newConfidence = Math.max(0, updatedPattern.metrics.confidence * TRANSFERRED_CONFIDENCE_PENALTY);
          updatedPattern.metrics.confidence = newConfidence;

          patternsLogger.debug('Transferred pattern failed', {
            patternId,
            domain,
            newConfidence,
            reason: failureReason,
          });
        }

        updatedPattern.updatedAt = Date.now();
        await this.persist();
      }
    }
  }

  /**
   * Get all API domain groups
   */
  getApiDomainGroups(): ApiDomainGroup[] {
    return API_DOMAIN_GROUPS;
  }

  // ============================================
  // OPENAPI DISCOVERY METHODS (L-006)
  // ============================================

  /**
   * Discover and learn patterns from OpenAPI/Swagger specification
   * Probes common locations for specs and generates patterns from found endpoints
   */
  async discoverFromOpenAPI(
    domain: string,
    options?: import('../types/api-patterns.js').OpenAPIDiscoveryOptions
  ): Promise<import('../types/api-patterns.js').OpenAPIPatternGenerationResult | null> {
    const { discoverOpenAPICached, generatePatternsFromOpenAPISpec } = await import('./openapi-discovery.js');

    const discovery = await discoverOpenAPICached(domain, options);

    if (!discovery.found || !discovery.spec) {
      patternsLogger.debug('No OpenAPI spec found for domain', { domain });
      return null;
    }

    // Generate patterns from the spec
    const patterns = generatePatternsFromOpenAPISpec(discovery.spec);

    // Add each pattern to the registry
    const patternIds: string[] = [];
    for (const pattern of patterns) {
      this.addToIndexes(pattern);
      patternIds.push(pattern.id);

      this.emit({
        type: 'pattern_learned',
        pattern,
        source: 'extraction', // OpenAPI is a form of structured extraction
      });
    }

    await this.persist();

    patternsLogger.info('Learned patterns from OpenAPI spec', {
      domain,
      specUrl: discovery.specUrl,
      patterns: patterns.length,
    });

    return {
      patternsGenerated: patterns.length,
      patternIds,
      skippedEndpoints: [],
      warnings: [],
    };
  }

  /**
   * Check if we have OpenAPI-derived patterns for a domain
   */
  hasOpenAPIPatterns(domain: string): boolean {
    const patterns = this.getPatternsForDomain(domain);
    return patterns.some(p => p.id.startsWith('openapi:'));
  }

  /**
   * Get all OpenAPI-derived patterns for a domain
   */
  getOpenAPIPatterns(domain: string): LearnedApiPattern[] {
    return this.getPatternsForDomain(domain).filter(p => p.id.startsWith('openapi:'));
  }

  // ============================================
  // FAILURE LEARNING METHODS (L-007)
  // ============================================

  /** Anti-patterns learned from repeated failures */
  private antiPatterns: Map<string, import('../types/api-patterns.js').AntiPattern> = new Map();

  /**
   * Secondary index for O(1) anti-pattern lookup by pattern+category
   * Maps `${patternId}:${category}` to anti-pattern ID
   */
  private antiPatternIndex: Map<string, string> = new Map();

  /**
   * Record a pattern failure with classification
   * Returns the failure classification for use in retry logic
   */
  async recordPatternFailure(
    patternId: string,
    domain: string,
    attemptedUrl: string,
    statusCode: number | undefined,
    errorMessage: string,
    responseTime?: number
  ): Promise<import('../types/api-patterns.js').FailureClassification> {
    const { classifyFailure, createFailureRecord, logFailure } = await import('./failure-learning.js');

    // Classify the failure
    const classification = classifyFailure(statusCode, errorMessage, responseTime);

    // Log the failure
    logFailure(classification, {
      domain,
      url: attemptedUrl,
      patternId,
      statusCode,
    });

    // Create failure record
    const failureRecord = createFailureRecord(
      classification,
      domain,
      attemptedUrl,
      patternId,
      statusCode,
      responseTime
    );

    // Update pattern metrics with extended failure tracking
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      // Update basic metrics
      await this.updatePatternMetrics(patternId, false, domain, responseTime, errorMessage);

      // Update extended failure tracking
      await this.updatePatternFailureTracking(patternId, failureRecord);

      // Check if we should create an anti-pattern
      if (classification.shouldCreateAntiPattern) {
        await this.maybeCreateAntiPattern(patternId, domain, classification.category);
      }
    }

    return classification;
  }

  /**
   * Update extended failure tracking for a pattern
   */
  private async updatePatternFailureTracking(
    patternId: string,
    failureRecord: import('../types/api-patterns.js').FailureRecord
  ): Promise<void> {
    const {
      createEmptyFailureCounts,
      incrementFailureCount,
      addFailureRecord,
    } = await import('./failure-learning.js');

    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    // Initialize extended metrics if needed
    const extendedMetrics = pattern.metrics as import('../types/api-patterns.js').ExtendedPatternMetrics;

    if (!extendedMetrics.failuresByCategory) {
      extendedMetrics.failuresByCategory = createEmptyFailureCounts();
    }
    if (!extendedMetrics.recentFailures) {
      extendedMetrics.recentFailures = [];
    }

    // Update category counts
    extendedMetrics.failuresByCategory = incrementFailureCount(
      extendedMetrics.failuresByCategory,
      failureRecord.category
    );

    // Add to recent failures
    extendedMetrics.recentFailures = addFailureRecord(
      extendedMetrics.recentFailures,
      failureRecord
    );

    pattern.updatedAt = Date.now();
    await this.persist();
  }

  /**
   * Check if an anti-pattern should be created and create it
   */
  private async maybeCreateAntiPattern(
    patternId: string,
    domain: string,
    category: import('../types/api-patterns.js').FailureCategory
  ): Promise<void> {
    const {
      countRecentFailuresByCategory,
      createAntiPattern,
      updateAntiPattern,
    } = await import('./failure-learning.js');
    const { ANTI_PATTERN_THRESHOLDS } = await import('../types/api-patterns.js');

    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    const extendedMetrics = pattern.metrics as import('../types/api-patterns.js').ExtendedPatternMetrics;
    const recentFailures = extendedMetrics.recentFailures || [];

    // Count recent failures of this category
    const categoryCount = countRecentFailuresByCategory(recentFailures, category);

    if (categoryCount >= ANTI_PATTERN_THRESHOLDS.minFailures) {
      // Check if we already have an anti-pattern for this using O(1) index lookup
      const indexKey = `${patternId}:${category}`;
      const existingAntiPatternId = this.antiPatternIndex.get(indexKey);
      const existingAntiPattern = existingAntiPatternId
        ? this.antiPatterns.get(existingAntiPatternId)
        : undefined;

      if (existingAntiPattern) {
        // Update existing anti-pattern
        const latestFailure = recentFailures[recentFailures.length - 1];
        const updated = updateAntiPattern(existingAntiPattern, latestFailure);
        this.antiPatterns.set(updated.id, updated);

        patternsLogger.debug('Updated anti-pattern', {
          antiPatternId: updated.id,
          patternId,
          category,
          failureCount: updated.failureCount,
        });
      } else {
        // Create new anti-pattern
        const failuresOfCategory = recentFailures.filter(f => f.category === category);
        const newAntiPattern = createAntiPattern(failuresOfCategory, patternId);

        if (newAntiPattern) {
          this.antiPatterns.set(newAntiPattern.id, newAntiPattern);

          // Add to secondary index for O(1) lookup
          this.antiPatternIndex.set(indexKey, newAntiPattern.id);

          // Track anti-pattern ID in pattern metrics
          if (!extendedMetrics.activeAntiPatterns) {
            extendedMetrics.activeAntiPatterns = [];
          }
          extendedMetrics.activeAntiPatterns.push(newAntiPattern.id);

          patternsLogger.info('Created anti-pattern from failures', {
            antiPatternId: newAntiPattern.id,
            patternId,
            category,
            domains: newAntiPattern.domains,
            failureCount: newAntiPattern.failureCount,
          });

          this.emit({
            type: 'anti_pattern_created',
            antiPattern: newAntiPattern,
          });
        }
      }

      await this.persist();
    }
  }

  /**
   * Check if a URL matches any active anti-patterns
   * Returns matching anti-patterns if found
   */
  async checkAntiPatterns(
    url: string
  ): Promise<import('../types/api-patterns.js').AntiPattern[]> {
    const { matchAntiPatterns, isAntiPatternActive } = await import('./failure-learning.js');

    // Clean up expired anti-patterns first
    for (const [id, antiPattern] of this.antiPatterns) {
      if (!isAntiPatternActive(antiPattern)) {
        this.antiPatterns.delete(id);
        // Also remove from secondary index
        if (antiPattern.sourcePatternId) {
          const indexKey = `${antiPattern.sourcePatternId}:${antiPattern.failureCategory}`;
          this.antiPatternIndex.delete(indexKey);
        }
        patternsLogger.debug('Removed expired anti-pattern', { antiPatternId: id });
      }
    }

    return matchAntiPatterns(url, [...this.antiPatterns.values()]);
  }

  /**
   * Get retry strategy for a failed pattern
   */
  async getRetryStrategy(
    patternId: string,
    attemptNumber: number
  ): Promise<{
    shouldRetry: boolean;
    waitMs: number;
    strategy: import('../types/api-patterns.js').RetryStrategy;
  }> {
    const {
      shouldRetry,
      calculateRetryWait,
      getRetryStrategy,
    } = await import('./failure-learning.js');

    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      return { shouldRetry: false, waitMs: 0, strategy: 'none' };
    }

    const extendedMetrics = pattern.metrics as import('../types/api-patterns.js').ExtendedPatternMetrics;
    const recentFailures = extendedMetrics.recentFailures || [];

    // Get the most recent failure category
    const latestFailure = recentFailures[recentFailures.length - 1];
    if (!latestFailure) {
      return { shouldRetry: false, waitMs: 0, strategy: 'none' };
    }

    const category = latestFailure.category;
    const retry = shouldRetry(category, attemptNumber);
    const waitMs = retry ? calculateRetryWait(category, attemptNumber) : 0;
    const strategy = getRetryStrategy(category);

    return {
      shouldRetry: retry && waitMs >= 0,
      waitMs: waitMs >= 0 ? waitMs : 0,
      strategy,
    };
  }

  /**
   * Analyze pattern health based on failure history
   */
  async analyzePatternHealth(
    patternId: string
  ): Promise<{
    isHealthy: boolean;
    dominantFailureType: import('../types/api-patterns.js').FailureCategory | null;
    suggestedAction: import('../types/api-patterns.js').RetryStrategy;
    reason: string;
  }> {
    const { analyzePatternHealth } = await import('./failure-learning.js');

    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      return {
        isHealthy: true,
        dominantFailureType: null,
        suggestedAction: 'none',
        reason: 'Pattern not found',
      };
    }

    const extendedMetrics = pattern.metrics as import('../types/api-patterns.js').ExtendedPatternMetrics;
    const recentFailures = extendedMetrics.recentFailures || [];

    return analyzePatternHealth(
      recentFailures,
      pattern.metrics.successCount,
      pattern.metrics.failureCount
    );
  }

  /**
   * Get all active anti-patterns
   */
  getActiveAntiPatterns(): import('../types/api-patterns.js').AntiPattern[] {
    return [...this.antiPatterns.values()];
  }

  /**
   * Clear an anti-pattern (e.g., after user provides authentication)
   */
  async clearAntiPattern(antiPatternId: string): Promise<boolean> {
    const antiPattern = this.antiPatterns.get(antiPatternId);
    const deleted = this.antiPatterns.delete(antiPatternId);
    if (deleted && antiPattern) {
      // Also remove from secondary index
      if (antiPattern.sourcePatternId) {
        const indexKey = `${antiPattern.sourcePatternId}:${antiPattern.failureCategory}`;
        this.antiPatternIndex.delete(indexKey);
      }
      await this.persist();
      patternsLogger.info('Cleared anti-pattern', { antiPatternId });
    }
    return deleted;
  }

  /**
   * Get failure summary for a pattern
   */
  async getPatternFailureSummary(
    patternId: string
  ): Promise<string> {
    const { getFailureSummary, createEmptyFailureCounts } = await import('./failure-learning.js');

    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      return 'Pattern not found';
    }

    const extendedMetrics = pattern.metrics as import('../types/api-patterns.js').ExtendedPatternMetrics;
    const counts = extendedMetrics.failuresByCategory || createEmptyFailureCounts();

    return getFailureSummary(counts);
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
