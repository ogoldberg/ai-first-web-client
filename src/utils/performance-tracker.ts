/**
 * Performance Tracker - Tracks and analyzes timing metrics across all tiers
 *
 * Features:
 * - Per-tier timing with component breakdown (network, parsing, JS execution)
 * - Rolling window of historical metrics per domain
 * - Percentile calculations (p50, p95, p99)
 * - Overall system performance summary
 */

import type { RenderTier } from '../core/tiered-fetcher.js';

/**
 * Timing breakdown for a single request
 */
export interface TimingBreakdown {
  total: number;
  network?: number;      // Time spent on network requests
  parsing?: number;      // Time spent parsing HTML/DOM
  jsExecution?: number;  // Time spent executing JavaScript
  extraction?: number;   // Time spent extracting content
}

/**
 * A single timing record
 */
export interface TimingRecord {
  timestamp: number;
  domain: string;
  url: string;
  tier: RenderTier;
  timing: TimingBreakdown;
  success: boolean;
  fellBack: boolean;
  tiersAttempted: RenderTier[];
}

/**
 * Percentile statistics
 */
export interface PercentileStats {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

/**
 * Per-domain performance summary
 */
export interface DomainPerformance {
  domain: string;
  totalRequests: number;
  successRate: number;
  preferredTier: RenderTier | null;
  byTier: Record<RenderTier, PercentileStats | null>;
  overall: PercentileStats;
  lastUpdated: number;
}

/**
 * System-wide performance summary
 */
export interface SystemPerformance {
  totalRequests: number;
  totalDomains: number;
  successRate: number;
  byTier: Record<RenderTier, PercentileStats | null>;
  overall: PercentileStats;
  topSlowDomains: Array<{ domain: string; avgTime: number }>;
  topFastDomains: Array<{ domain: string; avgTime: number }>;
}

// Configuration
const MAX_RECORDS_PER_DOMAIN = 100;
const MAX_TOTAL_RECORDS = 10000;

export class PerformanceTracker {
  private records: TimingRecord[] = [];
  private domainRecords: Map<string, TimingRecord[]> = new Map();

  /**
   * Record a timing event
   */
  record(record: Omit<TimingRecord, 'timestamp'>): void {
    const fullRecord: TimingRecord = {
      ...record,
      timestamp: Date.now(),
    };

    // Add to overall records
    this.records.push(fullRecord);
    if (this.records.length > MAX_TOTAL_RECORDS) {
      this.records.shift();
    }

    // Add to domain-specific records
    if (!this.domainRecords.has(record.domain)) {
      this.domainRecords.set(record.domain, []);
    }
    const domainList = this.domainRecords.get(record.domain)!;
    domainList.push(fullRecord);
    if (domainList.length > MAX_RECORDS_PER_DOMAIN) {
      domainList.shift();
    }
  }

  /**
   * Calculate percentiles for a set of values
   */
  private calculatePercentiles(values: number[]): PercentileStats | null {
    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      p50: sorted[p50Index],
      p95: sorted[Math.min(p95Index, sorted.length - 1)],
      p99: sorted[Math.min(p99Index, sorted.length - 1)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
      count: values.length,
    };
  }

  /**
   * Get performance metrics for a specific domain
   */
  getDomainPerformance(domain: string): DomainPerformance | null {
    const records = this.domainRecords.get(domain);
    if (!records || records.length === 0) {
      return null;
    }

    // Single pass to collect all metrics
    let successCount = 0;
    const allTimings: number[] = [];
    const timingsByTier: Record<RenderTier, number[]> = {
      intelligence: [],
      lightweight: [],
      playwright: [],
    };
    const successfulCountsByTier: Record<RenderTier, number> = {
      intelligence: 0,
      lightweight: 0,
      playwright: 0,
    };

    for (const record of records) {
      allTimings.push(record.timing.total);
      timingsByTier[record.tier].push(record.timing.total);
      if (record.success) {
        successCount++;
        successfulCountsByTier[record.tier]++;
      }
    }

    // Calculate per-tier stats from grouped data
    const tierStats: Record<RenderTier, PercentileStats | null> = {
      intelligence: this.calculatePercentiles(timingsByTier.intelligence),
      lightweight: this.calculatePercentiles(timingsByTier.lightweight),
      playwright: this.calculatePercentiles(timingsByTier.playwright),
    };

    // Determine preferred tier (most used successful tier)
    let preferredTier: RenderTier | null = null;
    let maxCount = 0;
    for (const tier of Object.keys(successfulCountsByTier) as RenderTier[]) {
      if (successfulCountsByTier[tier] > maxCount) {
        maxCount = successfulCountsByTier[tier];
        preferredTier = tier;
      }
    }

    return {
      domain,
      totalRequests: records.length,
      successRate: records.length > 0 ? successCount / records.length : 0,
      preferredTier,
      byTier: tierStats,
      overall: this.calculatePercentiles(allTimings)!,
      lastUpdated: records[records.length - 1].timestamp,
    };
  }

  /**
   * Get system-wide performance metrics
   */
  getSystemPerformance(): SystemPerformance {
    // Single pass to collect all metrics
    let successCount = 0;
    const allTimings: number[] = [];
    const timingsByTier: Record<RenderTier, number[]> = {
      intelligence: [],
      lightweight: [],
      playwright: [],
    };

    for (const record of this.records) {
      allTimings.push(record.timing.total);
      timingsByTier[record.tier].push(record.timing.total);
      if (record.success) {
        successCount++;
      }
    }

    // Calculate per-tier stats from grouped data
    const tierStats: Record<RenderTier, PercentileStats | null> = {
      intelligence: this.calculatePercentiles(timingsByTier.intelligence),
      lightweight: this.calculatePercentiles(timingsByTier.lightweight),
      playwright: this.calculatePercentiles(timingsByTier.playwright),
    };

    // Get domain averages for ranking
    const domainAvgs: Array<{ domain: string; avgTime: number }> = [];
    for (const [domain, records] of this.domainRecords) {
      if (records.length > 0) {
        const avg = records.reduce((sum, r) => sum + r.timing.total, 0) / records.length;
        domainAvgs.push({ domain, avgTime: Math.round(avg) });
      }
    }

    // Sort for top slow/fast domains
    const sortedByTime = [...domainAvgs].sort((a, b) => a.avgTime - b.avgTime);

    return {
      totalRequests: this.records.length,
      totalDomains: this.domainRecords.size,
      successRate: this.records.length > 0 ? successCount / this.records.length : 0,
      byTier: tierStats,
      overall: this.calculatePercentiles(allTimings) || {
        p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0, count: 0,
      },
      topSlowDomains: sortedByTime.slice(-5).reverse(),
      topFastDomains: sortedByTime.slice(0, 5),
    };
  }

  /**
   * Get detailed timing breakdown for recent requests
   */
  getRecentTimings(limit: number = 10): TimingRecord[] {
    return this.records.slice(-limit).reverse();
  }

  /**
   * Get timing records for a specific tier
   */
  getTierTimings(tier: RenderTier, limit: number = 50): TimingRecord[] {
    return this.records
      .filter(r => r.tier === tier)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get component breakdown aggregates
   */
  getComponentBreakdown(): {
    network: PercentileStats | null;
    parsing: PercentileStats | null;
    jsExecution: PercentileStats | null;
    extraction: PercentileStats | null;
  } {
    const networkTimes = this.records
      .filter(r => r.timing.network !== undefined)
      .map(r => r.timing.network!);

    const parsingTimes = this.records
      .filter(r => r.timing.parsing !== undefined)
      .map(r => r.timing.parsing!);

    const jsExecutionTimes = this.records
      .filter(r => r.timing.jsExecution !== undefined)
      .map(r => r.timing.jsExecution!);

    const extractionTimes = this.records
      .filter(r => r.timing.extraction !== undefined)
      .map(r => r.timing.extraction!);

    return {
      network: this.calculatePercentiles(networkTimes),
      parsing: this.calculatePercentiles(parsingTimes),
      jsExecution: this.calculatePercentiles(jsExecutionTimes),
      extraction: this.calculatePercentiles(extractionTimes),
    };
  }

  /**
   * Get domains ordered by performance
   */
  getDomainsByPerformance(
    sortBy: 'avgTime' | 'p95' | 'successRate' = 'avgTime',
    order: 'asc' | 'desc' = 'asc',
    limit: number = 20
  ): DomainPerformance[] {
    const performances: DomainPerformance[] = [];

    for (const domain of this.domainRecords.keys()) {
      const perf = this.getDomainPerformance(domain);
      if (perf) {
        performances.push(perf);
      }
    }

    // Sort
    performances.sort((a, b) => {
      let valueA: number;
      let valueB: number;

      switch (sortBy) {
        case 'avgTime':
          valueA = a.overall.avg;
          valueB = b.overall.avg;
          break;
        case 'p95':
          valueA = a.overall.p95;
          valueB = b.overall.p95;
          break;
        case 'successRate':
          valueA = a.successRate;
          valueB = b.successRate;
          break;
      }

      return order === 'asc' ? valueA - valueB : valueB - valueA;
    });

    return performances.slice(0, limit);
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
    this.domainRecords.clear();
  }

  /**
   * Get record count
   */
  getRecordCount(): { total: number; byDomain: number } {
    return {
      total: this.records.length,
      byDomain: this.domainRecords.size,
    };
  }
}

// Global singleton instance
export const performanceTracker = new PerformanceTracker();
