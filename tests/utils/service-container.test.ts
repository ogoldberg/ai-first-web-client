/**
 * Service Container Tests (D-006)
 *
 * Tests for the lightweight dependency injection container.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ServiceContainer,
  getServiceContainer,
  setServiceContainer,
  resetServiceContainer,
  resetServiceInstances,
  ServiceTokens,
  getService,
  getOptionalService,
  hasService,
  type ServiceLifetime,
} from '../../src/utils/service-container.js';

describe('Service Container', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer({ debug: false });
    resetServiceContainer();
  });

  describe('ServiceContainer class', () => {
    describe('singleton registration', () => {
      it('should register and retrieve a singleton service', () => {
        const factory = vi.fn(() => ({ value: 42 }));
        container.registerSingleton('testService', factory);

        const service1 = container.get<{ value: number }>('testService');
        const service2 = container.get<{ value: number }>('testService');

        expect(service1).toEqual({ value: 42 });
        expect(service1).toBe(service2); // Same instance
        expect(factory).toHaveBeenCalledTimes(1); // Factory called only once
      });

      it('should support method chaining', () => {
        const result = container
          .registerSingleton('service1', () => 1)
          .registerSingleton('service2', () => 2)
          .registerSingleton('service3', () => 3);

        expect(result).toBe(container);
        expect(container.get('service1')).toBe(1);
        expect(container.get('service2')).toBe(2);
        expect(container.get('service3')).toBe(3);
      });

      it('should lazily initialize singletons', () => {
        const factory = vi.fn(() => 'lazy');
        container.registerSingleton('lazy', factory);

        expect(factory).not.toHaveBeenCalled();

        container.get('lazy');

        expect(factory).toHaveBeenCalledTimes(1);
      });

      it('should support tags', () => {
        container.registerSingleton('db1', () => ({ name: 'db1' }), ['database']);
        container.registerSingleton('db2', () => ({ name: 'db2' }), ['database']);
        container.registerSingleton('cache', () => ({ name: 'cache' }), ['cache']);

        const databases = container.getByTag<{ name: string }>('database');
        expect(databases).toHaveLength(2);
        expect(databases.map((d) => d.name)).toContain('db1');
        expect(databases.map((d) => d.name)).toContain('db2');
      });
    });

    describe('async singleton registration', () => {
      it('should register and retrieve async singleton', async () => {
        const factory = vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { async: true };
        });

        container.registerSingletonAsync('asyncService', factory);

        const service1 = await container.getAsync<{ async: boolean }>('asyncService');
        const service2 = await container.getAsync<{ async: boolean }>('asyncService');

        expect(service1).toEqual({ async: true });
        expect(service1).toBe(service2);
        expect(factory).toHaveBeenCalledTimes(1);
      });

      it('should throw when accessing async service with get()', () => {
        container.registerSingletonAsync('asyncService', async () => 'async');

        expect(() => container.get('asyncService')).toThrow(
          "Service 'asyncService' is async. Use getAsync() instead."
        );
      });
    });

    describe('transient registration', () => {
      it('should create new instance on each access', () => {
        let counter = 0;
        container.registerTransient('counter', () => ({ count: ++counter }));

        const instance1 = container.get<{ count: number }>('counter');
        const instance2 = container.get<{ count: number }>('counter');
        const instance3 = container.get<{ count: number }>('counter');

        expect(instance1.count).toBe(1);
        expect(instance2.count).toBe(2);
        expect(instance3.count).toBe(3);
        expect(instance1).not.toBe(instance2);
        expect(instance2).not.toBe(instance3);
      });
    });

    describe('instance registration', () => {
      it('should register an existing instance', () => {
        const existingInstance = { preCreated: true };
        container.registerInstance('existing', existingInstance);

        const retrieved = container.get<typeof existingInstance>('existing');
        expect(retrieved).toBe(existingInstance);
      });
    });

    describe('service retrieval', () => {
      it('should throw for unknown service', () => {
        expect(() => container.get('unknown')).toThrow('Service not found: unknown');
      });

      it('should return undefined for optional unknown service', () => {
        const result = container.getOptional('unknown');
        expect(result).toBeUndefined();
      });

      it('should return value for optional known service', () => {
        container.registerSingleton('known', () => 'value');
        const result = container.getOptional<string>('known');
        expect(result).toBe('value');
      });
    });

    describe('has()', () => {
      it('should return true for registered service', () => {
        container.registerSingleton('exists', () => null);
        expect(container.has('exists')).toBe(true);
      });

      it('should return false for unregistered service', () => {
        expect(container.has('missing')).toBe(false);
      });
    });

    describe('unregister()', () => {
      it('should remove a registered service', () => {
        container.registerSingleton('toRemove', () => 'value');
        expect(container.has('toRemove')).toBe(true);

        const result = container.unregister('toRemove');
        expect(result).toBe(true);
        expect(container.has('toRemove')).toBe(false);
      });

      it('should return false when service not found', () => {
        const result = container.unregister('nonexistent');
        expect(result).toBe(false);
      });
    });

    describe('resetInstances()', () => {
      it('should reset singleton instances but keep registrations', () => {
        let callCount = 0;
        container.registerSingleton('resettable', () => ({ call: ++callCount }));

        const first = container.get<{ call: number }>('resettable');
        expect(first.call).toBe(1);

        container.resetInstances();

        const second = container.get<{ call: number }>('resettable');
        expect(second.call).toBe(2);
        expect(second).not.toBe(first);
      });

      it('should not affect transient services', () => {
        let callCount = 0;
        container.registerTransient('transient', () => ({ call: ++callCount }));

        container.get('transient');
        container.get('transient');
        expect(callCount).toBe(2);

        container.resetInstances();

        container.get('transient');
        expect(callCount).toBe(3);
      });

      it('should clear initialization order', () => {
        container.registerSingleton('s1', () => 1);
        container.registerSingleton('s2', () => 2);

        container.get('s1');
        container.get('s2');

        expect(container.getInitializationOrder()).toEqual(['s1', 's2']);

        container.resetInstances();

        expect(container.getInitializationOrder()).toEqual([]);
      });
    });

    describe('reset()', () => {
      it('should clear all registrations and instances', () => {
        container.registerSingleton('service1', () => 1);
        container.registerSingleton('service2', () => 2);

        container.get('service1');

        container.reset();

        expect(container.has('service1')).toBe(false);
        expect(container.has('service2')).toBe(false);
        expect(container.getRegisteredServices()).toEqual([]);
      });
    });

    describe('getRegisteredServices()', () => {
      it('should return list of registered service names', () => {
        container.registerSingleton('a', () => 'a');
        container.registerSingleton('b', () => 'b');
        container.registerTransient('c', () => 'c');

        const services = container.getRegisteredServices();
        expect(services).toContain('a');
        expect(services).toContain('b');
        expect(services).toContain('c');
        expect(services).toHaveLength(3);
      });
    });

    describe('getInitializationOrder()', () => {
      it('should track initialization order', () => {
        container.registerSingleton('first', () => 1);
        container.registerSingleton('second', () => 2);
        container.registerSingleton('third', () => 3);

        container.get('second');
        container.get('first');
        container.get('third');

        expect(container.getInitializationOrder()).toEqual([
          'second',
          'first',
          'third',
        ]);
      });

      it('should not track transient services', () => {
        container.registerSingleton('singleton', () => 's');
        container.registerTransient('transient', () => 't');

        container.get('singleton');
        container.get('transient');
        container.get('transient');

        expect(container.getInitializationOrder()).toEqual(['singleton']);
      });
    });

    describe('getStats()', () => {
      it('should return accurate statistics', () => {
        container.registerSingleton('s1', () => 1);
        container.registerSingleton('s2', () => 2);
        container.registerTransient('t1', () => 3);
        container.registerSingletonAsync('a1', async () => 4);

        container.get('s1');

        const stats = container.getStats();

        expect(stats.totalServices).toBe(4);
        expect(stats.singletons).toBe(3); // s1, s2, a1
        expect(stats.transients).toBe(1); // t1
        expect(stats.initializedSingletons).toBe(1); // s1
        expect(stats.asyncServices).toBe(1); // a1
      });
    });

    describe('validation', () => {
      it('should throw for empty service name', () => {
        expect(() => container.registerSingleton('', () => null)).toThrow(
          'Service name must be a non-empty string'
        );
      });

      it('should allow overwriting existing registration', () => {
        container.registerSingleton('overwrite', () => 'first');
        container.registerSingleton('overwrite', () => 'second');

        expect(container.get('overwrite')).toBe('second');
      });
    });

    describe('getByTag()', () => {
      it('should return empty array when no services match', () => {
        container.registerSingleton('service', () => 'value', ['other']);
        const results = container.getByTag('missing');
        expect(results).toEqual([]);
      });

      it('should throw for async services in tag group', () => {
        container.registerSingletonAsync('async', async () => 'value', ['myTag']);

        expect(() => container.getByTag('myTag')).toThrow(
          "Service 'async' with tag 'myTag' is async"
        );
      });
    });

    describe('getByTagAsync()', () => {
      it('should handle mixed sync and async services', async () => {
        container.registerSingleton('sync', () => ({ type: 'sync' }), ['mixed']);
        container.registerSingletonAsync(
          'async',
          async () => ({ type: 'async' }),
          ['mixed']
        );

        const results = await container.getByTagAsync<{ type: string }>('mixed');

        expect(results).toHaveLength(2);
        expect(results.map((r) => r.type)).toContain('sync');
        expect(results.map((r) => r.type)).toContain('async');
      });
    });
  });

  describe('Global container functions', () => {
    describe('getServiceContainer()', () => {
      it('should return the same container instance', () => {
        const container1 = getServiceContainer();
        const container2 = getServiceContainer();
        expect(container1).toBe(container2);
      });

      it('should create a new container if none exists', () => {
        resetServiceContainer();
        const container = getServiceContainer();
        expect(container).toBeInstanceOf(ServiceContainer);
      });
    });

    describe('setServiceContainer()', () => {
      it('should replace the global container', () => {
        const customContainer = new ServiceContainer({ name: 'custom' });
        customContainer.registerSingleton('custom', () => 'customValue');

        setServiceContainer(customContainer);

        expect(getServiceContainer()).toBe(customContainer);
        expect(getService<string>('custom')).toBe('customValue');
      });
    });

    describe('resetServiceContainer()', () => {
      it('should reset the global container', () => {
        const container = getServiceContainer();
        container.registerSingleton('test', () => 'value');

        resetServiceContainer();

        const newContainer = getServiceContainer();
        expect(newContainer).not.toBe(container);
        expect(newContainer.has('test')).toBe(false);
      });
    });

    describe('resetServiceInstances()', () => {
      it('should reset instances in global container', () => {
        let count = 0;
        getServiceContainer().registerSingleton('counter', () => ++count);

        getService('counter');
        expect(count).toBe(1);

        resetServiceInstances();

        getService('counter');
        expect(count).toBe(2);
      });
    });
  });

  describe('Typed service helpers', () => {
    beforeEach(() => {
      getServiceContainer().registerSingleton(ServiceTokens.Config, () => ({
        env: 'test',
      }));
    });

    describe('getService()', () => {
      it('should retrieve service by token', () => {
        const config = getService<{ env: string }>(ServiceTokens.Config);
        expect(config.env).toBe('test');
      });
    });

    describe('getOptionalService()', () => {
      it('should return undefined for missing service', () => {
        const logger = getOptionalService(ServiceTokens.Logger);
        expect(logger).toBeUndefined();
      });

      it('should return service when present', () => {
        const config = getOptionalService<{ env: string }>(ServiceTokens.Config);
        expect(config?.env).toBe('test');
      });
    });

    describe('hasService()', () => {
      it('should return true for registered service', () => {
        expect(hasService(ServiceTokens.Config)).toBe(true);
      });

      it('should return false for unregistered service', () => {
        expect(hasService(ServiceTokens.Logger)).toBe(false);
      });
    });
  });

  describe('ServiceTokens', () => {
    it('should have unique values', () => {
      const values = Object.values(ServiceTokens);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should contain expected core services', () => {
      expect(ServiceTokens.SmartBrowser).toBe('smartBrowser');
      expect(ServiceTokens.LearningEngine).toBe('learningEngine');
      expect(ServiceTokens.SessionManager).toBe('sessionManager');
      expect(ServiceTokens.RateLimiter).toBe('rateLimiter');
    });
  });

  describe('Edge cases', () => {
    it('should handle factory that returns null', () => {
      container.registerSingleton('nullable', () => null);
      const value = container.get('nullable');
      expect(value).toBeNull();
    });

    it('should handle factory that returns undefined', () => {
      container.registerSingleton('undef', () => undefined);
      const value = container.get('undef');
      expect(value).toBeUndefined();
    });

    it('should handle factory that throws', () => {
      container.registerSingleton('throwing', () => {
        throw new Error('Factory error');
      });

      expect(() => container.get('throwing')).toThrow('Factory error');
    });

    it('should handle async factory that rejects', async () => {
      container.registerSingletonAsync('rejecting', async () => {
        throw new Error('Async factory error');
      });

      await expect(container.getAsync('rejecting')).rejects.toThrow(
        'Async factory error'
      );
    });

    it('should support complex nested dependencies', () => {
      container.registerSingleton('config', () => ({ dbUrl: 'localhost' }));
      container.registerSingleton('db', () => {
        const config = container.get<{ dbUrl: string }>('config');
        return { connection: config.dbUrl };
      });
      container.registerSingleton('repo', () => {
        const db = container.get<{ connection: string }>('db');
        return { query: () => db.connection };
      });

      const repo = container.get<{ query: () => string }>('repo');
      expect(repo.query()).toBe('localhost');
    });
  });
});
