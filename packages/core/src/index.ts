/**
 * @llm-browser/core
 *
 * Core SDK for LLM Browser - intelligent web browsing for machines.
 *
 * This package provides programmatic access to all LLM Browser capabilities
 * without requiring the MCP protocol. Use this for:
 * - Direct integration into Node.js applications
 * - Building custom web automation workflows
 * - Programmatic access to learning and API discovery
 *
 * @example
 * ```typescript
 * import { createLLMBrowser } from '@llm-browser/core';
 *
 * const browser = await createLLMBrowser();
 * const result = await browser.browse('https://example.com');
 * console.log(result.content.markdown);
 * await browser.cleanup();
 * ```
 *
 * @packageDocumentation
 */

export const VERSION = '0.5.0';

// ============================================
// SDK Client (Primary Export)
// ============================================

export {
  LLMBrowserClient,
  createLLMBrowser,
  createContentFetcher,
  type LLMBrowserConfig,
} from './sdk.js';

// ============================================
// Core Classes
// ============================================

export { SmartBrowser } from './core/smart-browser.js';
export { TieredFetcher } from './core/tiered-fetcher.js';
export { LearningEngine } from './core/learning-engine.js';
export { ProceduralMemory } from './core/procedural-memory.js';
export { BrowserManager } from './core/browser-manager.js';
export {
  SessionManager,
  type SessionHealth,
  type SessionRefreshCallback,
} from './core/session-manager.js';
export { ContentIntelligence } from './core/content-intelligence.js';
export { ApiAnalyzer } from './core/api-analyzer.js';
export {
  AuthWorkflow,
  type StoredApiCredentials,
  type ApiKeyCredentials,
  type BearerCredentials,
  type BasicCredentials,
  type OAuth2Credentials,
  type CookieCredentials,
  type AuthWorkflowStatus,
  type ConfigureCredentialsResult,
  type AuthenticatedRequestOptions,
  type AuthenticatedRequestResult,
} from './core/auth-workflow.js';
export { LightweightRenderer } from './core/lightweight-renderer.js';
export { SemanticPatternMatcher } from './core/semantic-pattern-matcher.js';
export { DomainGroupLearner } from './core/domain-group-learner.js';
export { SemanticSearchExtended, createSemanticSearchExtended } from './core/semantic-search-extended.js';

// Semantic initialization utilities
export {
  checkSemanticDependencies,
  initializeSemanticInfrastructure,
  getSemanticInfrastructure,
  getSemanticMatcher,
  isSemanticInitialized,
  wasInitializationAttempted,
  resetSemanticInfrastructure,
  type SemanticInfrastructure,
  type SemanticInfrastructureConfig,
  type SemanticInitResult,
} from './core/semantic-init.js';

// API Pattern Registry (from api-pattern-learner.ts)
export { ApiPatternRegistry, PATTERN_TEMPLATES, BOOTSTRAP_PATTERNS } from './core/api-pattern-learner.js';

// ============================================
// Utility Classes
// ============================================

export { ContentExtractor } from './utils/content-extractor.js';
export { PersistentStore } from './utils/persistent-store.js';
export { EmbeddedStore } from './utils/embedded-store.js';
export { VectorStore } from './utils/vector-store.js';
export { EmbeddingProvider } from './utils/embedding-provider.js';
export { EmbeddingPipeline } from './utils/embedding-pipeline.js';
export { TenantStore, SharedPatternPool, MultiTenantStore } from './utils/tenant-store.js';
export { SqlitePersistentStore } from './utils/sqlite-persistent-store.js';
export { PerformanceTracker } from './utils/performance-tracker.js';
export { UsageMeter } from './utils/usage-meter.js';
export {
  generateDashboard,
  getQuickStatus,
  type AnalyticsDashboard,
  type TierAnalytics,
  type DomainAnalytics,
  type TimeSeriesPoint,
  type SystemHealth,
  type DashboardOptions,
} from './utils/analytics-dashboard.js';
export { ContentChangeTracker } from './utils/content-change-tracker.js';
export { DebugTraceRecorder } from './utils/debug-trace-recorder.js';
export { ExtractionBenchmark } from './utils/extraction-benchmark.js';
export { RateLimiter } from './utils/rate-limiter.js';
export { ToolSelectionMetrics } from './utils/tool-selection-metrics.js';

// Cache exports
export { ResponseCache, ContentCache, pageCache, apiCache } from './utils/cache.js';

// Logger exports
export { logger, Logger, configureLogger, getLogger } from './utils/logger.js';

// HAR converter
export { convertToHar, serializeHar } from './utils/har-converter.js';

// URL Safety
export {
  UrlSafetyValidator,
  urlSafetyValidator,
  validateUrl,
  validateUrlOrThrow,
  configureUrlSafety,
  UrlSafetyError,
  type UrlSafetyConfig,
  type UrlSafetyResult,
} from './utils/url-safety.js';

// Session Crypto
export { SessionCrypto, sessionCrypto } from './utils/session-crypto.js';

// Retry utilities
export { withRetry, type RetryOptions } from './utils/retry.js';

// Timeout configuration
export { TIMEOUTS } from './utils/timeouts.js';

// Heuristics configuration
export {
  getConfig,
  getDomainGroups,
  findDomainGroup,
  getStaticDomainPatterns,
  getBrowserRequiredPatterns,
  type HeuristicsConfig,
  type DomainPattern,
} from './utils/heuristics-config.js';

// GraphQL discovery
export {
  isGraphQLEndpoint,
  parseSchema,
  GRAPHQL_ENDPOINT_PATHS,
  INTROSPECTION_QUERY,
} from './core/graphql-introspection.js';

// OpenAPI discovery
export { generatePatternsFromSpec, generatePatternsFromOpenAPISpec } from './core/openapi-discovery.js';

// Link discovery
export {
  parseLinkHeader,
  extractHtmlLinks,
  detectHypermediaFormat,
  extractHalLinks,
  extractJsonApiLinks,
} from './core/link-discovery.js';

// Failure learning functions
export {
  classifyFailure,
  createFailureRecord,
  createAntiPattern,
  isAntiPatternActive,
  matchAntiPatterns,
} from './core/failure-learning.js';

// Stealth browser (anti-bot evasion)
export {
  // Fingerprint generation
  generateFingerprint,
  type BrowserFingerprint,

  // Stealth browser (Playwright-specific)
  isStealthAvailable,
  getStealthError,
  launchStealthBrowser,
  createStealthContext,
  type StealthBrowserConfig,

  // Evasion scripts (Playwright-specific)
  EVASION_SCRIPTS,
  getEvasionScripts,

  // HTTP headers (applies to all tiers)
  getAcceptLanguage,
  getFingerprintHeaders,
  getStealthFetchHeaders,

  // Behavioral delays (applies to all tiers)
  BehavioralDelays,

  // Human-like movement/typing simulation
  HumanMouseMovement,
  HumanTyping,
  HumanActions,

  // Configuration
  getStealthConfig,
  type StealthConfig,
  DEFAULT_STEALTH_CONFIG,
} from './core/stealth-browser.js';

// Learning effectiveness metrics
export {
  computeLearningEffectiveness,
  type PatternEffectiveness,
  type ConfidenceAccuracy,
  type TierOptimization,
  type SkillEffectiveness,
  type SelectorEffectiveness,
  type DomainCoverage,
  type LearningTrend,
  type LearningEffectivenessReport,
} from './core/learning-effectiveness.js';

// Research suggestion (LLM-assisted problem solving)
export {
  generateResearchSuggestion,
  detectBotProtection,
  classifyProblem,
  createProblemResponse,
  generateProblemReason,
  isBlockedByBotDetection,
  suggestRetryConfig,
  TRUSTED_SOURCES,
} from './core/research-suggestion.js';

// Challenge detection (interactive challenge element detection and solving)
export {
  detectChallengeElements,
  waitForChallengeResolution,
  type ChallengeDetectionResult,
  type ChallengeDetectorOptions,
} from './core/challenge-detector.js';

// ============================================
// Types (re-exported from types/)
// ============================================

export * from './types/index.js';
export * from './types/schema-version.js';
export * from './types/field-confidence.js';
export * from './types/decision-trace.js';
export * from './types/errors.js';
export * from './types/provenance.js';
export * from './types/api-patterns.js';
export * from './types/har.js';

// Re-export specific types from core modules
export type {
  SmartBrowseOptions,
  SmartBrowseResult,
  DomainCapabilitiesSummary,
  DomainKnowledgeSummary,
  ScreenshotOptions,
  ScreenshotResult,
} from './core/smart-browser.js';

export type {
  TieredFetchOptions,
  TieredFetchResult,
  RenderTier,
  FreshnessRequirement,
  DomainPreference,
} from './core/tiered-fetcher.js';

export type { BrowserConfig } from './core/browser-manager.js';

export type {
  ContentResult,
  ExtractionStrategy,
  ContentIntelligenceOptions,
} from './core/content-intelligence.js';

export type { LearnApiPatternOptions } from './core/learning-engine.js';

// Content extractor types
export type {
  ExtractedTable,
  TableAsJSON,
  TitleExtraction,
  ContentExtraction,
  ExtractionResultWithConfidence,
  ExtractionResultWithTrace,
} from './utils/content-extractor.js';
