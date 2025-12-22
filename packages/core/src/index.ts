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

// ============================================
// SDK Client (Primary Export)
// ============================================

// Note: These will be moved from src/sdk.ts in SDK-003
// For now, this is a placeholder that establishes the package structure

export const VERSION = '0.1.0';

/**
 * Placeholder for SDK client.
 * Will be populated in SDK-003 when SmartBrowser is extracted.
 */
export interface LLMBrowserConfig {
  /** Directory for storing session data */
  sessionsDir?: string;
  /** Path to learning engine JSON file */
  learningEnginePath?: string;
  /** Enable procedural memory / skill learning */
  enableProceduralMemory?: boolean;
  /** Enable content learning */
  enableLearning?: boolean;
}

/**
 * Placeholder type for browse result.
 * Will be fully typed in SDK-006.
 */
export interface BrowseResult {
  url: string;
  content: {
    markdown: string;
    text: string;
    html?: string;
  };
  metadata?: Record<string, unknown>;
}

// ============================================
// Future Exports (SDK-003 through SDK-006)
// ============================================

// These exports will be added as the SDK extraction progresses:
//
// SDK-003: SmartBrowser extraction
// export { LLMBrowserClient, createLLMBrowser, createContentFetcher } from './client';
// export { SmartBrowser, type SmartBrowseOptions, type SmartBrowseResult } from './smart-browser';
//
// SDK-004: Learning components
// export { LearningEngine } from './learning-engine';
// export { ProceduralMemory } from './procedural-memory';
// export { ApiPatternRegistry } from './api-pattern-registry';
//
// SDK-005: Session and auth
// export { SessionManager } from './session-manager';
// export { AuthWorkflow } from './auth-workflow';
//
// SDK-006: Type definitions
// export * from './types';
