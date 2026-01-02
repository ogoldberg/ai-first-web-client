/**
 * URL Helper Utilities
 *
 * Provides environment-aware URL generation for cross-domain links.
 * In production, API routes go to api.unbrowser.ai, marketing routes to unbrowser.ai.
 * In development, all routes use relative paths.
 */

import type { HonoRequest } from 'hono';

/**
 * Domain constants
 */
const API_DOMAIN = 'https://api.unbrowser.ai';
const MARKETING_DOMAIN = 'https://unbrowser.ai';
const STATUS_DOMAIN = 'https://status.unbrowser.ai';
const GITHUB_REPO = 'https://github.com/unbrowser/unbrowser';

/**
 * Environment-aware URLs for navigation across domains
 */
export interface EnvironmentUrls {
  // API routes (api.unbrowser.ai)
  docs: string;
  llmTxt: string;
  llmMd: string;

  // Marketing routes (unbrowser.ai)
  home: string;
  pricing: string;
  authLogin: string;
  authSignup: string;
  authLogout: string;
  authForgotPassword: string;
  dashboard: string;
  dashboardApiKeys: string;
  dashboardUsage: string;
  dashboardSettings: string;
  privacy: string;
  terms: string;

  // External links
  status: string;
  github: string;
}

/**
 * Get environment-aware URLs based on the request context
 *
 * @param req - Hono request object
 * @returns Object with all environment-aware URLs
 *
 * @example
 * ```typescript
 * import { getEnvironmentUrls } from '../utils/url-helpers.js';
 *
 * app.get('/', (c) => {
 *   const urls = getEnvironmentUrls(c.req);
 *   return c.html(`<a href="${urls.docs}">Docs</a>`);
 * });
 * ```
 */
export function getEnvironmentUrls(req: HonoRequest): EnvironmentUrls {
  const isDev = process.env.NODE_ENV !== 'production';
  const host = req.header('host') || 'localhost:3001';
  const isApiDomain = host.includes('api.unbrowser.ai');
  const isMarketingDomain = host.includes('unbrowser.ai') && !isApiDomain;

  // API routes (docs, llm.txt, etc.)
  const apiBase = isDev ? '' : isMarketingDomain ? API_DOMAIN : '';

  // Marketing routes (auth, pricing, dashboard, etc.)
  const marketingBase = isDev ? '' : isApiDomain ? MARKETING_DOMAIN : '';

  return {
    // API routes
    docs: `${apiBase}/docs`,
    llmTxt: `${apiBase}/llm.txt`,
    llmMd: `${apiBase}/llm.md`,

    // Marketing routes
    home: marketingBase || '/',
    pricing: `${marketingBase}/pricing`,
    authLogin: `${marketingBase}/auth/login`,
    authSignup: `${marketingBase}/auth/signup`,
    authLogout: `${marketingBase}/auth/logout`,
    authForgotPassword: `${marketingBase}/auth/forgot-password`,
    dashboard: `${marketingBase}/dashboard`,
    dashboardApiKeys: `${marketingBase}/dashboard/api-keys`,
    dashboardUsage: `${marketingBase}/dashboard/usage`,
    dashboardSettings: `${marketingBase}/dashboard/settings`,
    privacy: `${marketingBase}/privacy`,
    terms: `${marketingBase}/terms`,

    // External links
    status: STATUS_DOMAIN,
    github: GITHUB_REPO,
  };
}

/**
 * Get a marketing URL (for use in marketing-only contexts)
 * This is a convenience function that always returns marketing domain URLs
 *
 * @param path - The path to append to the marketing base
 * @returns Full URL for the marketing domain
 */
export function getMarketingUrl(path: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const base = isDev ? '' : MARKETING_DOMAIN;
  return `${base}${path}`;
}

/**
 * Get an API URL (for use in API-only contexts)
 * This is a convenience function that always returns API domain URLs
 *
 * @param path - The path to append to the API base
 * @returns Full URL for the API domain
 */
export function getApiUrl(path: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const base = isDev ? '' : API_DOMAIN;
  return `${base}${path}`;
}
