/**
 * Domain Group Learner (LI-005)
 *
 * Learns domain groups dynamically from:
 * 1. Successful cross-domain pattern transfers
 * 2. Pattern similarity analysis
 *
 * Groups are learned automatically and can be persisted to survive restarts.
 */

import { logger } from '../utils/logger.js';
import { PersistentStore } from '../utils/persistent-store.js';
import type { DomainGroup } from '../types/index.js';
import { addDomainGroup, getDomainGroups } from '../utils/heuristics-config.js';

const log = logger.create('DomainGroupLearner');

/**
 * Minimum number of successful transfers to consider domains related
 */
const MIN_TRANSFERS_FOR_RELATIONSHIP = 2;

/**
 * Minimum success rate for a transfer relationship to be considered
 */
const MIN_SUCCESS_RATE = 0.6;

/**
 * Minimum domains in a learned group
 */
const MIN_GROUP_SIZE = 2;

/**
 * Minimum confidence to auto-register a learned group
 */
const MIN_CONFIDENCE_FOR_REGISTRATION = 0.7;

/**
 * A recorded transfer between two domains
 */
interface TransferRecord {
  sourceDomain: string;
  targetDomain: string;
  success: boolean;
  timestamp: number;
  patternId?: string;
  similarity?: number;
}

/**
 * Aggregated relationship between two domains
 */
interface DomainRelationship {
  domainA: string;
  domainB: string;
  transferCount: number;
  successCount: number;
  successRate: number;
  avgSimilarity: number;
  lastTransfer: number;
}

/**
 * A learned domain group with provenance
 */
export interface LearnedDomainGroup {
  /** Auto-generated name */
  name: string;
  /** Domains in this group */
  domains: string[];
  /** Confidence in this grouping (0-1) */
  confidence: number;
  /** When this group was first created */
  createdAt: number;
  /** When this group was last updated */
  lastUpdated: number;
  /** How this group was learned */
  source: 'transfer_learning' | 'similarity_suggestion' | 'merged';
  /** Evidence supporting this grouping */
  evidence: {
    totalTransfers: number;
    successfulTransfers: number;
    avgSimilarity: number;
  };
  /** Whether this group has been registered with heuristics config */
  registered: boolean;
}

/**
 * Suggestion for a new domain group
 */
export interface GroupSuggestion {
  domains: string[];
  confidence: number;
  reason: string;
  evidence: {
    totalTransfers: number;
    transferSuccesses: number;
    avgSimilarity: number;
  };
}

/**
 * Persisted data format
 */
interface LearnedGroupsData {
  version: string;
  transfers: TransferRecord[];
  learnedGroups: LearnedDomainGroup[];
  lastSaved: number;
}

/**
 * Union-Find data structure for finding connected components
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      return x;
    }

    // Find root iteratively
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }

    // Path compression iteratively
    let curr = x;
    while (this.parent.get(curr) !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }

    return root;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getComponents(): Map<string, string[]> {
    const components = new Map<string, string[]>();
    for (const domain of this.parent.keys()) {
      const root = this.find(domain);
      if (!components.has(root)) {
        components.set(root, []);
      }
      components.get(root)!.push(domain);
    }
    return components;
  }
}

export class DomainGroupLearner {
  private transfers: TransferRecord[] = [];
  private learnedGroups: Map<string, LearnedDomainGroup> = new Map();
  private store: PersistentStore<LearnedGroupsData>;
  private nextGroupId = 1;

  // Incremental stats for O(1) getStats() performance
  private successfulTransferCount = 0;
  private uniqueDomains: Set<string> = new Set();

  constructor(filePath: string = './learned-domain-groups.json') {
    this.store = new PersistentStore<LearnedGroupsData>(filePath, {
      componentName: 'DomainGroupLearner',
      debounceMs: 2000, // Batch writes
    });
  }

  /**
   * Initialize by loading persisted data
   */
  async initialize(): Promise<void> {
    await this.load();
    log.info('Domain group learner initialized', {
      transfers: this.transfers.length,
      learnedGroups: this.learnedGroups.size,
    });
  }

  /**
   * Record a pattern transfer outcome
   * Called when a pattern from one domain is applied to another
   */
  recordTransfer(
    sourceDomain: string,
    targetDomain: string,
    success: boolean,
    options?: {
      patternId?: string;
      similarity?: number;
    }
  ): void {
    // Normalize domains
    const source = this.normalizeDomain(sourceDomain);
    const target = this.normalizeDomain(targetDomain);

    // Don't record self-transfers
    if (source === target) return;

    const record: TransferRecord = {
      sourceDomain: source,
      targetDomain: target,
      success,
      timestamp: Date.now(),
      patternId: options?.patternId,
      similarity: options?.similarity,
    };

    this.transfers.push(record);

    // Update incremental stats
    this.uniqueDomains.add(source);
    this.uniqueDomains.add(target);
    if (success) {
      this.successfulTransferCount++;
    }

    log.debug('Transfer recorded', {
      source,
      target,
      success,
      totalTransfers: this.transfers.length,
    });

    // Analyze if we should form a new group
    if (success) {
      this.analyzeForGroups();
    }

    this.save();
  }

  /**
   * Get aggregated relationships between domains
   */
  getRelationships(): DomainRelationship[] {
    const relationshipMap = new Map<string, DomainRelationship>();

    for (const transfer of this.transfers) {
      // Create canonical key (sorted domains)
      const [domainA, domainB] = [transfer.sourceDomain, transfer.targetDomain].sort();
      const key = `${domainA}|${domainB}`;

      let rel = relationshipMap.get(key);
      if (!rel) {
        rel = {
          domainA,
          domainB,
          transferCount: 0,
          successCount: 0,
          successRate: 0,
          avgSimilarity: 0,
          lastTransfer: 0,
        };
        relationshipMap.set(key, rel);
      }

      rel.transferCount++;
      if (transfer.success) {
        rel.successCount++;
      }
      rel.successRate = rel.successCount / rel.transferCount;
      rel.lastTransfer = Math.max(rel.lastTransfer, transfer.timestamp);

      // Update average similarity
      if (transfer.similarity !== undefined) {
        const prevTotal = rel.avgSimilarity * (rel.transferCount - 1);
        rel.avgSimilarity = (prevTotal + transfer.similarity) / rel.transferCount;
      }
    }

    return Array.from(relationshipMap.values());
  }

  /**
   * Analyze transfer history to identify and create domain groups
   */
  analyzeForGroups(): GroupSuggestion[] {
    const relationships = this.getRelationships();
    const suggestions: GroupSuggestion[] = [];

    // Filter to strong relationships
    const strongRelationships = relationships.filter(
      (r) =>
        r.successCount >= MIN_TRANSFERS_FOR_RELATIONSHIP &&
        r.successRate >= MIN_SUCCESS_RATE
    );

    if (strongRelationships.length === 0) {
      return suggestions;
    }

    // Use Union-Find to find connected components
    const uf = new UnionFind();
    for (const rel of strongRelationships) {
      uf.union(rel.domainA, rel.domainB);
    }

    // Get connected components
    const components = uf.getComponents();

    // Each component with 2+ domains is a potential group
    for (const [_, domains] of components) {
      if (domains.length < MIN_GROUP_SIZE) continue;

      // Check if this group already exists (as learned or hardcoded)
      const existingGroup = this.findExistingGroup(domains);
      if (existingGroup) continue;

      // Calculate group statistics
      const groupRels = strongRelationships.filter(
        (r) => domains.includes(r.domainA) && domains.includes(r.domainB)
      );

      const totalTransfers = groupRels.reduce((sum, r) => sum + r.transferCount, 0);
      const successfulTransfers = groupRels.reduce((sum, r) => sum + r.successCount, 0);
      const avgSimilarity =
        groupRels.length > 0
          ? groupRels.reduce((sum, r) => sum + r.avgSimilarity, 0) / groupRels.length
          : 0;

      // Calculate confidence
      const confidence = this.calculateGroupConfidence(
        successfulTransfers,
        totalTransfers,
        domains.length,
        avgSimilarity,
        groupRels.length
      );

      const suggestion: GroupSuggestion = {
        domains: domains.sort(),
        confidence,
        reason: `${successfulTransfers} successful transfers between ${domains.length} domains`,
        evidence: {
          totalTransfers,
          transferSuccesses: successfulTransfers,
          avgSimilarity,
        },
      };

      suggestions.push(suggestion);

      // Auto-create group if confidence is high enough
      if (confidence >= MIN_CONFIDENCE_FOR_REGISTRATION) {
        this.createLearnedGroup(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Calculate confidence for a potential group
   */
  private calculateGroupConfidence(
    successfulTransfers: number,
    totalTransfers: number,
    domainCount: number,
    avgSimilarity: number,
    relationshipCount: number
  ): number {
    // Base confidence from success rate
    const successRate = totalTransfers > 0 ? successfulTransfers / totalTransfers : 0;

    // More transfers = more confidence
    const transferFactor = Math.min(1, successfulTransfers / 10);

    // Graph density: (number of edges) / (number of possible edges)
    const maxPossibleEdges = domainCount > 1 ? (domainCount * (domainCount - 1)) / 2 : 1;
    const connectionDensity = relationshipCount / maxPossibleEdges;

    // Similarity adds confidence
    const similarityFactor = avgSimilarity;

    // Weighted combination
    const confidence =
      successRate * 0.3 +
      transferFactor * 0.3 +
      Math.min(1, connectionDensity) * 0.2 +
      similarityFactor * 0.2;

    return Math.min(1, confidence);
  }

  /**
   * Check if domains already form an existing group
   */
  private findExistingGroup(domains: string[]): DomainGroup | LearnedDomainGroup | null {
    // Check hardcoded groups
    for (const group of getDomainGroups()) {
      const overlap = domains.filter((d) =>
        group.domains.some((gd) => d === gd || d.endsWith('.' + gd))
      );
      if (overlap.length >= domains.length * 0.7) {
        return group;
      }
    }

    // Check learned groups
    for (const group of this.learnedGroups.values()) {
      const overlap = domains.filter((d) => group.domains.includes(d));
      if (overlap.length >= domains.length * 0.7) {
        return group;
      }
    }

    return null;
  }

  /**
   * Create a new learned domain group from a suggestion
   */
  private createLearnedGroup(suggestion: GroupSuggestion): LearnedDomainGroup {
    const name = `learned_group_${this.nextGroupId++}`;
    const now = Date.now();

    const group: LearnedDomainGroup = {
      name,
      domains: suggestion.domains,
      confidence: suggestion.confidence,
      createdAt: now,
      lastUpdated: now,
      source: 'transfer_learning',
      evidence: {
        totalTransfers: suggestion.evidence.totalTransfers,
        successfulTransfers: suggestion.evidence.transferSuccesses,
        avgSimilarity: suggestion.evidence.avgSimilarity,
      },
      registered: false,
    };

    this.learnedGroups.set(name, group);

    log.info('Learned domain group created', {
      name,
      domains: group.domains,
      confidence: group.confidence,
    });

    // Register with heuristics config if confidence is high
    if (group.confidence >= MIN_CONFIDENCE_FOR_REGISTRATION) {
      this.registerGroup(group);
    }

    this.save();
    return group;
  }

  /**
   * Register a learned group with the heuristics config
   */
  registerGroup(group: LearnedDomainGroup): void {
    if (group.registered) return;

    // Convert to DomainGroup format
    const domainGroup: DomainGroup = {
      name: group.name,
      domains: group.domains,
      sharedPatterns: {
        cookieBannerSelectors: [],
        contentSelectors: [],
        navigationSelectors: [],
        commonAuthType: 'none',
      },
      lastUpdated: group.lastUpdated,
    };

    addDomainGroup(domainGroup);
    group.registered = true;

    log.info('Learned group registered with heuristics config', {
      name: group.name,
      domains: group.domains.length,
    });

    this.save();
  }

  /**
   * Get all learned domain groups
   */
  getLearnedGroups(): LearnedDomainGroup[] {
    return Array.from(this.learnedGroups.values());
  }

  /**
   * Get suggestions for domain groups based on current data
   */
  getSuggestions(): GroupSuggestion[] {
    return this.analyzeForGroups();
  }

  /**
   * Get statistics about the learner
   */
  getStats(): {
    totalTransfers: number;
    successfulTransfers: number;
    uniqueDomains: number;
    relationships: number;
    learnedGroups: number;
    registeredGroups: number;
  } {
    // Use incremental counters for O(1) performance
    const relationships = this.getRelationships();
    const registeredGroups = Array.from(this.learnedGroups.values()).filter(
      (g) => g.registered
    ).length;

    return {
      totalTransfers: this.transfers.length,
      successfulTransfers: this.successfulTransferCount,
      uniqueDomains: this.uniqueDomains.size,
      relationships: relationships.length,
      learnedGroups: this.learnedGroups.size,
      registeredGroups,
    };
  }

  /**
   * Suggest domains that might belong to a group with an existing domain
   * Uses transfer history and pattern similarity
   */
  suggestRelatedDomains(domain: string): string[] {
    const normalized = this.normalizeDomain(domain);
    const related = new Set<string>();

    // Find domains with successful transfers
    for (const transfer of this.transfers) {
      if (!transfer.success) continue;

      if (transfer.sourceDomain === normalized) {
        related.add(transfer.targetDomain);
      } else if (transfer.targetDomain === normalized) {
        related.add(transfer.sourceDomain);
      }
    }

    return Array.from(related);
  }

  /**
   * Merge domains into an existing learned group
   */
  mergeIntoGroup(groupName: string, newDomains: string[]): boolean {
    const group = this.learnedGroups.get(groupName);
    if (!group) return false;

    const normalizedNew = newDomains.map((d) => this.normalizeDomain(d));
    const existingSet = new Set(group.domains);

    for (const domain of normalizedNew) {
      if (!existingSet.has(domain)) {
        group.domains.push(domain);
        existingSet.add(domain);
      }
    }

    group.lastUpdated = Date.now();
    group.source = 'merged';

    // Re-register if already registered
    if (group.registered) {
      addDomainGroup({
        name: group.name,
        domains: group.domains,
        sharedPatterns: {
          cookieBannerSelectors: [],
          contentSelectors: [],
          navigationSelectors: [],
          commonAuthType: 'none',
        },
        lastUpdated: group.lastUpdated,
      });
    }

    log.info('Domains merged into group', {
      groupName,
      newDomains: normalizedNew,
      totalDomains: group.domains.length,
    });

    this.save();
    return true;
  }

  /**
   * Normalize a domain for consistent comparison
   */
  private normalizeDomain(domain: string): string {
    let normalized = domain.toLowerCase().trim();
    // Remove www. prefix
    if (normalized.startsWith('www.')) {
      normalized = normalized.slice(4);
    }
    return normalized;
  }

  /**
   * Load persisted data
   */
  private async load(): Promise<void> {
    const data = await this.store.load();
    if (data) {
      this.transfers = data.transfers || [];
      this.learnedGroups = new Map();

      // Rebuild incremental stats from loaded transfers
      this.successfulTransferCount = 0;
      this.uniqueDomains.clear();
      for (const t of this.transfers) {
        this.uniqueDomains.add(t.sourceDomain);
        this.uniqueDomains.add(t.targetDomain);
        if (t.success) {
          this.successfulTransferCount++;
        }
      }

      for (const group of data.learnedGroups || []) {
        this.learnedGroups.set(group.name, group);
        // Update nextGroupId
        const match = group.name.match(/learned_group_(\d+)/);
        if (match) {
          const id = parseInt(match[1], 10);
          if (id >= this.nextGroupId) {
            this.nextGroupId = id + 1;
          }
        }
      }

      log.debug('Loaded domain group learner data', {
        transfers: this.transfers.length,
        groups: this.learnedGroups.size,
      });

      // Re-register groups that were previously registered
      for (const group of this.learnedGroups.values()) {
        if (group.registered) {
          addDomainGroup({
            name: group.name,
            domains: group.domains,
            sharedPatterns: {
              cookieBannerSelectors: [],
              contentSelectors: [],
              navigationSelectors: [],
              commonAuthType: 'none',
            },
            lastUpdated: group.lastUpdated,
          });
        }
      }
    }
  }

  /**
   * Save data to disk
   */
  private save(): void {
    const data: LearnedGroupsData = {
      version: '1.0.0',
      transfers: this.transfers,
      learnedGroups: Array.from(this.learnedGroups.values()),
      lastSaved: Date.now(),
    };

    this.store.save(data).catch((error) => {
      log.error('Failed to save domain group learner data', { error });
    });
  }

  /**
   * Flush pending writes
   */
  async flush(): Promise<void> {
    await this.store.flush();
  }

  /**
   * Clear all learned data (for testing)
   */
  clear(): void {
    this.transfers = [];
    this.learnedGroups.clear();
    this.nextGroupId = 1;
    this.successfulTransferCount = 0;
    this.uniqueDomains.clear();
    this.save();
  }

  /**
   * Subscribe to pattern registry events for automatic learning
   * Call this to wire the learner to an ApiPatternRegistry instance
   */
  subscribeToRegistry(
    subscribe: (listener: (event: import('../types/api-patterns.js').PatternLearningEvent) => void) => () => void
  ): () => void {
    return subscribe((event) => {
      if (event.type === 'pattern_transferred') {
        this.recordTransfer(
          event.sourceDomain,
          event.targetDomain,
          event.success,
          {
            patternId: event.sourcePatternId,
            similarity: event.similarity,
          }
        );
      }
    });
  }
}

// Default instance
export const domainGroupLearner = new DomainGroupLearner();
