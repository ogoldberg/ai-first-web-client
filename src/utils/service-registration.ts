/**
 * Service Registration Module (D-006)
 *
 * Registers core services with the DI container.
 * This module provides:
 * - Default service registrations for the application
 * - Test-friendly registration with mock injection points
 * - Backward compatibility with existing module exports
 */

import {
  ServiceContainer,
  getServiceContainer,
  ServiceTokens,
} from './service-container.js';
import { RateLimiter } from './rate-limiter.js';
import { ResponseCache, ContentCache } from './cache.js';
import { HttpClient } from './http-client.js';
import { logger } from './logger.js';

const log = logger.create('ServiceRegistration');

/**
 * Options for registering services
 */
export interface ServiceRegistrationOptions {
  /** Skip registering services that are already registered */
  skipExisting?: boolean;
  /** Custom container to register services in (defaults to global) */
  container?: ServiceContainer;
}

/**
 * Register core utility services with the container.
 *
 * These are lightweight services that don't have heavy dependencies.
 */
export function registerCoreServices(options: ServiceRegistrationOptions = {}): void {
  const { skipExisting = true, container = getServiceContainer() } = options;

  // Rate Limiter
  if (!skipExisting || !container.has(ServiceTokens.RateLimiter)) {
    container.registerSingleton(
      ServiceTokens.RateLimiter,
      () => new RateLimiter(),
      ['core', 'utility']
    );
    log.debug('Registered RateLimiter service');
  }

  // Page Cache (HTML content cache)
  if (!skipExisting || !container.has(ServiceTokens.PageCache)) {
    container.registerSingleton(
      ServiceTokens.PageCache,
      () =>
        new ContentCache({
          ttlMs: 15 * 60 * 1000, // 15 minutes
          maxEntries: 500,
        }),
      ['core', 'cache']
    );
    log.debug('Registered PageCache service');
  }

  // API Cache (response cache)
  if (!skipExisting || !container.has(ServiceTokens.ApiCache)) {
    container.registerSingleton(
      ServiceTokens.ApiCache,
      () =>
        new ResponseCache({
          ttlMs: 5 * 60 * 1000, // 5 minutes
          maxEntries: 200,
        }),
      ['core', 'cache']
    );
    log.debug('Registered ApiCache service');
  }

  // HTTP Client with connection pooling
  if (!skipExisting || !container.has(ServiceTokens.HttpClient)) {
    container.registerSingleton(
      ServiceTokens.HttpClient,
      () => new HttpClient(),
      ['core', 'network']
    );
    log.debug('Registered HttpClient service');
  }

  log.info('Core services registered');
}

/**
 * Register all application services.
 *
 * This is the main entry point for bootstrapping the application.
 * Call this early in application startup.
 */
export function registerAllServices(options: ServiceRegistrationOptions = {}): void {
  registerCoreServices(options);
  // Future: registerBrowserServices, registerLearningServices, etc.
}

/**
 * Get the rate limiter service from the container.
 * Falls back to creating a new instance if not registered.
 */
export function getRateLimiterService(
  container: ServiceContainer = getServiceContainer()
): RateLimiter {
  if (!container.has(ServiceTokens.RateLimiter)) {
    registerCoreServices({ container });
  }
  return container.get<RateLimiter>(ServiceTokens.RateLimiter);
}

/**
 * Get the page cache service from the container.
 * Falls back to creating a new instance if not registered.
 */
export function getPageCacheService(
  container: ServiceContainer = getServiceContainer()
): ContentCache {
  if (!container.has(ServiceTokens.PageCache)) {
    registerCoreServices({ container });
  }
  return container.get<ContentCache>(ServiceTokens.PageCache);
}

/**
 * Get the API cache service from the container.
 * Falls back to creating a new instance if not registered.
 */
export function getApiCacheService(
  container: ServiceContainer = getServiceContainer()
): ResponseCache {
  if (!container.has(ServiceTokens.ApiCache)) {
    registerCoreServices({ container });
  }
  return container.get<ResponseCache>(ServiceTokens.ApiCache);
}

/**
 * Get the HTTP client service from the container.
 * Falls back to creating a new instance if not registered.
 */
export function getHttpClientService(
  container: ServiceContainer = getServiceContainer()
): HttpClient {
  if (!container.has(ServiceTokens.HttpClient)) {
    registerCoreServices({ container });
  }
  return container.get<HttpClient>(ServiceTokens.HttpClient);
}

/**
 * Clear all caches registered in the container.
 * Useful for testing or resetting state.
 */
export function clearAllCaches(
  container: ServiceContainer = getServiceContainer()
): void {
  const caches = container.getByTag<ResponseCache | ContentCache>('cache');
  for (const cache of caches) {
    cache.clear();
  }
  log.debug('Cleared all caches', { count: caches.length });
}

/**
 * Get statistics for all registered services.
 */
export function getServiceStats(
  container: ServiceContainer = getServiceContainer()
): Record<string, unknown> {
  const stats: Record<string, unknown> = {};

  // Container stats
  stats.container = container.getStats();
  stats.initializationOrder = container.getInitializationOrder();

  // Rate limiter stats
  if (container.has(ServiceTokens.RateLimiter)) {
    const rateLimiter = container.get<RateLimiter>(ServiceTokens.RateLimiter);
    stats.rateLimiter = {
      // RateLimiter doesn't have a getStats method, but we could add one
      registered: true,
    };
  }

  // Cache stats
  if (container.has(ServiceTokens.PageCache)) {
    const pageCache = container.get<ContentCache>(ServiceTokens.PageCache);
    stats.pageCache = pageCache.getStats();
  }

  if (container.has(ServiceTokens.ApiCache)) {
    const apiCache = container.get<ResponseCache>(ServiceTokens.ApiCache);
    stats.apiCache = apiCache.getStats();
  }

  // HTTP client stats
  if (container.has(ServiceTokens.HttpClient)) {
    const httpClient = container.get<HttpClient>(ServiceTokens.HttpClient);
    stats.httpClient = httpClient.getStats();
  }

  return stats;
}
