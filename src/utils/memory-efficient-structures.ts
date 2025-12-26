/**
 * Memory-Efficient Data Structures (P-003)
 *
 * Provides optimized data structures for managing large collections:
 * 1. LRU Cache with O(1) operations
 * 2. Quantized embedding storage (8x memory reduction)
 * 3. Domain-indexed collections for fast filtering
 */

// ============================================
// LRU CACHE WITH O(1) OPERATIONS
// ============================================

/**
 * Node in the doubly-linked list for LRU ordering.
 */
interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * LRU Cache with O(1) get, set, and eviction.
 *
 * Uses a doubly-linked list for ordering and a Map for O(1) lookups.
 * The most recently used items are at the head, least recently used at tail.
 *
 * @typeParam K - Key type
 * @typeParam V - Value type
 *
 * @example
 * ```ts
 * const cache = new LRUCache<string, SkillData>(1000);
 * cache.set('skill-1', skillData);
 * const skill = cache.get('skill-1'); // Moves to head
 * ```
 */
export class LRUCache<K, V> {
  private cache: Map<K, LRUNode<K, V>> = new Map();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('maxSize must be a positive number');
    }
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache, moving it to the head (most recently used).
   */
  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }

    // Update access tracking
    node.accessCount++;
    node.lastAccessedAt = Date.now();

    // Move to head (most recently used)
    this.moveToHead(node);

    return node.value;
  }

  /**
   * Check if a key exists in the cache.
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Set a value in the cache. If at capacity, evicts the least recently used item.
   *
   * @returns The evicted key-value pair if eviction occurred, undefined otherwise.
   */
  set(key: K, value: V): { key: K; value: V } | undefined {
    let evicted: { key: K; value: V } | undefined;

    // Check if key already exists
    const existingNode = this.cache.get(key);
    if (existingNode) {
      // Update value and move to head
      existingNode.value = value;
      existingNode.lastAccessedAt = Date.now();
      this.moveToHead(existingNode);
      return undefined;
    }

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      evicted = this.evictLRU();
    }

    // Create new node at head
    const node: LRUNode<K, V> = {
      key,
      value,
      prev: null,
      next: this.head,
      accessCount: 1,
      lastAccessedAt: Date.now(),
    };

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }

    this.cache.set(key, node);

    return evicted;
  }

  /**
   * Delete a key from the cache.
   */
  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) {
      return false;
    }

    this.removeNode(node);
    this.cache.delete(key);

    return true;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Get the current size of the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in LRU order (most recent first).
   * Uses a generator for memory efficiency.
   */
  *keys(): IterableIterator<K> {
    let node = this.head;
    while (node) {
      yield node.key;
      node = node.next;
    }
  }

  /**
   * Get all values in LRU order (most recent first).
   * Uses a generator for memory efficiency.
   */
  *values(): IterableIterator<V> {
    let node = this.head;
    while (node) {
      yield node.value;
      node = node.next;
    }
  }

  /**
   * Get all entries as [key, value] pairs in LRU order.
   * Uses a generator for memory efficiency.
   */
  *entries(): IterableIterator<[K, V]> {
    let node = this.head;
    while (node) {
      yield [node.key, node.value];
      node = node.next;
    }
  }

  /**
   * Iterate over entries (supports for...of).
   */
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    let node = this.head;
    while (node) {
      yield [node.key, node.value];
      node = node.next;
    }
  }

  /**
   * Get access statistics for a key.
   */
  getStats(key: K): { accessCount: number; lastAccessedAt: number } | undefined {
    const node = this.cache.get(key);
    if (!node) {
      return undefined;
    }
    return {
      accessCount: node.accessCount,
      lastAccessedAt: node.lastAccessedAt,
    };
  }

  /**
   * Get the least recently used key without evicting.
   */
  peekLRU(): K | undefined {
    return this.tail?.key;
  }

  /**
   * Get the most recently used key without modifying order.
   */
  peekMRU(): K | undefined {
    return this.head?.key;
  }

  /**
   * Evict multiple least recently used entries.
   *
   * @param count - Number of entries to evict
   * @returns Array of evicted key-value pairs
   */
  evictMultiple(count: number): Array<{ key: K; value: V }> {
    const evicted: Array<{ key: K; value: V }> = [];
    for (let i = 0; i < count && this.tail; i++) {
      const result = this.evictLRU();
      if (result) {
        evicted.push(result);
      }
    }
    return evicted;
  }

  /**
   * Move a node to the head of the list.
   */
  private moveToHead(node: LRUNode<K, V>): void {
    if (node === this.head) {
      return;
    }

    // Remove from current position
    this.removeNode(node);

    // Add at head
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Remove a node from the list (but not the cache).
   */
  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  /**
   * Evict the least recently used entry.
   */
  private evictLRU(): { key: K; value: V } | undefined {
    if (!this.tail) {
      return undefined;
    }

    const evicted = { key: this.tail.key, value: this.tail.value };
    this.cache.delete(this.tail.key);

    if (this.tail.prev) {
      this.tail = this.tail.prev;
      this.tail.next = null;
    } else {
      this.head = null;
      this.tail = null;
    }

    return evicted;
  }
}

// ============================================
// DOMAIN-INDEXED COLLECTION
// ============================================

/**
 * A collection indexed by domain for fast filtering.
 *
 * Maintains both a primary Map and a secondary domain index.
 * Supports multi-domain entries (items can belong to multiple domains).
 *
 * @typeParam K - Key type
 * @typeParam V - Value type
 */
export class DomainIndexedMap<K, V> {
  private items: Map<K, V> = new Map();
  private domainIndex: Map<string, Set<K>> = new Map();
  private keyToDomains: Map<K, Set<string>> = new Map();

  /**
   * Remove a key from the domain index.
   */
  private removeFromIndex(key: K, domains: Set<string>): void {
    for (const domain of domains) {
      const domainSet = this.domainIndex.get(domain);
      if (domainSet) {
        domainSet.delete(key);
        if (domainSet.size === 0) {
          this.domainIndex.delete(domain);
        }
      }
    }
  }

  /**
   * Set an item with its associated domains.
   */
  set(key: K, value: V, domains: string | string[]): void {
    const domainList = Array.isArray(domains) ? domains : [domains];
    const normalizedDomains = domainList.map((d) => d.toLowerCase());

    // Remove from old domain indices if exists
    const oldDomains = this.keyToDomains.get(key);
    if (oldDomains) {
      this.removeFromIndex(key, oldDomains);
    }

    // Store item
    this.items.set(key, value);

    // Add to domain indices
    const domainSet = new Set(normalizedDomains);
    this.keyToDomains.set(key, domainSet);

    for (const domain of normalizedDomains) {
      let index = this.domainIndex.get(domain);
      if (!index) {
        index = new Set();
        this.domainIndex.set(domain, index);
      }
      index.add(key);
    }
  }

  /**
   * Get an item by key.
   */
  get(key: K): V | undefined {
    return this.items.get(key);
  }

  /**
   * Check if key exists.
   */
  has(key: K): boolean {
    return this.items.has(key);
  }

  /**
   * Delete an item and remove from all domain indices.
   */
  delete(key: K): boolean {
    const domains = this.keyToDomains.get(key);
    if (domains) {
      this.removeFromIndex(key, domains);
      this.keyToDomains.delete(key);
    }

    return this.items.delete(key);
  }

  /**
   * Get all items for a specific domain.
   */
  getByDomain(domain: string): V[] {
    const normalizedDomain = domain.toLowerCase();
    const keys = this.domainIndex.get(normalizedDomain);
    if (!keys) {
      return [];
    }

    const result: V[] = [];
    for (const key of keys) {
      const value = this.items.get(key);
      if (value !== undefined) {
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Get all keys for a specific domain.
   */
  getKeysByDomain(domain: string): K[] {
    const normalizedDomain = domain.toLowerCase();
    const keys = this.domainIndex.get(normalizedDomain);
    return keys ? Array.from(keys) : [];
  }

  /**
   * Get all domains that have at least one item.
   */
  getDomains(): string[] {
    return Array.from(this.domainIndex.keys());
  }

  /**
   * Get the number of items for a domain.
   */
  countByDomain(domain: string): number {
    const keys = this.domainIndex.get(domain.toLowerCase());
    return keys ? keys.size : 0;
  }

  /**
   * Clear all items.
   */
  clear(): void {
    this.items.clear();
    this.domainIndex.clear();
    this.keyToDomains.clear();
  }

  /**
   * Get total item count.
   */
  get size(): number {
    return this.items.size;
  }

  /**
   * Iterate over all items.
   */
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    yield* this.items;
  }

  /**
   * Get all keys.
   */
  keys(): IterableIterator<K> {
    return this.items.keys();
  }

  /**
   * Get all values.
   */
  values(): IterableIterator<V> {
    return this.items.values();
  }

  /**
   * Get all entries.
   */
  entries(): IterableIterator<[K, V]> {
    return this.items.entries();
  }
}

// ============================================
// QUANTIZED EMBEDDINGS
// ============================================

/**
 * Quantized embedding storage using Uint8Array.
 *
 * Reduces memory from 8 bytes/float to 1 byte/value (8x reduction).
 * Values are scaled from [-1, 1] or [0, 1] range to [0, 255].
 *
 * For 64-dim embeddings: 512 bytes -> 64 bytes (8x reduction).
 */
export class QuantizedEmbedding {
  private data: Uint8Array;
  private readonly minVal: number;
  private readonly maxVal: number;

  /**
   * Create a quantized embedding from float array.
   *
   * @param embedding - Original float embedding
   * @param minVal - Minimum expected value (default: -1)
   * @param maxVal - Maximum expected value (default: 1)
   */
  constructor(embedding?: number[], minVal = -1, maxVal = 1) {
    this.minVal = minVal;
    this.maxVal = maxVal;
    this.data = new Uint8Array(embedding?.length ?? 0);

    if (embedding) {
      this.quantize(embedding);
    }
  }

  /**
   * Quantize a float array into the internal Uint8Array.
   */
  private quantize(embedding: number[]): void {
    const range = this.maxVal - this.minVal;

    // Handle zero range (all values are the same)
    if (range === 0) {
      this.data.fill(128);
      return;
    }

    for (let i = 0; i < embedding.length; i++) {
      // Clamp to range
      const clamped = Math.max(this.minVal, Math.min(this.maxVal, embedding[i]));
      // Scale to 0-255
      const scaled = ((clamped - this.minVal) / range) * 255;
      this.data[i] = Math.round(scaled);
    }
  }

  /**
   * Dequantize back to float array.
   */
  toFloatArray(): number[] {
    const range = this.maxVal - this.minVal;
    const result = new Array(this.data.length);

    for (let i = 0; i < this.data.length; i++) {
      result[i] = (this.data[i] / 255) * range + this.minVal;
    }

    return result;
  }

  /**
   * Get the raw quantized data.
   */
  getRawData(): Uint8Array {
    return this.data;
  }

  /**
   * Set from raw quantized data.
   */
  setRawData(data: Uint8Array): void {
    this.data = data;
  }

  /**
   * Get the dimension of the embedding.
   */
  get dimension(): number {
    return this.data.length;
  }

  /**
   * Get memory size in bytes.
   */
  get byteLength(): number {
    return this.data.byteLength;
  }

  /**
   * Compute cosine similarity with another quantized embedding.
   * Uses integer arithmetic for efficiency.
   */
  cosineSimilarity(other: QuantizedEmbedding): number {
    if (this.data.length !== other.data.length) {
      throw new Error('Embeddings must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < this.data.length; i++) {
      const a = this.data[i] - 128; // Center around 0
      const b = other.data[i] - 128;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Create from serialized format.
   */
  static fromSerialized(data: {
    raw: number[];
    minVal: number;
    maxVal: number;
  }): QuantizedEmbedding {
    const embedding = new QuantizedEmbedding(undefined, data.minVal, data.maxVal);
    embedding.data = new Uint8Array(data.raw);
    return embedding;
  }

  /**
   * Serialize for storage.
   */
  toSerialized(): { raw: number[]; minVal: number; maxVal: number } {
    return {
      raw: Array.from(this.data),
      minVal: this.minVal,
      maxVal: this.maxVal,
    };
  }
}

/**
 * Batch quantize multiple embeddings.
 */
export function quantizeEmbeddings(
  embeddings: number[][],
  minVal = -1,
  maxVal = 1
): QuantizedEmbedding[] {
  return embeddings.map((e) => new QuantizedEmbedding(e, minVal, maxVal));
}

/**
 * Batch dequantize multiple embeddings.
 */
export function dequantizeEmbeddings(quantized: QuantizedEmbedding[]): number[][] {
  return quantized.map((q) => q.toFloatArray());
}

// ============================================
// MEMORY STATISTICS
// ============================================

/**
 * Memory usage statistics for a collection.
 */
export interface MemoryStats {
  /** Number of items in the collection */
  itemCount: number;
  /** Estimated memory usage in bytes */
  estimatedBytes: number;
  /** Estimated memory usage in human-readable format */
  estimatedSize: string;
  /** Additional breakdown by type */
  breakdown?: Record<string, number>;
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Estimate memory size of a JavaScript value.
 *
 * This is a rough estimate as actual memory depends on V8 implementation.
 * Handles circular references by tracking visited objects.
 *
 * @param value - The value to estimate size for
 * @param seen - Internal set of visited objects to handle circular references
 */
export function estimateSize(value: unknown, seen: Set<object> = new Set()): number {
  if (value === null || value === undefined) {
    return 0;
  }

  // Handle circular references for objects
  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return 0; // Already counted
    }
    seen.add(value as object);
  }

  switch (typeof value) {
    case 'boolean':
      return 4;
    case 'number':
      return 8;
    case 'string':
      return (value as string).length * 2; // UTF-16
    case 'object':
      if (Array.isArray(value)) {
        return value.reduce((sum, item) => sum + estimateSize(item, seen), 24); // Array overhead
      }
      if (value instanceof Uint8Array) {
        return value.byteLength;
      }
      if (value instanceof Map) {
        let size = 40; // Map overhead
        for (const [k, v] of value) {
          size += estimateSize(k, seen) + estimateSize(v, seen) + 16; // Entry overhead
        }
        return size;
      }
      if (value instanceof Set) {
        let size = 40; // Set overhead
        for (const v of value) {
          size += estimateSize(v, seen) + 8; // Entry overhead
        }
        return size;
      }
      // Plain object
      let size = 24; // Object overhead
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          size += estimateSize(key, seen) + estimateSize((value as Record<string, unknown>)[key], seen) + 16;
        }
      }
      return size;
    default:
      return 8;
  }
}
