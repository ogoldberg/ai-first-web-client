/**
 * Framework Extractors Types
 *
 * Common types for framework data extraction.
 */

/**
 * Result from a framework data extraction
 */
export interface FrameworkExtractionResult {
  title: string;
  text: string;
  structured?: unknown;
}

/**
 * Options for framework extraction
 */
export interface FrameworkExtractorOptions {
  minContentLength?: number;
}
