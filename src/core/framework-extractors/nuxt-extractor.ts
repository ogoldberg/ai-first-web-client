/**
 * Nuxt.js Framework Extractor
 *
 * Extracts data from Nuxt.js applications via window.__NUXT__ object.
 */

import type { FrameworkExtractionResult } from './types.js';
import { extractTextFromObject } from './utils.js';

/**
 * Extract data from Nuxt.js __NUXT__ script
 */
export function extractNuxtData(html: string): FrameworkExtractionResult | null {
  // Nuxt stores data in window.__NUXT__
  const match = html.match(/window\.__NUXT__\s*=\s*(.+?);\s*<\/script>/s);
  if (!match) return null;

  try {
    // This is JS, not JSON, so we need to be careful
    // Look for the data property which usually contains the page data
    const dataMatch = match[1].match(/data:\s*(\[[\s\S]*?\])/);
    if (dataMatch) {
      const data = JSON.parse(dataMatch[1]);
      const text = extractTextFromObject(data);
      return { title: '', text, structured: data };
    }
  } catch {
    // Invalid format
  }

  return null;
}
