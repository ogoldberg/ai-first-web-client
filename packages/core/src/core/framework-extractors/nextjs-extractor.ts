/**
 * Next.js Framework Extractor
 *
 * Extracts data from Next.js applications via __NEXT_DATA__ script tag.
 */

import type { FrameworkExtractionResult } from './types.js';
import { extractTextFromObject } from './utils.js';

/**
 * Extract data from Next.js __NEXT_DATA__ script tag
 */
export function extractNextJSData(html: string): FrameworkExtractionResult | null {
  // Next.js stores all page data in __NEXT_DATA__
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/s);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps || {};

    // Extract text content from the props
    const text = extractTextFromObject(pageProps);
    const title = pageProps.title || pageProps.name || data?.page || '';

    if (text.length > 50) {
      return { title, text, structured: pageProps };
    }
  } catch {
    // Invalid JSON
  }

  return null;
}
