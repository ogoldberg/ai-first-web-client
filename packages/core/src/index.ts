/**
 * @unbrowser/core
 *
 * Official SDK for the Unbrowser cloud API.
 *
 * This package provides a thin HTTP client wrapper for interacting with
 * the Unbrowser cloud service at api.unbrowser.ai.
 *
 * @example
 * ```typescript
 * import { createUnbrowser } from '@unbrowser/core';
 *
 * const client = createUnbrowser({
 *   apiKey: process.env.UNBROWSER_API_KEY,
 * });
 *
 * const result = await client.browse('https://example.com');
 * console.log(result.content.markdown);
 * ```
 *
 * @see https://unbrowser.ai for documentation
 */

export const VERSION = '0.1.0-alpha.1';

// Export everything from http-client
export {
  // Factory function
  createUnbrowser,

  // Client class
  UnbrowserClient,

  // Error class
  UnbrowserError,

  // Types
  type UnbrowserConfig,
  type BrowseOptions,
  type BrowseResult,
  type BatchResult,
  type SessionData,
  type Cookie,
  type DomainIntelligence,
  type ProgressEvent,
  type ProgressCallback,

  // Plan Preview Types
  type BrowsePreview,
  type ExecutionPlan,
  type ExecutionStep,
  type TimeEstimate,
  type ConfidenceLevel,
  type ConfidenceFactors,

  // Skill Pack Types (PACK-001)
  type SkillVertical,
  type SkillTier,
  type BrowsingSkill,
  type AntiPattern,
  type SkillWorkflow,
  type SkillPackMetadata,
  type SkillPack,
  type SkillExportOptions,
  type SkillConflictResolution,
  type SkillImportOptions,
  type SkillImportResult,
} from './http-client.js';
