/**
 * Proxy Middleware
 *
 * Handles proxy selection and health reporting for browse requests.
 */

import type { Context, Next } from 'hono';
import type { Plan } from './types.js';
import { getProxyManager, hasProxiesConfigured } from '../services/proxy-manager.js';
import type { ProxyBrowseOptions, ProxyInstance, FailureReason } from '../services/proxy-types.js';

/**
 * Extended context with proxy information
 */
declare module 'hono' {
  interface ContextVariableMap {
    proxyInfo?: {
      proxy: ProxyInstance;
      tier: string;
      riskLevel: string;
      selectionReason: string;
    };
    proxyEnabled: boolean;
  }
}

/**
 * Middleware to set proxy availability flag
 */
export function proxyAvailabilityMiddleware(c: Context, next: Next) {
  c.set('proxyEnabled', hasProxiesConfigured());
  return next();
}

/**
 * Select a proxy for the current request
 */
export async function selectProxyForRequest(
  domain: string,
  tenantId: string,
  tenantPlan: Plan,
  options?: ProxyBrowseOptions
): Promise<{
  proxy: ProxyInstance;
  tier: string;
  riskLevel: string;
  selectionReason: string;
  recommendedDelay: number;
} | null> {
  if (!hasProxiesConfigured()) {
    return null;
  }

  const proxyManager = getProxyManager();

  try {
    const result = await proxyManager.getProxy({
      domain,
      tenantId,
      tenantPlan,
      proxyOptions: options,
    });

    return {
      proxy: result.proxy,
      tier: result.tier,
      riskLevel: result.riskAssessment.riskLevel,
      selectionReason: result.selectionReason,
      recommendedDelay: result.riskAssessment.recommendedDelayMs,
    };
  } catch (error) {
    // Log but don't fail - browsing can continue without proxy
    console.warn('Failed to select proxy:', error);
    return null;
  }
}

/**
 * Report successful request to proxy health tracker
 */
export function reportProxySuccess(proxyId: string, domain: string, latencyMs: number): void {
  if (!hasProxiesConfigured()) return;

  const proxyManager = getProxyManager();
  proxyManager.reportSuccess(proxyId, domain, latencyMs);
}

/**
 * Report failed request to proxy health tracker
 */
export function reportProxyFailure(proxyId: string, domain: string, reason: FailureReason): void {
  if (!hasProxiesConfigured()) return;

  const proxyManager = getProxyManager();
  proxyManager.reportFailure(proxyId, domain, reason);
}

/**
 * Report detected bot protection
 */
export function reportProtectionDetected(
  domain: string,
  headers: Record<string, string>,
  body?: string
): void {
  if (!hasProxiesConfigured()) return;

  const proxyManager = getProxyManager();
  proxyManager.reportProtectionDetected(domain, headers, body);
}

/**
 * Get a fallback proxy after failure
 */
export async function getFallbackProxy(
  originalProxy: ProxyInstance,
  domain: string,
  tenantPlan: Plan
): Promise<ProxyInstance | null> {
  if (!hasProxiesConfigured()) return null;

  const proxyManager = getProxyManager();
  return proxyManager.getFallbackProxy(originalProxy, domain, tenantPlan);
}

/**
 * Get proxy statistics for monitoring
 */
export function getProxyStats() {
  if (!hasProxiesConfigured()) {
    return {
      enabled: false,
      pools: [],
    };
  }

  const proxyManager = getProxyManager();
  return {
    enabled: true,
    pools: proxyManager.getPoolStats(),
  };
}

/**
 * Detect failure reason from error or response
 */
export function detectFailureReason(
  error?: Error,
  statusCode?: number,
  body?: string
): FailureReason {
  // Check error message
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('econnrefused') || message.includes('connection')) return 'connection_error';
    if (message.includes('auth')) return 'authentication';
  }

  // Check status code
  if (statusCode) {
    if (statusCode === 403) return 'blocked';
    if (statusCode === 429) return 'rate_limited';
    if (statusCode === 407) return 'authentication';
  }

  // Check body for challenge indicators
  if (body) {
    const lowerBody = body.toLowerCase();
    if (
      lowerBody.includes('captcha') ||
      lowerBody.includes('challenge') ||
      lowerBody.includes('verify you are human')
    ) {
      return 'captcha';
    }
    if (
      lowerBody.includes('blocked') ||
      lowerBody.includes('access denied') ||
      lowerBody.includes('forbidden')
    ) {
      return 'blocked';
    }
  }

  return 'unknown';
}

/**
 * Format proxy metadata for API response
 */
export function formatProxyMetadata(proxyInfo: {
  proxy: ProxyInstance;
  tier: string;
  riskLevel: string;
  selectionReason: string;
} | null): Record<string, unknown> | undefined {
  if (!proxyInfo) {
    return undefined;
  }

  return {
    tier: proxyInfo.tier,
    riskLevel: proxyInfo.riskLevel,
    selectionReason: proxyInfo.selectionReason,
    country: proxyInfo.proxy.endpoint.country,
  };
}
