/**
 * Gatsby Framework Extractor
 *
 * Extracts data from Gatsby applications via various script patterns.
 */

import type { FrameworkExtractionResult } from './types.js';
import { extractTextFromObject } from './utils.js';

/**
 * Extract data from Gatsby applications
 */
export function extractGatsbyData(html: string): FrameworkExtractionResult | null {
  // Gatsby uses multiple patterns
  const patterns = [
    /window\.___GATSBY\s*=\s*(.+?);\s*<\/script>/s,
    /<script[^>]*>window\.pagePath\s*=\s*"[^"]+";window\.___webpackCompilationHash\s*=\s*"[^"]+";(.+?)<\/script>/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        // Gatsby data is complex, try to find page data
        const pageDataMatch = html.match(/<script[^>]*id="gatsby-script-loader"[^>]*>([^<]+)<\/script>/);
        if (pageDataMatch) {
          const text = extractTextFromObject(pageDataMatch[1]);
          if (text.length > 50) {
            return { title: '', text };
          }
        }
      } catch {
        // Continue
      }
    }
  }

  return null;
}
