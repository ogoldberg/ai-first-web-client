/**
 * Domain Correlator (GAP-009)
 *
 * Tracks and correlates domains that share identity providers for SSO.
 * Enables cross-domain session sharing by learning which domains use the same IdP.
 *
 * Key capabilities:
 * - Learn domain relationships from observed SSO flows
 * - Identify related domains for session sharing
 * - Persist relationships for future use
 */

import { logger } from '../utils/logger.js';
import type { SSOFlowInfo, DomainSSORelationship, IdentityProvider } from './sso-flow-detector.js';

const correlatorLogger = logger.create('DomainCorrelator');

// ============================================
// TYPES
// ============================================

/**
 * A group of domains that share the same identity provider
 */
export interface DomainGroup {
  /** The identity provider for this group */
  providerId: string;
  providerName: string;
  /** Domains in this group */
  domains: string[];
  /** Overall confidence in this grouping */
  confidence: number;
  /** When this group was last updated */
  lastUpdated: number;
}

/**
 * Statistics about domain correlations
 */
export interface CorrelationStats {
  totalRelationships: number;
  totalProviders: number;
  totalDomains: number;
  largestGroup: number;
  averageGroupSize: number;
}

/**
 * Serialized state for persistence
 */
export interface CorrelatorState {
  version: number;
  relationships: DomainSSORelationship[];
  lastUpdated: number;
}

// ============================================
// CONSTANTS
// ============================================

const STATE_VERSION = 1;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;
const CONFIDENCE_DECAY_RATE = 0.95; // Per 30 days
const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// ============================================
// DOMAIN CORRELATOR CLASS
// ============================================

export class DomainCorrelator {
  /** Domain -> Relationship mapping */
  private relationships: Map<string, DomainSSORelationship[]> = new Map();
  /** Provider ID -> Domains mapping (inverse index) */
  private providerDomains: Map<string, Set<string>> = new Map();
  /** Provider ID -> Provider info */
  private providerInfo: Map<string, { id: string; name: string }> = new Map();

  constructor() {}

  /**
   * Learn a domain relationship from an observed SSO flow
   */
  learnFromFlow(flow: SSOFlowInfo): DomainSSORelationship {
    const domain = flow.initiatingDomain;
    const providerId = flow.provider.id;
    const now = Date.now();

    // Store provider info
    this.providerInfo.set(providerId, {
      id: providerId,
      name: flow.provider.name,
    });

    // Get or create relationships for this domain
    let domainRelationships = this.relationships.get(domain);
    if (!domainRelationships) {
      domainRelationships = [];
      this.relationships.set(domain, domainRelationships);
    }

    // Find existing relationship with this provider
    let relationship = domainRelationships.find(r => r.providerId === providerId);

    if (relationship) {
      // Update existing relationship
      relationship.observationCount++;
      relationship.lastObserved = now;
      // Increase confidence with more observations (diminishing returns)
      relationship.confidence = Math.min(1, relationship.confidence + 0.1 * (1 - relationship.confidence));
      if (flow.clientId && !relationship.clientId) {
        relationship.clientId = flow.clientId;
      }
    } else {
      // Create new relationship
      relationship = {
        domain,
        providerId,
        clientId: flow.clientId,
        confidence: 0.6, // Start with moderate confidence
        observationCount: 1,
        lastObserved: now,
        firstObserved: now,
      };
      domainRelationships.push(relationship);
    }

    // Update inverse index
    let providerDomainSet = this.providerDomains.get(providerId);
    if (!providerDomainSet) {
      providerDomainSet = new Set();
      this.providerDomains.set(providerId, providerDomainSet);
    }
    providerDomainSet.add(domain);

    // Also learn the target domain if it's different
    if (flow.targetDomain && flow.targetDomain !== domain) {
      this.learnRelationship(flow.targetDomain, providerId, flow.clientId);
    }

    correlatorLogger.info('Learned domain relationship', {
      domain,
      provider: flow.provider.name,
      confidence: relationship.confidence,
      observationCount: relationship.observationCount,
    });

    return relationship;
  }

  /**
   * Learn a relationship directly (not from a flow)
   */
  learnRelationship(domain: string, providerId: string, clientId?: string): DomainSSORelationship {
    const now = Date.now();

    let domainRelationships = this.relationships.get(domain);
    if (!domainRelationships) {
      domainRelationships = [];
      this.relationships.set(domain, domainRelationships);
    }

    let relationship = domainRelationships.find(r => r.providerId === providerId);

    if (relationship) {
      relationship.observationCount++;
      relationship.lastObserved = now;
      relationship.confidence = Math.min(1, relationship.confidence + 0.05);
    } else {
      relationship = {
        domain,
        providerId,
        clientId,
        confidence: 0.5, // Lower initial confidence for indirect learning
        observationCount: 1,
        lastObserved: now,
        firstObserved: now,
      };
      domainRelationships.push(relationship);
    }

    // Update inverse index
    let providerDomainSet = this.providerDomains.get(providerId);
    if (!providerDomainSet) {
      providerDomainSet = new Set();
      this.providerDomains.set(providerId, providerDomainSet);
    }
    providerDomainSet.add(domain);

    return relationship;
  }

  /**
   * Get domains that share an identity provider with the given domain
   */
  getRelatedDomains(domain: string, minConfidence: number = DEFAULT_CONFIDENCE_THRESHOLD): string[] {
    const relationships = this.relationships.get(domain);
    if (!relationships || relationships.length === 0) {
      return [];
    }

    const relatedDomains: Set<string> = new Set();

    for (const relationship of relationships) {
      if (relationship.confidence < minConfidence) continue;

      const providerDomains = this.providerDomains.get(relationship.providerId);
      if (providerDomains) {
        for (const relatedDomain of providerDomains) {
          if (relatedDomain !== domain) {
            // Check if the related domain also has sufficient confidence
            const relatedRels = this.relationships.get(relatedDomain);
            const relatedRel = relatedRels?.find(r => r.providerId === relationship.providerId);
            if (relatedRel && relatedRel.confidence >= minConfidence) {
              relatedDomains.add(relatedDomain);
            }
          }
        }
      }
    }

    return Array.from(relatedDomains);
  }

  /**
   * Get the identity providers used by a domain
   */
  getProvidersForDomain(domain: string): Array<{ providerId: string; providerName: string; confidence: number }> {
    const relationships = this.relationships.get(domain);
    if (!relationships) return [];

    return relationships.map(r => ({
      providerId: r.providerId,
      providerName: this.providerInfo.get(r.providerId)?.name || r.providerId,
      confidence: r.confidence,
    }));
  }

  /**
   * Get all domains using a specific identity provider
   */
  getDomainsForProvider(providerId: string, minConfidence: number = DEFAULT_CONFIDENCE_THRESHOLD): string[] {
    const domains = this.providerDomains.get(providerId);
    if (!domains) return [];

    return Array.from(domains).filter(domain => {
      const relationships = this.relationships.get(domain);
      const relationship = relationships?.find(r => r.providerId === providerId);
      return relationship && relationship.confidence >= minConfidence;
    });
  }

  /**
   * Get domain groups organized by identity provider
   */
  getDomainGroups(minConfidence: number = DEFAULT_CONFIDENCE_THRESHOLD): DomainGroup[] {
    const groups: DomainGroup[] = [];

    for (const [providerId, domains] of this.providerDomains.entries()) {
      const filteredDomains: string[] = [];
      let totalConfidence = 0;

      for (const domain of domains) {
        const relationships = this.relationships.get(domain);
        const relationship = relationships?.find(r => r.providerId === providerId);
        if (relationship && relationship.confidence >= minConfidence) {
          filteredDomains.push(domain);
          totalConfidence += relationship.confidence;
        }
      }

      if (filteredDomains.length > 0) {
        const providerName = this.providerInfo.get(providerId)?.name || providerId;
        groups.push({
          providerId,
          providerName,
          domains: filteredDomains,
          confidence: totalConfidence / filteredDomains.length,
          lastUpdated: Math.max(
            ...filteredDomains.map(d => {
              const rels = this.relationships.get(d);
              const rel = rels?.find(r => r.providerId === providerId);
              return rel?.lastObserved || 0;
            })
          ),
        });
      }
    }

    // Sort by number of domains (largest groups first)
    return groups.sort((a, b) => b.domains.length - a.domains.length);
  }

  /**
   * Get the best provider match between two domains
   */
  findSharedProvider(domain1: string, domain2: string): { providerId: string; confidence: number } | null {
    const rels1 = this.relationships.get(domain1);
    const rels2 = this.relationships.get(domain2);

    if (!rels1 || !rels2) return null;

    let bestMatch: { providerId: string; confidence: number } | null = null;

    for (const rel1 of rels1) {
      const rel2 = rels2.find(r => r.providerId === rel1.providerId);
      if (rel2) {
        const combinedConfidence = Math.min(rel1.confidence, rel2.confidence);
        if (!bestMatch || combinedConfidence > bestMatch.confidence) {
          bestMatch = {
            providerId: rel1.providerId,
            confidence: combinedConfidence,
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Apply confidence decay to old relationships
   */
  applyDecay(): number {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    let decayed = 0;

    for (const [domain, relationships] of this.relationships.entries()) {
      for (let i = relationships.length - 1; i >= 0; i--) {
        const rel = relationships[i];
        const ageMs = now - rel.lastObserved;

        if (ageMs > STALE_THRESHOLD_MS) {
          // Remove very old relationships
          relationships.splice(i, 1);
          decayed++;

          // Update inverse index
          const providerDomains = this.providerDomains.get(rel.providerId);
          if (providerDomains) {
            providerDomains.delete(domain);
            if (providerDomains.size === 0) {
              this.providerDomains.delete(rel.providerId);
            }
          }
        } else if (ageMs > thirtyDaysMs) {
          // Apply decay to moderately old relationships
          const decayPeriods = Math.floor(ageMs / thirtyDaysMs);
          rel.confidence *= Math.pow(CONFIDENCE_DECAY_RATE, decayPeriods);
        }
      }

      // Clean up empty domain entries
      if (relationships.length === 0) {
        this.relationships.delete(domain);
      }
    }

    if (decayed > 0) {
      correlatorLogger.debug('Applied decay to relationships', { decayed });
    }

    return decayed;
  }

  /**
   * Get statistics about domain correlations
   */
  getStats(): CorrelationStats {
    const groups = this.getDomainGroups(0); // Get all groups
    const allDomains = new Set<string>();

    for (const [domain] of this.relationships) {
      allDomains.add(domain);
    }

    const groupSizes = groups.map(g => g.domains.length);
    const largestGroup = Math.max(0, ...groupSizes);
    const averageGroupSize = groupSizes.length > 0
      ? groupSizes.reduce((a, b) => a + b, 0) / groupSizes.length
      : 0;

    return {
      totalRelationships: Array.from(this.relationships.values()).reduce((sum, rels) => sum + rels.length, 0),
      totalProviders: this.providerDomains.size,
      totalDomains: allDomains.size,
      largestGroup,
      averageGroupSize,
    };
  }

  /**
   * Export state for persistence
   */
  exportState(): CorrelatorState {
    const allRelationships: DomainSSORelationship[] = [];

    for (const relationships of this.relationships.values()) {
      allRelationships.push(...relationships);
    }

    return {
      version: STATE_VERSION,
      relationships: allRelationships,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: CorrelatorState): void {
    if (state.version !== STATE_VERSION) {
      correlatorLogger.warn('State version mismatch, clearing existing data', {
        expected: STATE_VERSION,
        got: state.version,
      });
      this.clear();
      return;
    }

    // Clear existing data
    this.relationships.clear();
    this.providerDomains.clear();

    // Import relationships
    for (const relationship of state.relationships) {
      let domainRels = this.relationships.get(relationship.domain);
      if (!domainRels) {
        domainRels = [];
        this.relationships.set(relationship.domain, domainRels);
      }
      domainRels.push(relationship);

      // Update inverse index
      let providerDomains = this.providerDomains.get(relationship.providerId);
      if (!providerDomains) {
        providerDomains = new Set();
        this.providerDomains.set(relationship.providerId, providerDomains);
      }
      providerDomains.add(relationship.domain);
    }

    correlatorLogger.info('Imported correlator state', {
      relationships: state.relationships.length,
      providers: this.providerDomains.size,
    });

    // Apply decay to imported state
    this.applyDecay();
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.relationships.clear();
    this.providerDomains.clear();
    this.providerInfo.clear();
  }
}
