/**
 * Framework Extractors Index
 *
 * Central exports for all framework-specific data extractors.
 * These extract page data from various JavaScript frameworks.
 */

// Export types
export type { FrameworkExtractionResult, FrameworkExtractorOptions } from './types.js';

// Export utilities
export {
  extractTextFromObject,
  extractTitleFromObject,
  unescapeJavaScriptString,
  htmlToPlainText,
} from './utils.js';

// Export individual extractors
export { extractNextJSData } from './nextjs-extractor.js';
export { extractNuxtData } from './nuxt-extractor.js';
export { extractGatsbyData } from './gatsby-extractor.js';
export { extractRemixData } from './remix-extractor.js';
export { extractAngularData, detectAngularApp } from './angular-extractor.js';
export { extractVitePressData, detectVitePressApp } from './vitepress-extractor.js';
export { extractVuePressData, detectVuePressApp } from './vuepress-extractor.js';

/**
 * Try all framework extractors in order
 * Returns the first successful extraction result, or null if none succeed
 */
export function tryFrameworkExtractors(
  html: string
): { framework: string; result: import('./types.js').FrameworkExtractionResult } | null {
  // Import the extractors (avoid circular imports by using dynamic resolution)
  const { extractNextJSData } = require('./nextjs-extractor.js');
  const { extractNuxtData } = require('./nuxt-extractor.js');
  const { extractGatsbyData } = require('./gatsby-extractor.js');
  const { extractRemixData } = require('./remix-extractor.js');
  const { extractAngularData } = require('./angular-extractor.js');
  const { extractVitePressData } = require('./vitepress-extractor.js');
  const { extractVuePressData } = require('./vuepress-extractor.js');

  // Try Next.js
  const nextData = extractNextJSData(html);
  if (nextData) {
    return { framework: 'nextjs', result: nextData };
  }

  // Try Nuxt
  const nuxtData = extractNuxtData(html);
  if (nuxtData) {
    return { framework: 'nuxt', result: nuxtData };
  }

  // Try Gatsby
  const gatsbyData = extractGatsbyData(html);
  if (gatsbyData) {
    return { framework: 'gatsby', result: gatsbyData };
  }

  // Try Remix
  const remixData = extractRemixData(html);
  if (remixData) {
    return { framework: 'remix', result: remixData };
  }

  // Try Angular / Angular Universal
  const angularData = extractAngularData(html);
  if (angularData) {
    return { framework: 'angular', result: angularData };
  }

  // Try VitePress
  const vitepressData = extractVitePressData(html);
  if (vitepressData) {
    return { framework: 'vitepress', result: vitepressData };
  }

  // Try VuePress
  const vuepressData = extractVuePressData(html);
  if (vuepressData) {
    return { framework: 'vuepress', result: vuepressData };
  }

  return null;
}
