/**
 * Angular Framework Extractor
 *
 * Extracts data from Angular/Angular Universal applications via TransferState.
 */

import { logger } from '../../utils/logger.js';
import type { FrameworkExtractionResult } from './types.js';
import { extractTextFromObject, extractTitleFromObject } from './utils.js';

/**
 * Detect if page is an Angular application
 */
export function detectAngularApp(html: string): boolean {
  // Check for Angular-specific indicators
  const angularIndicators = [
    // Angular root component
    /<app-root[^>]*>/i,
    // ng-version attribute (Angular adds this to root elements)
    /ng-version=["'][^"']+["']/i,
    // Angular content attributes (added by ViewEncapsulation)
    /_ngcontent-[a-z0-9-]+/i,
    /_nghost-[a-z0-9-]+/i,
    // Angular hydration
    /ngh(?:=["'][^"']*["']|\s|>)/i,
    // Angular Zone.js script
    /zone(?:\.min)?\.js/i,
    // Angular runtime script
    /runtime(?:\.[a-f0-9]+)?\.js/i,
    // Angular main bundle with hash
    /main\.[a-f0-9]+\.js/i,
    // Angular polyfills bundle
    /polyfills(?:\.[a-f0-9]+)?\.js/i,
  ];

  return angularIndicators.some(indicator => indicator.test(html));
}

/**
 * Extract data from Angular/Angular Universal applications
 */
export function extractAngularData(html: string): FrameworkExtractionResult | null {
  // Angular Universal (SSR) uses TransferState to pass data from server to client
  // The data is stored in a script tag with type="application/json"
  // Common IDs: serverApp-state, transfer-state, ng-state, or just a script with ngh attribute

  // First, find all application/json script tags and check their IDs
  const angularStateIds = ['serverApp-state', 'transfer-state', 'ng-state'];
  const scriptTagRegex = /<script([^>]*)type\s*=\s*["']application\/json["']([^>]*)>([^<]*)<\/script>/gi;

  // Use matchAll to iterate through all matches
  const scriptMatches = [...html.matchAll(scriptTagRegex)];
  for (const scriptMatch of scriptMatches) {
    const beforeType = scriptMatch[1];
    const afterType = scriptMatch[2];
    const content = scriptMatch[3];
    const attributes = beforeType + afterType;

    // Check if this is an Angular state script
    const idRegex = new RegExp(`id\\s*=\\s*["']?(?:${angularStateIds.join('|')})["']?`, 'i');
    const isAngularState = idRegex.test(attributes);

    // Also check for ngh attribute (Angular 17+ hydration)
    const hasNghAttribute = /\bngh\b/i.test(attributes);

    if (isAngularState || hasNghAttribute) {
      try {
        const data = JSON.parse(content.trim());
        const text = extractTextFromObject(data);
        if (text.length > 50) {
          const title = extractTitleFromObject(data);
          return { title, text, structured: data };
        }
      } catch (error) {
        // Invalid JSON, continue to next match
        logger.intelligence.debug('Failed to parse Angular state JSON', { error });
      }
    }
  }

  // Check for Angular app indicators
  const hasAngularIndicators = detectAngularApp(html);
  if (!hasAngularIndicators) {
    return null;
  }

  // Try to extract initial state from various Angular patterns
  // Some Angular apps use window.__initialState or similar
  const statePatterns = [
    /window\.__(?:INITIAL_STATE|STATE|APP_STATE)__\s*=\s*({[\s\S]*?});?\s*<\/script>/s,
    /window\.(?:initialState|appState|state)\s*=\s*({[\s\S]*?});?\s*<\/script>/s,
  ];

  for (const pattern of statePatterns) {
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
        // Invalid JSON, continue
        logger.intelligence.debug('Failed to parse Angular window state JSON', { error });
      }
    }
  }

  return null;
}
