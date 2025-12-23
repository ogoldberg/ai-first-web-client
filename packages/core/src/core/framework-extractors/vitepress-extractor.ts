/**
 * VitePress Framework Extractor
 *
 * Extracts data from VitePress (Vue 3 static site generator) applications.
 */

import { logger } from '../../utils/logger.js';
import type { FrameworkExtractionResult } from './types.js';
import {
  extractTextFromObject,
  extractTitleFromObject,
  unescapeJavaScriptString,
  htmlToPlainText,
} from './utils.js';

/**
 * Detect if page is a VitePress application
 */
export function detectVitePressApp(html: string): boolean {
  const vitepressIndicators = [
    // VitePress meta tag
    /<meta[^>]*name="generator"[^>]*content="VitePress[^"]*"/i,
    // VitePress hash map
    /__VP_HASH_MAP__/,
    // VitePress-specific classes
    /class="[^"]*VPNav[^"]*"/i,
    /class="[^"]*VPContent[^"]*"/i,
    /class="[^"]*VPDoc[^"]*"/i,
    // VitePress script
    /assets\/chunks\/VitePress\.[a-zA-Z0-9]+\.js/i,
    // VitePress route data
    /__VP_ROUTE_DATA__/,
    // VitePress page data
    /__VP_PAGE_DATA__/,
  ];

  return vitepressIndicators.some(indicator => indicator.test(html));
}

/**
 * Extract data from VitePress applications
 */
export function extractVitePressData(html: string): FrameworkExtractionResult | null {
  // VitePress stores page data in a script tag with type="application/json"
  // It may use __VP_HASH_MAP__ or have VitePress-specific markers

  // Check for VitePress indicators first
  if (!detectVitePressApp(html)) {
    return null;
  }

  // Try to extract page data from VitePress SSR context
  // VitePress 1.x uses app.config.globalProperties pattern
  const pageDataPatterns = [
    // VitePress page data in script tag
    /<script[^>]*id="__VP_ROUTE_DATA__"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/i,
    // VitePress SSR state
    /window\.__VP_HASH_MAP__\s*=\s*JSON\.parse\('(.+?)'\)/s,
    // VitePress page frontmatter data
    /<script[^>]*>window\.__VP_PAGE_DATA__\s*=\s*({[\s\S]*?})\s*<\/script>/s,
  ];

  for (const pattern of pageDataPatterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        // Handle JSON-escaped strings from JavaScript context
        let jsonStr = match[1];
        if (pattern.source.includes("JSON.parse")) {
          // Unescape common JavaScript string escape sequences
          jsonStr = unescapeJavaScriptString(jsonStr);
        }
        const data = JSON.parse(jsonStr);
        const text = extractTextFromObject(data);
        if (text.length > 50) {
          const title = extractTitleFromObject(data);
          return { title, text, structured: data };
        }
      } catch (error) {
        logger.intelligence.debug('Failed to parse VitePress data JSON', { error });
      }
    }
  }

  // Try to extract from VitePress content containers
  // VitePress renders content in .vp-doc or .VPDoc containers
  const contentPatterns = [
    /<div[^>]*class="[^"]*(?:vp-doc|VPDoc)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*VPContent[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of contentPatterns) {
    const contentMatch = html.match(pattern);
    if (contentMatch) {
      // Convert HTML to plain text
      const text = htmlToPlainText(contentMatch[1]);
      if (text.length > 50) {
        // Try to get title from page heading
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        return { title, text };
      }
    }
  }

  return null;
}
