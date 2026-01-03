/**
 * Intelligence Handlers
 *
 * MCP tool handlers for AI browser tools integration.
 * These handlers provide intelligence to LLMs that control their own browsers
 * (like Claude-in-Chrome, browser-use, etc.) without requiring Unbrowser
 * to do the actual browsing.
 *
 * The key insight: LLMs with browser access should try Unbrowser FIRST
 * before opening a browser window. Unbrowser can often provide the data
 * directly via cached results, discovered APIs, or quick stealth fetches.
 */

import { jsonResponse, type McpResponse } from '../response-formatters.js';
import { dynamicHandlerIntegration } from '../../core/dynamic-handlers/integration.js';
import { likelyNeedsStealth } from '../../core/stealth-fetch.js';
import { contentIntelligence } from '../../core/content-intelligence.js';
import { logger } from '../../utils/logger.js';

const log = logger.intelligence;

/**
 * Response indicating whether Unbrowser could fulfill the request
 * or if the LLM should use its own browser
 */
export interface IntelligenceResponse {
  /** Did we successfully get the data? */
  success: boolean;

  /** How we got the data (or why we couldn't) */
  source: 'cache' | 'api' | 'fetch' | 'unavailable';

  /** The content (if successful) */
  content?: {
    title?: string;
    markdown?: string;
    text?: string;
    structured?: Record<string, unknown>;
  };

  /** If we couldn't get it, guidance for the LLM's browser */
  fallback?: {
    reason: 'requires_auth' | 'requires_interaction' | 'blocked' | 'dynamic_content' | 'unknown';
    suggestion: string;
  };

  /** Hints to help the LLM browse more effectively */
  browserHints?: {
    useStealthMode: boolean;
    stealthProfile?: string;
    waitForSelector?: string;
    rateLimit?: number;
    requiredHeaders?: Record<string, string>;
    avoidSelectors?: string[];
    knownSelectors?: Record<string, string>;
    antiBot?: {
      type: string;
      severity: string;
    };
  };

  /** Metadata about the response */
  meta: {
    domain: string;
    hasLearnedPatterns: boolean;
    patternConfidence?: number;
    fetchDuration?: number;
    cachedAt?: string;
  };
}

/**
 * Domain check response - what we know about a URL before browsing
 */
export interface DomainCheckResponse {
  domain: string;
  url: string;

  /** Can Unbrowser likely get this data without browser automation? */
  canFetchDirectly: boolean;

  /** Why or why not */
  reason: string;

  /** What we know about this domain */
  knowledge: {
    hasLearnedPatterns: boolean;
    patternCount: number;
    templateType?: string;
    successRate?: number;
    lastSeen?: string;
  };

  /** Site-specific quirks we've learned */
  quirks?: {
    needsStealth: boolean;
    rateLimit?: number;
    requiresAuth?: boolean;
    hasAntiBot?: boolean;
    antiBotType?: string;
  };

  /** Recommendations for browsing */
  recommendations: string[];

  /** Known selectors that work on this site */
  knownSelectors?: Record<string, string>;
}

/**
 * Arguments for unbrowser_get tool
 */
export interface UnbrowserGetArgs {
  url: string;
  extract?: 'auto' | 'product' | 'article' | 'structured' | 'markdown' | 'text';
  maxAge?: number; // Accept cached data up to N seconds old
  timeout?: number; // Fetch timeout in ms
}

/**
 * Arguments for unbrowser_check tool
 */
export interface UnbrowserCheckArgs {
  url: string;
}

// Simple in-memory cache for POC
const responseCache = new Map<string, { data: IntelligenceResponse; timestamp: number }>();
const CACHE_TTL_MS = 3600 * 1000; // 1 hour default

/**
 * Handle unbrowser_get tool call
 *
 * Attempts to get content from a URL without browser automation.
 * Returns the content if successful, or guidance for browser automation if not.
 */
export async function handleUnbrowserGet(args: UnbrowserGetArgs): Promise<McpResponse> {
  const { url, extract = 'auto', maxAge = 3600, timeout = 15000 } = args;

  const startTime = Date.now();

  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    return jsonResponse({
      success: false,
      source: 'unavailable',
      fallback: {
        reason: 'unknown',
        suggestion: 'Invalid URL provided',
      },
      meta: {
        domain: 'unknown',
        hasLearnedPatterns: false,
      },
    } as IntelligenceResponse);
  }

  // 1. Check cache first
  const cacheKey = `${url}:${extract}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < maxAge * 1000) {
    log.debug('Returning cached response', { url, age: Date.now() - cached.timestamp });
    return jsonResponse({
      ...cached.data,
      source: 'cache',
      meta: {
        ...cached.data.meta,
        cachedAt: new Date(cached.timestamp).toISOString(),
      },
    });
  }

  // 2. Get domain intelligence
  const recommendation = dynamicHandlerIntegration.getRecommendation({
    url,
    domain,
  });

  const quirks = dynamicHandlerIntegration.getQuirks(domain);
  const hasLearned = dynamicHandlerIntegration.hasLearnedDomain(domain);

  // 3. Check if this likely requires browser automation
  if (quirks?.content?.requiresJs || quirks?.content?.loginWall) {
    return jsonResponse({
      success: false,
      source: 'unavailable',
      fallback: {
        reason: quirks.content.loginWall ? 'requires_auth' : 'dynamic_content',
        suggestion: quirks.content.loginWall
          ? 'This page requires authentication. Use your browser to log in.'
          : 'This page requires JavaScript execution. Use your browser.',
      },
      browserHints: buildBrowserHints(domain, quirks, recommendation),
      meta: {
        domain,
        hasLearnedPatterns: hasLearned,
        patternConfidence: recommendation.confidence,
      },
    } as IntelligenceResponse);
  }

  // 4. Try to extract content using Content Intelligence
  try {
    const needsStealth = recommendation.needsStealth || likelyNeedsStealth(url);

    log.debug('Attempting content extraction', { url, needsStealth });

    // Use the full ContentIntelligence extraction pipeline
    const extracted = await contentIntelligence.extract(url, {
      timeout,
      headers: quirks?.requiredHeaders,
      allowBrowser: false, // Don't use Playwright - we want fast fetch only
      stealth: needsStealth ? { enabled: true, profile: 'chrome_120' } : undefined,
    });

    // Check if extraction failed
    if (extracted.error) {
      // Determine the failure reason
      const errorLower = extracted.error.toLowerCase();
      let reason: 'blocked' | 'requires_auth' | 'dynamic_content' | 'unknown' = 'unknown';
      let suggestion = extracted.error;

      if (errorLower.includes('403') || errorLower.includes('blocked')) {
        reason = 'blocked';
        suggestion = 'Access blocked. Use your browser which has a real user fingerprint.';
      } else if (errorLower.includes('429') || errorLower.includes('rate')) {
        reason = 'blocked';
        suggestion = 'Rate limited. Wait and try again, or use your browser with a slower pace.';
      } else if (errorLower.includes('auth') || errorLower.includes('login')) {
        reason = 'requires_auth';
        suggestion = 'This page requires authentication. Use your browser to log in.';
      } else if (errorLower.includes('javascript') || errorLower.includes('dynamic')) {
        reason = 'dynamic_content';
        suggestion = 'This page requires JavaScript execution. Use your browser.';
      } else {
        suggestion = `Extraction failed: ${extracted.error}. Use your browser.`;
      }

      return jsonResponse({
        success: false,
        source: 'unavailable',
        fallback: { reason, suggestion },
        browserHints: buildBrowserHints(domain, quirks, recommendation),
        meta: {
          domain,
          hasLearnedPatterns: hasLearned,
          patternConfidence: recommendation.confidence,
          fetchDuration: Date.now() - startTime,
        },
      } as IntelligenceResponse);
    }

    // Determine the source based on strategy used
    let source: 'cache' | 'api' | 'fetch' = 'fetch';
    if (extracted.meta.strategy.startsWith('api:')) {
      source = 'api';
    } else if (extracted.meta.strategy.startsWith('cache:')) {
      source = 'cache';
    }

    const response: IntelligenceResponse = {
      success: true,
      source,
      content: {
        title: extracted.content.title,
        markdown: extracted.content.markdown,
        text: extracted.content.text,
        structured: extracted.content.structured,
      },
      browserHints: buildBrowserHints(domain, quirks, recommendation),
      meta: {
        domain,
        hasLearnedPatterns: hasLearned,
        patternConfidence: recommendation.confidence,
        fetchDuration: Date.now() - startTime,
      },
    };

    // Cache the successful response
    responseCache.set(cacheKey, { data: response, timestamp: Date.now() });

    return jsonResponse(response);
  } catch (error) {
    log.warn('Extraction failed', { url, error: String(error) });

    return jsonResponse({
      success: false,
      source: 'unavailable',
      fallback: {
        reason: 'unknown',
        suggestion: `Extraction failed: ${error instanceof Error ? error.message : String(error)}. Use your browser.`,
      },
      browserHints: buildBrowserHints(domain, quirks, recommendation),
      meta: {
        domain,
        hasLearnedPatterns: hasLearned,
        patternConfidence: recommendation.confidence,
        fetchDuration: Date.now() - startTime,
      },
    } as IntelligenceResponse);
  }
}

/**
 * Handle unbrowser_check tool call
 *
 * Returns what Unbrowser knows about a URL/domain without fetching.
 * Useful for LLMs to decide whether to try unbrowser_get or go straight to browser.
 */
export async function handleUnbrowserCheck(args: UnbrowserCheckArgs): Promise<McpResponse> {
  const { url } = args;

  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    return jsonResponse({
      domain: 'unknown',
      url,
      canFetchDirectly: false,
      reason: 'Invalid URL',
      knowledge: {
        hasLearnedPatterns: false,
        patternCount: 0,
      },
      recommendations: ['Provide a valid URL'],
    } as DomainCheckResponse);
  }

  const recommendation = dynamicHandlerIntegration.getRecommendation({ url, domain });
  const quirks = dynamicHandlerIntegration.getQuirks(domain);
  const hasLearned = dynamicHandlerIntegration.hasLearnedDomain(domain);
  const stats = dynamicHandlerIntegration.getStats();

  // Determine if we can likely fetch directly
  const requiresAuth = quirks?.content?.loginWall || false;
  const requiresJs = quirks?.content?.requiresJs || false;
  const hasAntiBot = !!quirks?.antiBot;
  const antiBotSeverity = quirks?.antiBot?.severity || 'low';

  // Can fetch if: no auth required, no heavy JS requirement, and anti-bot is manageable
  const canFetchDirectly =
    !requiresAuth && !requiresJs && (!hasAntiBot || antiBotSeverity !== 'high');

  let reason: string;
  if (requiresAuth) {
    reason = 'This page requires authentication';
  } else if (requiresJs) {
    reason = 'This page requires JavaScript execution for content';
  } else if (hasAntiBot && antiBotSeverity === 'high') {
    reason = 'This site has strong anti-bot protection';
  } else if (canFetchDirectly) {
    reason = hasLearned
      ? 'Known site with learned patterns - high confidence'
      : 'No blocking factors detected - should be fetchable';
  } else {
    reason = 'Unknown factors - try unbrowser_get to find out';
  }

  const recommendations: string[] = [];

  if (canFetchDirectly) {
    recommendations.push('Use unbrowser_get to fetch this URL directly');
    if (hasLearned) {
      recommendations.push('Learned patterns will be applied for optimal extraction');
    }
  } else {
    recommendations.push('Use your browser for this URL');
    if (requiresAuth) {
      recommendations.push('User needs to authenticate first');
    }
    if (quirks?.stealth?.required) {
      recommendations.push('Enable stealth/incognito mode to avoid detection');
    }
    if (quirks?.rateLimit) {
      recommendations.push(`Respect rate limit of ${quirks.rateLimit.requestsPerSecond} req/s`);
    }
  }

  const response: DomainCheckResponse = {
    domain,
    url,
    canFetchDirectly,
    reason,
    knowledge: {
      hasLearnedPatterns: hasLearned,
      patternCount: recommendation.rules.length + recommendation.apis.length,
      templateType: recommendation.template,
      successRate: hasLearned ? 0.85 : undefined, // TODO: track actual success rates
      lastSeen: hasLearned ? new Date().toISOString() : undefined,
    },
    quirks: {
      needsStealth: recommendation.needsStealth || likelyNeedsStealth(url),
      rateLimit: quirks?.rateLimit?.requestsPerSecond,
      requiresAuth,
      hasAntiBot,
      antiBotType: quirks?.antiBot?.type,
    },
    recommendations,
    knownSelectors: quirks?.selectorOverrides,
  };

  return jsonResponse(response);
}

/**
 * Build browser hints from quirks and recommendations
 */
function buildBrowserHints(
  domain: string,
  quirks: ReturnType<typeof dynamicHandlerIntegration.getQuirks>,
  recommendation: ReturnType<typeof dynamicHandlerIntegration.getRecommendation>
): IntelligenceResponse['browserHints'] {
  return {
    useStealthMode: recommendation.needsStealth || likelyNeedsStealth(`https://${domain}`),
    stealthProfile: recommendation.needsStealth ? 'chrome_120' : undefined,
    rateLimit: quirks?.rateLimit?.requestsPerSecond,
    requiredHeaders: quirks?.requiredHeaders,
    knownSelectors: quirks?.selectorOverrides,
    antiBot: quirks?.antiBot
      ? {
          type: quirks.antiBot.type,
          severity: quirks.antiBot.severity,
        }
      : undefined,
  };
}

/**
 * Clear the response cache (for testing)
 */
export function clearIntelligenceCache(): void {
  responseCache.clear();
}
