/**
 * VuePress Framework Extractor
 *
 * Extracts data from VuePress (Vue 2/3 documentation generator) applications.
 */

import { logger } from '../../utils/logger.js';
import type { FrameworkExtractionResult } from './types.js';
import {
  extractTextFromObject,
  extractTitleFromObject,
  htmlToPlainText,
} from './utils.js';

/**
 * Detect if page is a VuePress application
 */
export function detectVuePressApp(html: string): boolean {
  const vuepressIndicators = [
    // VuePress meta tag (v2)
    /<meta[^>]*name="generator"[^>]*content="VuePress[^"]*"/i,
    // VuePress SSR context
    /__VUEPRESS_SSR_CONTEXT__/,
    // VuePress data marker
    /VUEPRESS_DATA__/,
    // VuePress-specific classes (v2)
    /class="[^"]*vp-sidebar[^"]*"/i,
    /class="[^"]*theme-default-content[^"]*"/i,
    // VuePress script patterns
    /assets\/js\/app\.[a-f0-9]+\.js/i,
    // VuePress v1 patterns
    /class="[^"]*sidebar-links[^"]*"/i,
    /class="[^"]*page-edit[^"]*"/i,
    // VuePress data attribute
    /data-server-rendered="true"/i,
  ];

  return vuepressIndicators.some(indicator => indicator.test(html));
}

/**
 * Extract data from VuePress applications
 */
export function extractVuePressData(html: string): FrameworkExtractionResult | null {
  // VuePress (v1 and v2) stores SSR context data
  // VuePress 2.x uses __VUEPRESS_SSR_CONTEXT__
  // VuePress 1.x uses VUEPRESS_DATA__ or similar

  // Check for VuePress indicators first
  if (!detectVuePressApp(html)) {
    return null;
  }

  // Try to extract page data from VuePress SSR context
  const pageDataPatterns = [
    // VuePress 2.x SSR context
    /window\.__VUEPRESS_SSR_CONTEXT__\s*=\s*({[\s\S]*?})\s*<\/script>/s,
    // VuePress page data
    /<script[^>]*>VUEPRESS_DATA__\s*=\s*({[\s\S]*?})\s*<\/script>/s,
    // VuePress 2.x page data in JSON script
    /<script[^>]*id="__VUEPRESS_DATA__"[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/i,
  ];

  for (const pattern of pageDataPatterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const text = extractTextFromObject(data);
        if (text.length > 50) {
          const title = extractTitleFromObject(data);
          return { title, text, structured: data };
        }
      } catch (error) {
        logger.intelligence.debug('Failed to parse VuePress data JSON', { error });
      }
    }
  }

  // Try to extract from VuePress content containers
  // VuePress 2.x uses .theme-default-content, VuePress 1.x uses .content
  const contentPatterns = [
    /<div[^>]*class="[^"]*theme-default-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*page[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
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
