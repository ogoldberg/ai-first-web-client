/**
 * Service Container - Lightweight Dependency Injection (D-006)
 *
 * A simple service registry that enables:
 * - Type-safe service registration and retrieval
 * - Factory-based lazy initialization
 * - Service lifecycle management (singleton vs transient)
 * - Test isolation via reset mechanism
 *
 * Usage:
 * ```ts
 * // Register a singleton service
 * container.registerSingleton('logger', () => createLogger());
 *
 * // Register a transient service (new instance each time)
 * container.registerTransient('cache', () => new Cache());
 *
 * // Get a service
 * const logger = container.get<Logger>('logger');
 *
 * // Reset for testing
 * container.reset();
 * ```
 */

import { logger } from './logger.js';

const log = logger.create('ServiceContainer');

// ============================================
// TYPES
// ============================================

/**
 * Service lifetime options
 */
export type ServiceLifetime = 'singleton' | 'transient';

/**
 * Service factory function type
 */
export type ServiceFactory<T> = () => T;

/**
 * Async service factory function type
 */
export type AsyncServiceFactory<T> = () => Promise<T>;

/**
 * Service registration entry
 */
interface ServiceRegistration<T = unknown> {
  /** Factory function to create the service */
  factory: ServiceFactory<T> | AsyncServiceFactory<T>;
  /** Service lifetime */
  lifetime: ServiceLifetime;
  /** Cached instance for singletons */
  instance?: T;
  /** Whether the factory is async */
  isAsync: boolean;
  /** Service tags for filtering */
  tags: string[];
}

/**
 * Service container configuration
 */
export interface ServiceContainerConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Name for this container (useful for debugging multiple containers) */
  name?: string;
}

// ============================================
// SERVICE CONTAINER CLASS
// ============================================

/**
 * A lightweight service container for dependency injection.
 *
 * Features:
 * - Type-safe service registration and retrieval
 * - Singleton and transient lifetimes
 * - Lazy initialization via factory functions
 * - Test-friendly reset mechanism
 * - Tag-based service grouping
 *
 * @example
 * ```ts
 * const container = new ServiceContainer();
 *
 * // Register services
 * container.registerSingleton('db', () => new Database());
 * container.registerTransient('request', () => new Request());
 *
 * // Get services
 * const db = container.get<Database>('db');
 * ```
 */
export class ServiceContainer {
  private readonly services: Map<string, ServiceRegistration> = new Map();
  private readonly config: Required<ServiceContainerConfig>;
  private initializationOrder: string[] = [];

  constructor(config: ServiceContainerConfig = {}) {
    this.config = {
      debug: config.debug ?? false,
      name: config.name ?? 'default',
    };
  }

  /**
   * Register a singleton service.
   * The factory is called once on first access, then cached.
   */
  registerSingleton<T>(
    name: string,
    factory: ServiceFactory<T>,
    tags: string[] = []
  ): this {
    this.validateName(name);
    this.services.set(name, {
      factory,
      lifetime: 'singleton',
      isAsync: false,
      tags,
    });
    if (this.config.debug) {
      log.debug('Registered singleton service', { name, tags });
    }
    return this;
  }

  /**
   * Register an async singleton service.
   * The factory is called once on first access, then cached.
   */
  registerSingletonAsync<T>(
    name: string,
    factory: AsyncServiceFactory<T>,
    tags: string[] = []
  ): this {
    this.validateName(name);
    this.services.set(name, {
      factory,
      lifetime: 'singleton',
      isAsync: true,
      tags,
    });
    if (this.config.debug) {
      log.debug('Registered async singleton service', { name, tags });
    }
    return this;
  }

  /**
   * Register a transient service.
   * The factory is called on every access.
   */
  registerTransient<T>(
    name: string,
    factory: ServiceFactory<T>,
    tags: string[] = []
  ): this {
    this.validateName(name);
    this.services.set(name, {
      factory,
      lifetime: 'transient',
      isAsync: false,
      tags,
    });
    if (this.config.debug) {
      log.debug('Registered transient service', { name, tags });
    }
    return this;
  }

  /**
   * Register an existing instance as a singleton.
   * Useful for externally created services.
   */
  registerInstance<T>(
    name: string,
    instance: T,
    tags: string[] = []
  ): this {
    this.validateName(name);
    this.services.set(name, {
      factory: () => instance,
      lifetime: 'singleton',
      instance,
      isAsync: false,
      tags,
    });
    if (this.config.debug) {
      log.debug('Registered instance', { name, tags });
    }
    return this;
  }

  /**
   * Get a service by name.
   * @throws Error if service is not found or is async
   */
  get<T>(name: string): T {
    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`Service not found: ${name}`);
    }

    if (registration.isAsync) {
      throw new Error(
        `Service '${name}' is async. Use getAsync() instead.`
      );
    }

    return this.resolveSync<T>(name, registration);
  }

  /**
   * Get a service by name, or undefined if not found.
   */
  getOptional<T>(name: string): T | undefined {
    if (!this.has(name)) {
      return undefined;
    }
    return this.get<T>(name);
  }

  /**
   * Get an async service by name.
   */
  async getAsync<T>(name: string): Promise<T> {
    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`Service not found: ${name}`);
    }

    if (registration.isAsync) {
      return this.resolveAsync<T>(name, registration);
    }

    return this.resolveSync<T>(name, registration);
  }

  /**
   * Check if a service is registered.
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all services with a specific tag.
   */
  getByTag<T>(tag: string): T[] {
    const results: T[] = [];
    for (const [name, registration] of this.services) {
      if (registration.tags.includes(tag)) {
        if (registration.isAsync) {
          throw new Error(
            `Service '${name}' with tag '${tag}' is async. Use getByTagAsync() instead.`
          );
        }
        results.push(this.resolveSync<T>(name, registration));
      }
    }
    return results;
  }

  /**
   * Get all services with a specific tag (async).
   */
  async getByTagAsync<T>(tag: string): Promise<T[]> {
    const results: T[] = [];
    for (const [name, registration] of this.services) {
      if (registration.tags.includes(tag)) {
        if (registration.isAsync) {
          results.push(await this.resolveAsync<T>(name, registration));
        } else {
          results.push(this.resolveSync<T>(name, registration));
        }
      }
    }
    return results;
  }

  /**
   * Unregister a service.
   */
  unregister(name: string): boolean {
    const existed = this.services.delete(name);
    if (existed && this.config.debug) {
      log.debug('Unregistered service', { name });
    }
    return existed;
  }

  /**
   * Reset all singleton instances.
   * Services remain registered but will be recreated on next access.
   * Useful for test isolation.
   */
  resetInstances(): void {
    for (const registration of this.services.values()) {
      if (registration.lifetime === 'singleton') {
        registration.instance = undefined;
      }
    }
    this.initializationOrder = [];
    if (this.config.debug) {
      log.debug('Reset all singleton instances');
    }
  }

  /**
   * Reset the entire container.
   * All registrations and instances are cleared.
   */
  reset(): void {
    this.services.clear();
    this.initializationOrder = [];
    if (this.config.debug) {
      log.debug('Reset container');
    }
  }

  /**
   * Get the list of registered service names.
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get the initialization order of singleton services.
   */
  getInitializationOrder(): string[] {
    return [...this.initializationOrder];
  }

  /**
   * Get container statistics.
   */
  getStats(): {
    totalServices: number;
    singletons: number;
    transients: number;
    initializedSingletons: number;
    asyncServices: number;
  } {
    let singletons = 0;
    let transients = 0;
    let initializedSingletons = 0;
    let asyncServices = 0;

    for (const registration of this.services.values()) {
      if (registration.lifetime === 'singleton') {
        singletons++;
        if (registration.instance !== undefined) {
          initializedSingletons++;
        }
      } else {
        transients++;
      }
      if (registration.isAsync) {
        asyncServices++;
      }
    }

    return {
      totalServices: this.services.size,
      singletons,
      transients,
      initializedSingletons,
      asyncServices,
    };
  }

  /**
   * Resolve a synchronous service.
   */
  private resolveSync<T>(
    name: string,
    registration: ServiceRegistration
  ): T {
    if (registration.lifetime === 'singleton') {
      if (registration.instance === undefined) {
        registration.instance = (registration.factory as ServiceFactory<T>)();
        this.initializationOrder.push(name);
        if (this.config.debug) {
          log.debug('Initialized singleton', { name });
        }
      }
      return registration.instance as T;
    }

    // Transient: always create new instance
    return (registration.factory as ServiceFactory<T>)();
  }

  /**
   * Resolve an asynchronous service.
   */
  private async resolveAsync<T>(
    name: string,
    registration: ServiceRegistration
  ): Promise<T> {
    if (registration.lifetime === 'singleton') {
      if (registration.instance === undefined) {
        registration.instance = await (
          registration.factory as AsyncServiceFactory<T>
        )();
        this.initializationOrder.push(name);
        if (this.config.debug) {
          log.debug('Initialized async singleton', { name });
        }
      }
      return registration.instance as T;
    }

    // Transient: always create new instance
    return (registration.factory as AsyncServiceFactory<T>)();
  }

  /**
   * Validate service name.
   */
  private validateName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Service name must be a non-empty string');
    }
    if (this.services.has(name)) {
      log.warn('Overwriting existing service registration', { name });
    }
  }
}

// ============================================
// GLOBAL CONTAINER
// ============================================

/** The default global service container */
let globalContainer: ServiceContainer | null = null;

/**
 * Get the global service container.
 * Creates one if it doesn't exist.
 */
export function getServiceContainer(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer({ name: 'global' });
  }
  return globalContainer;
}

/**
 * Set the global service container.
 * Useful for testing or custom configurations.
 */
export function setServiceContainer(container: ServiceContainer): void {
  globalContainer = container;
}

/**
 * Reset the global service container.
 * Creates a fresh container instance.
 */
export function resetServiceContainer(): void {
  globalContainer?.reset();
  globalContainer = null;
}

/**
 * Reset only the singleton instances in the global container.
 * Keeps service registrations intact.
 */
export function resetServiceInstances(): void {
  globalContainer?.resetInstances();
}

// ============================================
// SERVICE TOKENS (Type-safe service names)
// ============================================

/**
 * Well-known service names for type-safe service access.
 * Use these instead of string literals.
 */
export const ServiceTokens = {
  // Core services
  Logger: 'logger',
  BrowserManager: 'browserManager',
  SessionManager: 'sessionManager',
  ContentExtractor: 'contentExtractor',
  ApiAnalyzer: 'apiAnalyzer',
  SmartBrowser: 'smartBrowser',

  // Learning services
  LearningEngine: 'learningEngine',
  ProceduralMemory: 'proceduralMemory',
  VectorStore: 'vectorStore',
  EmbeddingProvider: 'embeddingProvider',

  // Infrastructure services
  RateLimiter: 'rateLimiter',
  PageCache: 'pageCache',
  ApiCache: 'apiCache',
  PerformanceTracker: 'performanceTracker',
  HttpClient: 'httpClient',

  // Fetcher services
  TieredFetcher: 'tieredFetcher',
  ContentIntelligence: 'contentIntelligence',
  LightweightRenderer: 'lightweightRenderer',

  // Feature services
  FeedbackService: 'feedbackService',
  WebhookService: 'webhookService',
  VerificationEngine: 'verificationEngine',
  DebugTraceRecorder: 'debugTraceRecorder',
  WorkflowRecorder: 'workflowRecorder',

  // Configuration
  Config: 'config',
} as const;

export type ServiceToken = typeof ServiceTokens[keyof typeof ServiceTokens];

// ============================================
// TYPED SERVICE HELPERS
// ============================================

/**
 * Type-safe helper to get a service from the global container.
 */
export function getService<T>(token: ServiceToken): T {
  return getServiceContainer().get<T>(token);
}

/**
 * Type-safe helper to get an optional service from the global container.
 */
export function getOptionalService<T>(token: ServiceToken): T | undefined {
  return getServiceContainer().getOptional<T>(token);
}

/**
 * Type-safe helper to get an async service from the global container.
 */
export async function getServiceAsync<T>(token: ServiceToken): Promise<T> {
  return getServiceContainer().getAsync<T>(token);
}

/**
 * Type-safe helper to check if a service is registered.
 */
export function hasService(token: ServiceToken): boolean {
  return getServiceContainer().has(token);
}
