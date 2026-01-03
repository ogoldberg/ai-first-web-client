/**
 * Dynamic Handler System
 *
 * This module provides automatic handler creation and learning.
 * It learns from both:
 * 1. Repeatable patterns (Shopify-like, WooCommerce, Next.js, etc.)
 * 2. Site-specific quirks (headers, rate limits, anti-bot detection)
 */

export { DynamicHandlerRegistry, dynamicHandlerRegistry } from './registry.js';
export { detectTemplate, getTemplateConfig, PATTERN_TEMPLATES, mergeTemplateWithQuirks } from './pattern-templates.js';
export { saveRegistry, loadRegistry, AutoSaveRegistry, createPersistentRegistry } from './persistence.js';
export {
  DynamicHandlerIntegration,
  dynamicHandlerIntegration,
  initializeDynamicHandlers,
  shutdownDynamicHandlers,
  applyQuirksToFetchOptions,
  templateToStrategy,
  type ExtractionContext,
  type ExtractionRecommendation,
} from './integration.js';
export type {
  // Handler types
  DynamicHandler,
  LearnedSiteHandler,
  HandlerTemplate,
  HandlerMatch,
  LearningConfig,

  // Extraction types
  ExtractionRule,
  ExtractionMethod,
  ApiPattern,
  UrlPattern,

  // Pattern types
  PatternTemplate,
  PatternSignal,

  // Observation types
  ExtractionObservation,

  // Quirks types
  SiteQuirks,

  // Persistence
  SerializedHandlerRegistry,
} from './types.js';
