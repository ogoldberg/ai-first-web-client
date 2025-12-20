/**
 * Learning Provenance Metadata Types (CX-006)
 *
 * Provides tracking of:
 * - Pattern source: How/where the pattern was learned
 * - Last verified: When the pattern was last confirmed to work
 * - Decay history: Why and when confidence was reduced
 *
 * This enables LLM clients to understand:
 * - Trustworthiness of learned patterns
 * - Age and freshness of knowledge
 * - History of pattern reliability
 */

/**
 * How a pattern was learned/discovered
 */
export type PatternSource =
  | 'bootstrap'            // Pre-seeded from known implementations
  | 'api_extraction'       // Learned from successful API extraction
  | 'openapi_discovery'    // Discovered from OpenAPI/Swagger spec
  | 'graphql_introspection' // Discovered from GraphQL introspection
  | 'asyncapi_discovery'   // Discovered from AsyncAPI spec
  | 'alt_spec_discovery'   // Discovered from RAML/API Blueprint/WADL
  | 'docs_page_detection'  // Extracted from API documentation page
  | 'link_discovery'       // Discovered from RFC 8288 links or HATEOAS
  | 'robots_sitemap'       // Discovered from robots.txt/sitemap.xml hints
  | 'backend_fingerprinting' // Inferred from backend framework detection
  | 'cross_site_transfer'  // Transferred from a similar site
  | 'user_feedback'        // Provided or corrected by user
  | 'manual'               // Manually configured
  | 'unknown';             // Source not tracked (legacy patterns)

/**
 * Reasons why confidence may have decayed
 */
export type ConfidenceDecayReason =
  | 'time_decay'           // Confidence reduced due to age without verification
  | 'repeated_failures'    // Multiple failures reduced confidence
  | 'validation_failures'  // Response validation failures
  | 'site_structure_changed' // Site structure changed, patterns invalidated
  | 'rate_limited'         // Pattern caused rate limiting
  | 'auth_expired'         // Authentication expired
  | 'pattern_archived'     // Pattern archived due to non-use
  | 'manual_downgrade';    // Manually downgraded

/**
 * Record of a confidence decay event
 */
export interface DecayEvent {
  /** When the decay occurred */
  timestamp: number;

  /** Why confidence was reduced */
  reason: ConfidenceDecayReason;

  /** Confidence level before decay (0-1 or 'high'/'medium'/'low') */
  previousConfidence: number | 'high' | 'medium' | 'low';

  /** Confidence level after decay (0-1 or 'high'/'medium'/'low') */
  newConfidence: number | 'high' | 'medium' | 'low';

  /** Additional context about the decay */
  details?: string;
}

/**
 * Provenance metadata for learned patterns
 *
 * Tracks the origin and history of a pattern to enable:
 * - Trust assessment (is this pattern reliable?)
 * - Freshness evaluation (is this pattern up-to-date?)
 * - Debugging (why did confidence change?)
 */
export interface ProvenanceMetadata {
  /** How this pattern was learned/discovered */
  source: PatternSource;

  /** URL where the pattern was discovered (e.g., OpenAPI spec URL) */
  sourceUrl?: string;

  /** ID of the source pattern (for transferred patterns) */
  sourcePatternId?: string;

  /** Domain the pattern was originally learned from */
  sourceDomain?: string;

  /** When this pattern was first learned */
  learnedAt: number;

  /** Who/what created this pattern (for audit trail) */
  createdBy?: string;

  /** When this pattern was last verified to work */
  lastVerifiedAt?: number;

  /** When this pattern was last used (attempted, regardless of success) */
  lastUsedAt?: number;

  /** Number of times this pattern has been verified */
  verificationCount: number;

  /** History of confidence decay events (most recent first, max 10) */
  decayHistory?: DecayEvent[];

  /** Tags for categorization/filtering */
  tags?: string[];

  /** Additional metadata from the source */
  sourceMetadata?: Record<string, unknown>;
}

/**
 * Create initial provenance metadata for a newly learned pattern
 */
export function createProvenance(
  source: PatternSource,
  options?: {
    sourceUrl?: string;
    sourcePatternId?: string;
    sourceDomain?: string;
    createdBy?: string;
    tags?: string[];
    sourceMetadata?: Record<string, unknown>;
  }
): ProvenanceMetadata {
  const now = Date.now();
  return {
    source,
    sourceUrl: options?.sourceUrl,
    sourcePatternId: options?.sourcePatternId,
    sourceDomain: options?.sourceDomain,
    learnedAt: now,
    createdBy: options?.createdBy,
    lastVerifiedAt: now,
    lastUsedAt: now,
    verificationCount: 1,
    decayHistory: [],
    tags: options?.tags,
    sourceMetadata: options?.sourceMetadata,
  };
}

/**
 * Record a pattern verification (successful use)
 */
export function recordVerification(provenance: ProvenanceMetadata): ProvenanceMetadata {
  return {
    ...provenance,
    lastVerifiedAt: Date.now(),
    lastUsedAt: Date.now(),
    verificationCount: provenance.verificationCount + 1,
  };
}

/**
 * Record pattern usage (regardless of success)
 */
export function recordUsage(provenance: ProvenanceMetadata): ProvenanceMetadata {
  return {
    ...provenance,
    lastUsedAt: Date.now(),
  };
}

/**
 * Record a confidence decay event
 */
export function recordDecay(
  provenance: ProvenanceMetadata,
  reason: ConfidenceDecayReason,
  previousConfidence: number | 'high' | 'medium' | 'low',
  newConfidence: number | 'high' | 'medium' | 'low',
  details?: string
): ProvenanceMetadata {
  const event: DecayEvent = {
    timestamp: Date.now(),
    reason,
    previousConfidence,
    newConfidence,
    details,
  };

  // Keep only the most recent 10 decay events
  const decayHistory = [event, ...(provenance.decayHistory || [])].slice(0, 10);

  return {
    ...provenance,
    decayHistory,
  };
}

/**
 * Check if provenance indicates the pattern is stale
 * (not verified within the specified number of days)
 */
export function isStale(provenance: ProvenanceMetadata, staleDays: number = 14): boolean {
  if (!provenance.lastVerifiedAt) {
    return true;
  }
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  return Date.now() - provenance.lastVerifiedAt > staleMs;
}

/**
 * Get days since last verification
 */
export function getDaysSinceVerification(provenance: ProvenanceMetadata): number {
  if (!provenance.lastVerifiedAt) {
    return Infinity;
  }
  return Math.floor((Date.now() - provenance.lastVerifiedAt) / (24 * 60 * 60 * 1000));
}

/**
 * Human-readable descriptions for pattern sources
 * (defined at module level for performance)
 */
const SOURCE_DESCRIPTIONS: Record<PatternSource, string> = {
  bootstrap: 'pre-seeded pattern',
  api_extraction: 'learned from successful extraction',
  openapi_discovery: 'discovered from OpenAPI spec',
  graphql_introspection: 'discovered via GraphQL introspection',
  asyncapi_discovery: 'discovered from AsyncAPI spec',
  alt_spec_discovery: 'discovered from API spec (RAML/Blueprint/WADL)',
  docs_page_detection: 'extracted from documentation page',
  link_discovery: 'discovered from API links',
  robots_sitemap: 'discovered from robots.txt/sitemap',
  backend_fingerprinting: 'inferred from backend framework',
  cross_site_transfer: 'transferred from similar site',
  user_feedback: 'provided by user',
  manual: 'manually configured',
  unknown: 'unknown source',
};

/**
 * Get human-readable provenance summary
 */
export function getProvenanceSummary(provenance: ProvenanceMetadata): string {
  const parts: string[] = [];

  // Source description
  parts.push(SOURCE_DESCRIPTIONS[provenance.source] || provenance.source);

  // Source URL
  if (provenance.sourceUrl) {
    parts.push(`from ${provenance.sourceUrl}`);
  }

  // Age
  const learnedDaysAgo = Math.floor((Date.now() - provenance.learnedAt) / (24 * 60 * 60 * 1000));
  if (learnedDaysAgo === 0) {
    parts.push('learned today');
  } else if (learnedDaysAgo === 1) {
    parts.push('learned yesterday');
  } else {
    parts.push(`learned ${learnedDaysAgo} days ago`);
  }

  // Verification status
  const daysSinceVerified = getDaysSinceVerification(provenance);
  if (daysSinceVerified === 0) {
    parts.push('verified today');
  } else if (daysSinceVerified === Infinity) {
    parts.push('never verified');
  } else {
    parts.push(`last verified ${daysSinceVerified} days ago`);
  }

  // Recent decays
  if (provenance.decayHistory && provenance.decayHistory.length > 0) {
    const recentDecay = provenance.decayHistory[0];
    const decayDaysAgo = Math.floor((Date.now() - recentDecay.timestamp) / (24 * 60 * 60 * 1000));
    if (decayDaysAgo < 7) {
      parts.push(`confidence reduced due to ${recentDecay.reason.replace(/_/g, ' ')}`);
    }
  }

  return parts.join('; ');
}
