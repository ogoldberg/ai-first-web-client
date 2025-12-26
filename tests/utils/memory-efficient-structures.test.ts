/**
 * Memory-Efficient Data Structures Tests (P-003)
 *
 * Tests for LRU cache, domain-indexed collections, and quantized embeddings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LRUCache,
  DomainIndexedMap,
  QuantizedEmbedding,
  quantizeEmbeddings,
  dequantizeEmbeddings,
  formatBytes,
  estimateSize,
} from '../../src/utils/memory-efficient-structures.js';

describe('Memory-Efficient Structures', () => {
  describe('LRUCache', () => {
    let cache: LRUCache<string, number>;

    beforeEach(() => {
      cache = new LRUCache<string, number>(3);
    });

    describe('basic operations', () => {
      it('should set and get values', () => {
        cache.set('a', 1);
        expect(cache.get('a')).toBe(1);
      });

      it('should return undefined for missing keys', () => {
        expect(cache.get('missing')).toBeUndefined();
      });

      it('should check if key exists', () => {
        cache.set('a', 1);
        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false);
      });

      it('should delete entries', () => {
        cache.set('a', 1);
        expect(cache.delete('a')).toBe(true);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.delete('a')).toBe(false);
      });

      it('should clear all entries', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.get('a')).toBeUndefined();
      });

      it('should track size', () => {
        expect(cache.size).toBe(0);
        cache.set('a', 1);
        expect(cache.size).toBe(1);
        cache.set('b', 2);
        expect(cache.size).toBe(2);
        cache.delete('a');
        expect(cache.size).toBe(1);
      });
    });

    describe('LRU eviction', () => {
      it('should evict least recently used when at capacity', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // Cache is now full, adding d should evict a (oldest)
        const evicted = cache.set('d', 4);

        expect(evicted).toEqual({ key: 'a', value: 1 });
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('d')).toBe(4);
      });

      it('should update LRU order on get', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // Access 'a' to move it to head
        cache.get('a');

        // Now 'b' is LRU, should be evicted
        const evicted = cache.set('d', 4);
        expect(evicted).toEqual({ key: 'b', value: 2 });
      });

      it('should update LRU order on set (update existing)', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        // Update 'a' to move it to head
        cache.set('a', 10);

        // Now 'b' is LRU
        const evicted = cache.set('d', 4);
        expect(evicted).toEqual({ key: 'b', value: 2 });
        expect(cache.get('a')).toBe(10);
      });

      it('should evict multiple entries', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        const evicted = cache.evictMultiple(2);
        expect(evicted).toHaveLength(2);
        expect(evicted[0]).toEqual({ key: 'a', value: 1 });
        expect(evicted[1]).toEqual({ key: 'b', value: 2 });
        expect(cache.size).toBe(1);
        expect(cache.get('c')).toBe(3);
      });
    });

    describe('ordering', () => {
      it('should return keys in LRU order (most recent first)', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        expect(Array.from(cache.keys())).toEqual(['c', 'b', 'a']);

        cache.get('a'); // Move to head
        expect(Array.from(cache.keys())).toEqual(['a', 'c', 'b']);
      });

      it('should return values in LRU order', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        expect(Array.from(cache.values())).toEqual([3, 2, 1]);
      });

      it('should return entries in LRU order', () => {
        cache.set('a', 1);
        cache.set('b', 2);

        expect(Array.from(cache.entries())).toEqual([
          ['b', 2],
          ['a', 1],
        ]);
      });

      it('should be iterable with for...of', () => {
        cache.set('a', 1);
        cache.set('b', 2);

        const entries: [string, number][] = [];
        for (const entry of cache) {
          entries.push(entry);
        }

        expect(entries).toEqual([
          ['b', 2],
          ['a', 1],
        ]);
      });
    });

    describe('peek operations', () => {
      it('should peek LRU without evicting', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        expect(cache.peekLRU()).toBe('a');
        expect(cache.size).toBe(3); // Not evicted
      });

      it('should peek MRU', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);

        expect(cache.peekMRU()).toBe('c');
      });

      it('should return undefined when empty', () => {
        expect(cache.peekLRU()).toBeUndefined();
        expect(cache.peekMRU()).toBeUndefined();
      });
    });

    describe('access statistics', () => {
      it('should track access count', () => {
        cache.set('a', 1);
        cache.get('a');
        cache.get('a');
        cache.get('a');

        const stats = cache.getStats('a');
        expect(stats?.accessCount).toBe(4); // 1 from set + 3 from get
      });

      it('should track last access time', () => {
        const before = Date.now();
        cache.set('a', 1);
        const after = Date.now();

        const stats = cache.getStats('a');
        expect(stats?.lastAccessedAt).toBeGreaterThanOrEqual(before);
        expect(stats?.lastAccessedAt).toBeLessThanOrEqual(after);
      });

      it('should return undefined for missing key', () => {
        expect(cache.getStats('missing')).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('should handle single-item cache', () => {
        const singleCache = new LRUCache<string, number>(1);
        singleCache.set('a', 1);
        const evicted = singleCache.set('b', 2);

        expect(evicted).toEqual({ key: 'a', value: 1 });
        expect(singleCache.get('a')).toBeUndefined();
        expect(singleCache.get('b')).toBe(2);
      });

      it('should handle eviction from empty cache gracefully', () => {
        const evicted = cache.evictMultiple(5);
        expect(evicted).toHaveLength(0);
      });

      it('should throw for zero maxSize', () => {
        expect(() => new LRUCache<string, number>(0)).toThrow('maxSize must be a positive number');
      });

      it('should throw for negative maxSize', () => {
        expect(() => new LRUCache<string, number>(-5)).toThrow('maxSize must be a positive number');
      });
    });
  });

  describe('DomainIndexedMap', () => {
    let map: DomainIndexedMap<string, { name: string }>;

    beforeEach(() => {
      map = new DomainIndexedMap<string, { name: string }>();
    });

    describe('basic operations', () => {
      it('should set and get items', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        expect(map.get('skill-1')).toEqual({ name: 'Skill 1' });
      });

      it('should check if key exists', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        expect(map.has('skill-1')).toBe(true);
        expect(map.has('skill-2')).toBe(false);
      });

      it('should delete items', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        expect(map.delete('skill-1')).toBe(true);
        expect(map.get('skill-1')).toBeUndefined();
      });

      it('should clear all items', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'other.com');
        map.clear();
        expect(map.size).toBe(0);
      });

      it('should track size', () => {
        expect(map.size).toBe(0);
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        expect(map.size).toBe(1);
      });
    });

    describe('domain indexing', () => {
      it('should get items by domain', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'example.com');
        map.set('skill-3', { name: 'Skill 3' }, 'other.com');

        const exampleSkills = map.getByDomain('example.com');
        expect(exampleSkills).toHaveLength(2);
        expect(exampleSkills).toContainEqual({ name: 'Skill 1' });
        expect(exampleSkills).toContainEqual({ name: 'Skill 2' });
      });

      it('should be case-insensitive for domains', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'Example.COM');
        expect(map.getByDomain('example.com')).toHaveLength(1);
        expect(map.getByDomain('EXAMPLE.COM')).toHaveLength(1);
      });

      it('should support multiple domains per item', () => {
        map.set('skill-1', { name: 'Skill 1' }, ['example.com', 'other.com']);

        expect(map.getByDomain('example.com')).toHaveLength(1);
        expect(map.getByDomain('other.com')).toHaveLength(1);
      });

      it('should get keys by domain', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'example.com');

        const keys = map.getKeysByDomain('example.com');
        expect(keys).toContain('skill-1');
        expect(keys).toContain('skill-2');
      });

      it('should return empty array for unknown domain', () => {
        expect(map.getByDomain('unknown.com')).toEqual([]);
        expect(map.getKeysByDomain('unknown.com')).toEqual([]);
      });

      it('should list all domains', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'other.com');

        const domains = map.getDomains();
        expect(domains).toContain('example.com');
        expect(domains).toContain('other.com');
      });

      it('should count items by domain', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'example.com');
        map.set('skill-3', { name: 'Skill 3' }, 'other.com');

        expect(map.countByDomain('example.com')).toBe(2);
        expect(map.countByDomain('other.com')).toBe(1);
        expect(map.countByDomain('unknown.com')).toBe(0);
      });
    });

    describe('domain updates', () => {
      it('should update domains when item is re-set', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-1', { name: 'Skill 1 Updated' }, 'other.com');

        expect(map.getByDomain('example.com')).toHaveLength(0);
        expect(map.getByDomain('other.com')).toHaveLength(1);
      });

      it('should clean up domain index when item deleted', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.delete('skill-1');

        expect(map.getByDomain('example.com')).toHaveLength(0);
        expect(map.getDomains()).not.toContain('example.com');
      });
    });

    describe('iteration', () => {
      it('should iterate over all items', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'other.com');

        const entries: [string, { name: string }][] = [];
        for (const entry of map) {
          entries.push(entry);
        }

        expect(entries).toHaveLength(2);
      });

      it('should provide keys iterator', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'other.com');

        const keys = Array.from(map.keys());
        expect(keys).toContain('skill-1');
        expect(keys).toContain('skill-2');
      });

      it('should provide values iterator', () => {
        map.set('skill-1', { name: 'Skill 1' }, 'example.com');
        map.set('skill-2', { name: 'Skill 2' }, 'other.com');

        const values = Array.from(map.values());
        expect(values).toContainEqual({ name: 'Skill 1' });
        expect(values).toContainEqual({ name: 'Skill 2' });
      });
    });
  });

  describe('QuantizedEmbedding', () => {
    describe('quantization', () => {
      it('should quantize float embeddings to Uint8', () => {
        const embedding = [0, 0.5, 1, -1, -0.5];
        const quantized = new QuantizedEmbedding(embedding, -1, 1);

        expect(quantized.dimension).toBe(5);
        expect(quantized.byteLength).toBe(5);

        const raw = quantized.getRawData();
        expect(raw[0]).toBe(128); // 0 -> 128
        expect(raw[1]).toBe(191); // 0.5 -> ~191
        expect(raw[2]).toBe(255); // 1 -> 255
        expect(raw[3]).toBe(0); // -1 -> 0
        expect(raw[4]).toBe(64); // -0.5 -> ~64
      });

      it('should dequantize back to floats with acceptable precision', () => {
        const original = [0, 0.5, 1, -1, -0.5];
        const quantized = new QuantizedEmbedding(original, -1, 1);
        const restored = quantized.toFloatArray();

        // Check each value is within tolerance (1/255 ~= 0.004)
        // Using 2 decimal precision (0.01 tolerance)
        for (let i = 0; i < original.length; i++) {
          expect(restored[i]).toBeCloseTo(original[i], 2);
        }
      });

      it('should clamp values outside range', () => {
        const embedding = [2, -2]; // Outside [-1, 1]
        const quantized = new QuantizedEmbedding(embedding, -1, 1);
        const raw = quantized.getRawData();

        expect(raw[0]).toBe(255); // Clamped to 1 -> 255
        expect(raw[1]).toBe(0); // Clamped to -1 -> 0
      });

      it('should support custom range', () => {
        const embedding = [0, 50, 100];
        const quantized = new QuantizedEmbedding(embedding, 0, 100);
        const raw = quantized.getRawData();

        expect(raw[0]).toBe(0);
        expect(raw[1]).toBe(128); // ~127.5 rounded
        expect(raw[2]).toBe(255);
      });

      it('should handle zero range (all same values)', () => {
        const embedding = [5, 5, 5];
        const quantized = new QuantizedEmbedding(embedding, 5, 5);
        const raw = quantized.getRawData();

        // All values should be mapped to middle (128)
        expect(raw[0]).toBe(128);
        expect(raw[1]).toBe(128);
        expect(raw[2]).toBe(128);
      });
    });

    describe('cosine similarity', () => {
      it('should compute similarity between quantized embeddings', () => {
        const a = new QuantizedEmbedding([1, 0, 0], -1, 1);
        const b = new QuantizedEmbedding([1, 0, 0], -1, 1);

        const similarity = a.cosineSimilarity(b);
        expect(similarity).toBeCloseTo(1, 1); // Same vector
      });

      it('should return lower similarity for different vectors', () => {
        const a = new QuantizedEmbedding([1, 0, 0], -1, 1);
        const b = new QuantizedEmbedding([0, 1, 0], -1, 1);

        const similarity = a.cosineSimilarity(b);
        expect(similarity).toBeCloseTo(0, 1); // Orthogonal
      });

      it('should return negative for opposite vectors', () => {
        const a = new QuantizedEmbedding([1, 0, 0], -1, 1);
        const b = new QuantizedEmbedding([-1, 0, 0], -1, 1);

        const similarity = a.cosineSimilarity(b);
        expect(similarity).toBeLessThan(0);
      });

      it('should throw for mismatched dimensions', () => {
        const a = new QuantizedEmbedding([1, 0, 0], -1, 1);
        const b = new QuantizedEmbedding([1, 0], -1, 1);

        expect(() => a.cosineSimilarity(b)).toThrow('same dimension');
      });
    });

    describe('serialization', () => {
      it('should serialize and deserialize', () => {
        const original = [0.1, 0.5, -0.3, 0.8];
        const quantized = new QuantizedEmbedding(original, -1, 1);
        const serialized = quantized.toSerialized();

        const restored = QuantizedEmbedding.fromSerialized(serialized);
        expect(restored.dimension).toBe(4);

        const restoredFloats = restored.toFloatArray();
        for (let i = 0; i < original.length; i++) {
          expect(restoredFloats[i]).toBeCloseTo(original[i], 1);
        }
      });

      it('should preserve range in serialization', () => {
        const quantized = new QuantizedEmbedding([50], 0, 100);
        const serialized = quantized.toSerialized();

        expect(serialized.minVal).toBe(0);
        expect(serialized.maxVal).toBe(100);
      });
    });

    describe('batch operations', () => {
      it('should quantize multiple embeddings', () => {
        const embeddings = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];
        const quantized = quantizeEmbeddings(embeddings);

        expect(quantized).toHaveLength(3);
        expect(quantized[0].dimension).toBe(3);
      });

      it('should dequantize multiple embeddings', () => {
        const embeddings = [
          [1, 0, 0],
          [0, 1, 0],
        ];
        const quantized = quantizeEmbeddings(embeddings);
        const restored = dequantizeEmbeddings(quantized);

        expect(restored).toHaveLength(2);
        expect(restored[0][0]).toBeCloseTo(1, 1);
        expect(restored[1][1]).toBeCloseTo(1, 1);
      });
    });

    describe('memory efficiency', () => {
      it('should use 8x less memory than float array', () => {
        const floatArray = new Array(64).fill(0.5);
        const quantized = new QuantizedEmbedding(floatArray);

        // Float64Array would be 64 * 8 = 512 bytes
        // Uint8Array is 64 * 1 = 64 bytes
        expect(quantized.byteLength).toBe(64);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('formatBytes', () => {
      it('should format bytes', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(512)).toBe('512 B');
      });

      it('should format kilobytes', () => {
        expect(formatBytes(1024)).toBe('1.0 KB');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(1536)).toBe('1.5 KB');
      });

      it('should format megabytes', () => {
        expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
        expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
      });

      it('should format gigabytes', () => {
        expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      });
    });

    describe('estimateSize', () => {
      it('should estimate primitive sizes', () => {
        expect(estimateSize(null)).toBe(0);
        expect(estimateSize(undefined)).toBe(0);
        expect(estimateSize(true)).toBe(4);
        expect(estimateSize(42)).toBe(8);
      });

      it('should estimate string sizes', () => {
        // UTF-16 = 2 bytes per character
        expect(estimateSize('hello')).toBe(10);
        expect(estimateSize('')).toBe(0);
      });

      it('should estimate array sizes', () => {
        const size = estimateSize([1, 2, 3]);
        expect(size).toBeGreaterThan(24); // Array overhead + 3 numbers
      });

      it('should estimate object sizes', () => {
        const size = estimateSize({ a: 1, b: 2 });
        expect(size).toBeGreaterThan(24); // Object overhead + 2 properties
      });

      it('should estimate Map sizes', () => {
        const map = new Map([
          ['a', 1],
          ['b', 2],
        ]);
        const size = estimateSize(map);
        expect(size).toBeGreaterThan(40); // Map overhead + entries
      });

      it('should estimate Uint8Array sizes', () => {
        const arr = new Uint8Array(100);
        expect(estimateSize(arr)).toBe(100);
      });

      it('should handle circular references', () => {
        const obj: Record<string, unknown> = { name: 'test' };
        obj.self = obj; // Circular reference

        // Should not throw and should return finite size
        const size = estimateSize(obj);
        expect(size).toBeGreaterThan(0);
        expect(Number.isFinite(size)).toBe(true);
      });

      it('should handle deeply nested circular references', () => {
        const a: Record<string, unknown> = { name: 'a' };
        const b: Record<string, unknown> = { name: 'b', parent: a };
        a.child = b;

        const size = estimateSize(a);
        expect(size).toBeGreaterThan(0);
        expect(Number.isFinite(size)).toBe(true);
      });
    });
  });
});
