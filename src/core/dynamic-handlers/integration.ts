/**
 * Dynamic Handler Integration
 *
 * Connects the DynamicHandlerRegistry with ContentIntelligence and TieredFetcher.
 * This module:
 * 1. Records observations from successful extractions
 * 2. Records failures to learn quirks
 * 3. Provides extraction strategies from learned handlers
 */

import { logger } from '../../utils/logger.js';
import { DynamicHandlerRegistry, dynamicHandlerRegistry } from './registry.js';
import { detectTemplate, getTemplateConfig, PATTERN_TEMPLATES } from './pattern-templates.js';
import { createPersistentRegistry, AutoSaveRegistry } from './persistence.js';
import type {
  ExtractionObservation,
  HandlerTemplate,
  SiteQuirks,
  ExtractionRule,
  ApiPattern,
} from './types.js';
import type { ExtractionStrategy, ContentResult } from '../content-intelligence.js';

const log = logger.intelligence;

/**
 * Context for an extraction attempt
 */
export interface ExtractionContext {
  url: string;
  domain: string;
  html?: string;
  headers?: Record<string, string>;
}

/**
 * Recommendation from the dynamic handler system
 */
export interface ExtractionRecommendation {
  /** Recommended template type */
  template: HandlerTemplate;
  /** Site-specific quirks to apply */
  quirks?: SiteQuirks;
  /** Custom extraction rules */
  rules: ExtractionRule[];
  /** Discovered API patterns */
  apis: ApiPattern[];
  /** Confidence in this recommendation */
  confidence: number;
  /** Whether stealth mode is recommended */
  needsStealth: boolean;
  /** Recommended headers */
  headers?: Record<string, string>;
  /** Rate limit to apply (requests per second) */
  rateLimit?: number;
}

/**
 * Dynamic Handler Integration
 *
 * Provides methods to integrate the dynamic handler system with
 * ContentIntelligence and TieredFetcher.
 */
export class DynamicHandlerIntegration {
  private registry: DynamicHandlerRegistry;
  private autoSave: AutoSaveRegistry | null = null;

  constructor(registry?: DynamicHandlerRegistry) {
    this.registry = registry || dynamicHandlerRegistry;
  }

  /**
   * Enable auto-save persistence
   */
  enablePersistence(options?: {
    path?: string;
    saveDelayMs?: number;
  }): void {
    const { autoSave } = createPersistentRegistry(this.registry, {
      ...options,
      autoLoad: true, // Load existing data
    });
    this.autoSave = autoSave;
  }

  /**
   * Get extraction recommendation for a URL
   *
   * Call this before attempting extraction to get guidance
   * on the best approach for this site.
   */
  getRecommendation(context: ExtractionContext): ExtractionRecommendation {
    const { url, domain, html, headers } = context;

    // Get approach from registry
    const approach = this.registry.getExtractionApproach(url, html);

    // Get quirks
    const quirks = this.registry.getQuirks(domain);

    // Build recommendation
    return {
      template: approach.template,
      quirks,
      rules: approach.rules,
      apis: approach.apis,
      confidence: approach.confidence,
      needsStealth: quirks?.stealth?.required || false,
      headers: quirks?.requiredHeaders,
      rateLimit: quirks?.rateLimit?.requestsPerSecond,
    };
  }

  /**
   * Record a successful extraction
   *
   * Call this after ContentIntelligence successfully extracts content
   * to teach the system about this site.
   */
  recordSuccess(
    url: string,
    strategy: ExtractionStrategy,
    result: ContentResult,
    details?: {
      html?: string;
      apiCalls?: Array<{
        url: string;
        method: string;
        status: number;
        responseType: string;
      }>;
      selectorsUsed?: string[];
      jsonPaths?: string[];
      duration: number;
    }
  ): void {
    const domain = this.extractDomain(url);

    const observation: ExtractionObservation = {
      url,
      domain,
      strategy,
      extracted: {
        title: result.content.title,
        content: result.content.text,
        structured: result.content.structured,
      },
      apiCalls: details?.apiCalls,
      selectorsUsed: details?.selectorsUsed,
      jsonPaths: details?.jsonPaths,
      duration: details?.duration || result.meta.timing,
      timestamp: Date.now(),
    };

    this.registry.recordObservation(observation);

    // Mark dirty for auto-save
    this.autoSave?.markDirty();

    log.debug('Recorded extraction success', {
      domain,
      strategy,
      contentLength: result.content.text.length,
    });
  }

  /**
   * Record an extraction failure
   *
   * Call this when extraction fails to learn quirks about the site.
   */
  recordFailure(
    url: string,
    error: string,
    context: {
      statusCode?: number;
      headers?: Record<string, string>;
      strategy?: string;
      duration?: number;
    }
  ): void {
    this.registry.recordFailure(url, error, context);

    // Mark dirty for auto-save
    this.autoSave?.markDirty();

    log.debug('Recorded extraction failure', {
      url,
      error: error.substring(0, 100),
      statusCode: context.statusCode,
    });
  }

  /**
   * Check if the system has learned about a domain
   */
  hasLearnedDomain(domain: string): boolean {
    return this.registry.hasLearnedDomain(domain);
  }

  /**
   * Get quirks for a domain
   */
  getQuirks(domain: string): SiteQuirks | undefined {
    return this.registry.getQuirks(domain);
  }

  /**
   * Manually update quirks for a domain
   */
  updateQuirks(domain: string, quirks: Partial<SiteQuirks>): void {
    this.registry.updateQuirks(domain, quirks);
    this.autoSave?.markDirty();
  }

  /**
   * Get statistics about what the system has learned
   */
  getStats(): {
    totalHandlers: number;
    totalQuirks: number;
    totalObservations: number;
    topDomains: Array<{ domain: string; observations: number }>;
  } {
    return this.registry.getStats();
  }

  /**
   * Force save (useful before shutdown)
   */
  save(): void {
    this.autoSave?.save();
  }

  /**
   * Clean up (call on shutdown)
   */
  dispose(): void {
    this.autoSave?.dispose();
  }

  /**
   * Get the underlying registry
   */
  getRegistry(): DynamicHandlerRegistry {
    return this.registry;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}

/**
 * Singleton integration instance with persistence
 */
export const dynamicHandlerIntegration = new DynamicHandlerIntegration();

/**
 * Initialize the integration with persistence
 * Call this at application startup
 */
export function initializeDynamicHandlers(options?: {
  persistencePath?: string;
  saveDelayMs?: number;
}): DynamicHandlerIntegration {
  dynamicHandlerIntegration.enablePersistence({
    path: options?.persistencePath,
    saveDelayMs: options?.saveDelayMs,
  });

  log.info('Dynamic handler system initialized', {
    stats: dynamicHandlerIntegration.getStats(),
  });

  return dynamicHandlerIntegration;
}

/**
 * Shutdown the integration (save and cleanup)
 * Call this before application exit
 */
export function shutdownDynamicHandlers(): void {
  dynamicHandlerIntegration.dispose();
  log.info('Dynamic handler system shut down');
}

/**
 * Apply quirks to fetch options
 *
 * Helper function to apply learned quirks to fetch options
 */
export function applyQuirksToFetchOptions(
  quirks: SiteQuirks | undefined,
  options: {
    headers?: Record<string, string>;
    stealth?: { enabled?: boolean };
    timeout?: number;
  }
): typeof options {
  if (!quirks) return options;

  const result = { ...options };

  // Apply required headers
  if (quirks.requiredHeaders) {
    result.headers = {
      ...result.headers,
      ...quirks.requiredHeaders,
    };
  }

  // Apply stealth mode
  if (quirks.stealth?.required) {
    result.stealth = {
      ...result.stealth,
      enabled: true,
    };
  }

  // Apply timing quirks
  if (quirks.timing?.minDelayMs) {
    // The caller should implement delay logic
    // We just pass the information through
  }

  return result;
}

/**
 * Convert template to recommended extraction strategy
 */
export function templateToStrategy(template: HandlerTemplate): ExtractionStrategy | null {
  switch (template) {
    case 'shopify-like':
      return 'api:shopify';
    case 'woocommerce-like':
      return 'api:woocommerce';
    case 'nextjs-ssr':
      return 'framework:nextjs';
    case 'graphql':
      return 'api:graphql';
    case 'structured-data':
      return 'structured:jsonld';
    case 'rest-api':
      return 'api:predicted';
    case 'spa-json':
      return 'framework:nextjs'; // Similar approach
    case 'html-scrape':
      return 'parse:static';
    case 'custom':
      return null; // Use learned patterns
    default:
      return null;
  }
}
