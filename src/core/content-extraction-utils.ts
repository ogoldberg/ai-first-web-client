/**
 * Content Extraction Utilities
 *
 * Shared utilities for extracting and processing content from web pages.
 * Used by ContentIntelligence and site handlers.
 */

import type { ContentMapping } from '../types/api-patterns.js';
import {
  detectPageLanguage as detectLanguage,
  getFieldVariants,
  extractFieldByCategory,
  type LanguageDetectionResult,
  type FieldCategory,
} from './language-aware-extraction.js';

// Re-export language detection for convenience
export { detectLanguage as detectPageLanguage };
export type { LanguageDetectionResult, FieldCategory };

/**
 * Get a value from an object using dot notation path
 * Supports array access like "items[0].title"
 */
export function getValueAtPath(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) {
    return undefined;
  }

  // Handle array notation like "items[0]"
  const parts = path.split(/\.|\[|\]/).filter(Boolean);
  let current: unknown = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    // Handle numeric indices for arrays
    if (/^\d+$/.test(part) && Array.isArray(current)) {
      current = current[parseInt(part, 10)];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Check if an object has a field at the given path (supports dot notation and array access)
 */
export function hasFieldAtPath(obj: unknown, path: string): boolean {
  const value = getValueAtPath(obj, path);
  return value !== undefined && value !== null;
}

/**
 * Get a string value from an object at the given path
 */
export function getStringAtPath(obj: unknown, path: string): string | null {
  const value = getValueAtPath(obj, path);

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

/**
 * Check if a string contains HTML content
 */
export function isHtmlContent(str: string): boolean {
  // Simple check for HTML tags
  return /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Simple HTML to plain text converter
 */
export function htmlToPlainText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");

  // Normalize whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Extract text content from structured data
 */
export function extractTextFromStructured(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (typeof data !== 'object' || data === null) {
    return '';
  }

  // Look for common content fields
  const obj = data as Record<string, unknown>;
  const contentFields = [
    'text', 'content', 'body', 'description', 'summary', 'selftext',
    'extract', 'body_markdown', 'readme', 'info.description',
  ];

  for (const field of contentFields) {
    const value = getValueAtPath(obj, field);
    if (typeof value === 'string' && value.length > 20) {
      return value;
    }
  }

  return '';
}

/**
 * Extract text recursively from an object, filtering out code/URLs
 */
export function extractTextFromObject(obj: unknown, depth = 0): string {
  if (depth > 10) return ''; // Prevent infinite recursion

  if (typeof obj === 'string') {
    // Filter out things that look like code/URLs
    if (obj.length > 20 && !obj.includes('http') && !obj.includes('{') && !obj.includes('<')) {
      return obj + ' ';
    }
    return '';
  }

  if (Array.isArray(obj)) {
    return obj.map(item => extractTextFromObject(item, depth + 1)).join('');
  }

  if (obj && typeof obj === 'object') {
    let text = '';
    const textKeys = ['text', 'content', 'body', 'description', 'title', 'name',
                     'summary', 'excerpt', 'articleBody', 'headline', 'caption'];

    for (const [key, value] of Object.entries(obj)) {
      // Prioritize text-like keys
      if (textKeys.includes(key)) {
        text += extractTextFromObject(value, depth + 1);
      } else if (!['id', 'url', 'href', 'src', 'className', 'style'].includes(key)) {
        text += extractTextFromObject(value, depth + 1);
      }
    }
    return text;
  }

  return '';
}

/**
 * Extract content from API response using contentMapping
 * Handles HTML content by converting to plain text and markdown
 */
export function extractContentFromMapping(
  data: unknown,
  mapping: ContentMapping,
  turndownFn?: (html: string) => string
): { title: string; text: string; markdown: string } {
  const rawTitle = getStringAtPath(data, mapping.title) || 'Untitled';
  const rawDescription = mapping.description ? getStringAtPath(data, mapping.description) : null;
  const rawBody = mapping.body ? getStringAtPath(data, mapping.body) : null;

  // Prefer body content, fall back to description
  const mainContent = rawBody || rawDescription || extractTextFromStructured(data);

  // Strip HTML for title (titles should be plain text)
  const title = isHtmlContent(rawTitle) ? htmlToPlainText(rawTitle) : rawTitle;

  // Convert HTML content to plain text and markdown
  if (mainContent && isHtmlContent(mainContent)) {
    const text = htmlToPlainText(mainContent);
    const markdown = turndownFn ? turndownFn(mainContent) : text;
    return { title, text, markdown };
  }

  // Content is already plain text
  const text = mainContent || '';
  const markdown = mainContent || '';
  return { title, text, markdown };
}

/**
 * Confidence thresholds for pattern application
 */
export const PATTERN_CONFIDENCE = {
  MIN: 0.3,
  MEDIUM: 0.5,
  HIGH: 0.8,
} as const;

/**
 * Get confidence level string from numeric score
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence > PATTERN_CONFIDENCE.HIGH) {
    return 'high';
  }
  if (confidence > PATTERN_CONFIDENCE.MEDIUM) {
    return 'medium';
  }
  return 'low';
}

// ============================================
// LANGUAGE-AWARE EXTRACTION (INT-011)
// ============================================

/**
 * Extract text content from structured data with language awareness
 *
 * Tries field names in the detected language first, then falls back to English.
 * This enables extraction from multilingual content like government portals.
 *
 * @param data - The data object to extract from
 * @param language - The detected page language (ISO 639-1 code)
 * @returns Extracted text content
 */
export function extractTextFromStructuredLanguageAware(
  data: unknown,
  language: string
): string {
  if (typeof data === 'string') {
    return data;
  }

  if (typeof data !== 'object' || data === null) {
    return '';
  }

  // Try to extract body/content using language-aware field detection
  const body = extractFieldByCategory(data, 'body', language);
  if (typeof body === 'string' && body.length > 20) {
    return body;
  }

  const description = extractFieldByCategory(data, 'description', language);
  if (typeof description === 'string' && description.length > 20) {
    return description;
  }

  const summary = extractFieldByCategory(data, 'summary', language);
  if (typeof summary === 'string' && summary.length > 20) {
    return summary;
  }

  // Fall back to standard extraction
  return extractTextFromStructured(data);
}

/**
 * Extract content from API response using contentMapping with language awareness
 *
 * First tries the mapping as-is, then tries language-specific field variants
 *
 * @param data - The data object to extract from
 * @param mapping - The content mapping
 * @param language - The detected page language
 * @param turndownFn - Optional HTML to markdown converter
 * @returns Extracted title, text, and markdown
 */
export function extractContentFromMappingLanguageAware(
  data: unknown,
  mapping: ContentMapping,
  language: string,
  turndownFn?: (html: string) => string
): { title: string; text: string; markdown: string } {
  // First try the standard mapping
  const standardResult = extractContentFromMapping(data, mapping, turndownFn);

  // If we got good results, return them
  if (standardResult.title !== 'Untitled' && standardResult.text.length > 20) {
    return standardResult;
  }

  // If not English, try language-aware extraction
  if (language !== 'en') {
    const obj = data as Record<string, unknown>;

    // Try to find title in language-specific fields
    const titleVariants = getFieldVariants('title', language);
    let title = standardResult.title;
    for (const variant of titleVariants) {
      const value = getValueAtPath(obj, variant);
      if (typeof value === 'string' && value.length > 0) {
        title = isHtmlContent(value) ? htmlToPlainText(value) : value;
        break;
      }
    }

    // Try to find body in language-specific fields
    const bodyVariants = getFieldVariants('body', language);
    const descVariants = getFieldVariants('description', language);
    let mainContent = '';

    for (const variant of [...bodyVariants, ...descVariants]) {
      const value = getValueAtPath(obj, variant);
      if (typeof value === 'string' && value.length > 20) {
        mainContent = value;
        break;
      }
    }

    if (mainContent) {
      if (isHtmlContent(mainContent)) {
        const text = htmlToPlainText(mainContent);
        const markdown = turndownFn ? turndownFn(mainContent) : text;
        return { title, text, markdown };
      }
      return { title, text: mainContent, markdown: mainContent };
    }
  }

  return standardResult;
}
