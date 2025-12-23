/**
 * Remix Framework Extractor
 *
 * Extracts data from Remix applications via window.__remixContext.
 */

import type { FrameworkExtractionResult } from './types.js';
import { extractTextFromObject } from './utils.js';

/**
 * Extract data from Remix __remixContext
 */
export function extractRemixData(html: string): FrameworkExtractionResult | null {
  // Remix uses window.__remixContext
  const match = html.match(/window\.__remixContext\s*=\s*(.+?);\s*<\/script>/s);
  if (!match) return null;

  try {
    // The loader data contains the page content
    const loaderMatch = match[1].match(/"loaderData"\s*:\s*(\{[\s\S]*?\})\s*,\s*"actionData"/);
    if (loaderMatch) {
      const data = JSON.parse(loaderMatch[1]);
      const text = extractTextFromObject(data);
      return { title: '', text, structured: data };
    }
  } catch {
    // Invalid format
  }

  return null;
}
