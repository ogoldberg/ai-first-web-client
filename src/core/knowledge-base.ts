/**
 * Knowledge Base - Stores and retrieves learned API patterns
 *
 * Uses PersistentStore for:
 * - Debounced writes (batches rapid learn() calls)
 * - Atomic writes (temp file + rename for corruption safety)
 */

import type { ApiPattern, KnowledgeBaseEntry } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { PersistentStore } from '../utils/persistent-store.js';

/** Serialized format of the knowledge base */
interface KnowledgeBaseData {
  [domain: string]: KnowledgeBaseEntry;
}

export class KnowledgeBase {
  private entries: Map<string, KnowledgeBaseEntry> = new Map();
  private store: PersistentStore<KnowledgeBaseData>;

  constructor(filePath: string = './knowledge-base.json') {
    this.store = new PersistentStore<KnowledgeBaseData>(filePath, {
      componentName: 'KnowledgeBase',
      debounceMs: 1000, // Batch rapid writes
    });
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  /**
   * Learn API patterns from a domain
   */
  learn(domain: string, patterns: ApiPattern[]): void {
    let entry = this.entries.get(domain);

    if (!entry) {
      entry = {
        domain,
        patterns: [],
        lastUsed: Date.now(),
        usageCount: 0,
        successRate: 1.0,
      };
      this.entries.set(domain, entry);
    }

    // Merge new patterns with existing
    for (const newPattern of patterns) {
      const existingIndex = entry.patterns.findIndex(
        p => p.endpoint === newPattern.endpoint && p.method === newPattern.method
      );

      if (existingIndex >= 0) {
        // Update existing pattern
        entry.patterns[existingIndex] = newPattern;
      } else {
        // Add new pattern
        entry.patterns.push(newPattern);
      }
    }

    entry.lastUsed = Date.now();
    entry.usageCount++;

    this.save();
  }

  /**
   * Get learned patterns for a domain
   */
  getPatterns(domain: string): ApiPattern[] {
    const entry = this.entries.get(domain);
    return entry?.patterns || [];
  }

  /**
   * Get high-confidence patterns that can bypass browser
   */
  getBypassablePatterns(domain: string): ApiPattern[] {
    const patterns = this.getPatterns(domain);
    return patterns.filter(p => p.canBypass && p.confidence === 'high');
  }

  /**
   * Find a pattern matching a URL
   */
  findPattern(url: string): ApiPattern | null {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const pathname = urlObj.pathname;

      const entry = this.entries.get(domain);
      if (!entry) return null;

      // Find exact match first
      const exactMatch = entry.patterns.find(p => {
        const patternUrl = new URL(p.endpoint);
        return patternUrl.pathname === pathname;
      });

      if (exactMatch) return exactMatch;

      // Try partial match
      const partialMatch = entry.patterns.find(p => {
        const patternUrl = new URL(p.endpoint);
        return pathname.startsWith(patternUrl.pathname);
      });

      return partialMatch || null;
    } catch {
      return null;
    }
  }

  /**
   * Get knowledge base statistics
   */
  getStats(): {
    totalDomains: number;
    totalPatterns: number;
    bypassablePatterns: number;
    topDomains: Array<{ domain: string; patterns: number; usageCount: number }>;
  } {
    let totalPatterns = 0;
    let bypassablePatterns = 0;

    const topDomains = Array.from(this.entries.values())
      .map(entry => {
        totalPatterns += entry.patterns.length;
        bypassablePatterns += entry.patterns.filter(p => p.canBypass).length;

        return {
          domain: entry.domain,
          patterns: entry.patterns.length,
          usageCount: entry.usageCount,
        };
      })
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    return {
      totalDomains: this.entries.size,
      totalPatterns,
      bypassablePatterns,
      topDomains,
    };
  }

  /**
   * Update success rate for a pattern
   */
  updateSuccessRate(domain: string, endpoint: string, success: boolean): void {
    const entry = this.entries.get(domain);
    if (!entry) return;

    const pattern = entry.patterns.find(p => p.endpoint === endpoint);
    if (!pattern) return;

    // Simple success rate tracking (could be more sophisticated)
    const currentRate = entry.successRate;
    entry.successRate = success
      ? Math.min(1.0, currentRate + 0.1)
      : Math.max(0.0, currentRate - 0.2);

    // Lower confidence if success rate drops
    if (entry.successRate < 0.6 && pattern.confidence === 'high') {
      pattern.confidence = 'medium';
    }

    this.save();
  }

  /**
   * Clear knowledge base
   */
  clear(): void {
    this.entries.clear();
    this.save();
  }

  /**
   * Load knowledge base from disk
   */
  private async load(): Promise<void> {
    const data = await this.store.load();
    if (data) {
      this.entries = new Map(Object.entries(data));
      logger.knowledgeBase.info('Loaded knowledge base', { totalDomains: this.entries.size });
    } else {
      logger.knowledgeBase.info('No existing knowledge base found, starting fresh');
    }
  }

  /**
   * Save knowledge base to disk (debounced, atomic)
   */
  private save(): void {
    const data = Object.fromEntries(this.entries);
    // Fire and forget - debounced writes are batched
    this.store.save(data).catch(error => {
      logger.knowledgeBase.error('Failed to save knowledge base', { error });
    });
  }

  /**
   * Flush any pending writes (for graceful shutdown)
   */
  async flush(): Promise<void> {
    await this.store.flush();
  }
}
