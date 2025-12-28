/**
 * Cross-Source Verifier (INT-015)
 *
 * Compares the same topic across multiple sources to detect contradictions
 * and provide confidence scoring based on agreement. Extensible to any
 * fact-checking use case.
 *
 * @example
 * ```typescript
 * import { CrossSourceVerifier, verifySources } from 'llm-browser/sdk';
 *
 * // Quick verification of multiple sources
 * const result = verifySources([
 *   { url: 'https://gov.example.com/visa', data: { fee: 100, duration: '30 days' } },
 *   { url: 'https://embassy.example.com/visa', data: { fee: 100, duration: '30 days' } },
 *   { url: 'https://blog.example.com/visa', data: { fee: 150, duration: '2 weeks' } },
 * ]);
 *
 * // Check for contradictions
 * if (result.hasContradictions) {
 *   console.log('Contradictions found:');
 *   for (const c of result.contradictions) {
 *     console.log(`  ${c.field}: ${c.values.join(' vs ')}`);
 *     console.log(`  Recommended: ${c.recommendedValue} (confidence: ${c.confidence})`);
 *   }
 * }
 *
 * // Get verified facts
 * for (const fact of result.verifiedFacts) {
 *   console.log(`${fact.field}: ${fact.value} (${fact.confidence} confidence)`);
 * }
 * ```
 */

import { PersistentStore, createPersistentStore } from '../utils/persistent-store.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

/**
 * Source credibility levels
 */
export type SourceCredibility = 'official' | 'authoritative' | 'secondary' | 'unverified';

/**
 * Agreement levels for facts
 */
export type AgreementLevel = 'unanimous' | 'majority' | 'contested' | 'conflicting';

/**
 * Confidence levels for verification
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

/**
 * A data source for verification
 */
export interface VerificationSource {
  /** Source URL */
  url: string;

  /** Extracted data from the source */
  data: Record<string, unknown>;

  /** Source credibility (official, authoritative, secondary, unverified) */
  credibility?: SourceCredibility;

  /** When the data was extracted */
  extractedAt?: number;

  /** Source language (ISO 639-1) */
  language?: string;

  /** Optional source metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A contradiction detected between sources
 */
export interface Contradiction {
  /** Field that has contradicting values */
  field: string;

  /** Different values found across sources */
  values: { value: unknown; sources: string[] }[];

  /** Severity of the contradiction */
  severity: 'critical' | 'major' | 'minor';

  /** Recommended value based on source credibility */
  recommendedValue?: unknown;

  /** Confidence in the recommended value */
  confidence: ConfidenceLevel;

  /** Explanation of the contradiction */
  explanation: string;
}

/**
 * A verified fact with confidence
 */
export interface VerifiedFact {
  /** Field name */
  field: string;

  /** Verified value */
  value: unknown;

  /** Formatted value for display */
  valueFormatted: string;

  /** Agreement level across sources */
  agreementLevel: AgreementLevel;

  /** Confidence in the verification */
  confidence: ConfidenceLevel;

  /** Sources that agree on this value */
  agreeingSources: string[];

  /** Sources that disagree (if any) */
  disagreeingSources: string[];

  /** Number of sources that provided this value */
  sourceCount: number;
}

/**
 * Result of cross-source verification
 */
export interface VerificationResult {
  /** Whether verification was successful */
  success: boolean;

  /** Total number of sources analyzed */
  sourceCount: number;

  /** Whether any contradictions were found */
  hasContradictions: boolean;

  /** Number of contradictions found */
  contradictionCount: number;

  /** List of contradictions */
  contradictions: Contradiction[];

  /** Verified facts with confidence scores */
  verifiedFacts: VerifiedFact[];

  /** Overall confidence in the verification */
  overallConfidence: ConfidenceLevel;

  /** Summary of the verification */
  summary: string;

  /** Timestamp of verification */
  timestamp: number;

  /** Metadata about the verification */
  metadata: {
    /** Fields analyzed */
    fieldsAnalyzed: string[];
    /** Official sources count */
    officialSources: number;
    /** Authoritative sources count */
    authoritativeSources: number;
  };
}

/**
 * Options for verification
 */
export interface VerificationOptions {
  /** Fields to verify (if empty, verify all) */
  fields?: string[];

  /** Minimum sources required for verification */
  minSources?: number;

  /** Whether to include uncertain facts */
  includeUncertain?: boolean;

  /** Custom field weights for scoring */
  fieldWeights?: Record<string, number>;

  /** URL patterns for official sources */
  officialPatterns?: RegExp[];

  /** URL patterns for authoritative sources */
  authoritativePatterns?: RegExp[];

  /** Threshold for considering values equivalent (for numeric comparison) */
  numericTolerance?: number;
}

/**
 * Historical verification record
 */
export interface VerificationHistoryRecord {
  /** Unique ID */
  id: string;

  /** Topic/subject being verified */
  topic?: string;

  /** Timestamp */
  timestamp: number;

  /** Number of sources */
  sourceCount: number;

  /** Number of contradictions */
  contradictionCount: number;

  /** Overall confidence */
  overallConfidence: ConfidenceLevel;

  /** Source URLs */
  sourceUrls: string[];
}

/**
 * Configuration for the verifier
 */
export interface CrossSourceVerifierConfig {
  /** Storage path for persistence */
  storagePath?: string;

  /** Maximum history entries */
  maxHistoryEntries?: number;

  /** Default official URL patterns */
  defaultOfficialPatterns?: RegExp[];

  /** Default authoritative URL patterns */
  defaultAuthoritativePatterns?: RegExp[];
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default patterns for official sources
 */
const DEFAULT_OFFICIAL_PATTERNS: RegExp[] = [
  /\.gov(\.[a-z]{2})?$/i,
  /\.gob\.[a-z]{2}$/i,
  /\.gouv\.[a-z]{2}$/i,
  /\.gobierno\.[a-z]{2}$/i,
  /^https?:\/\/[^/]*gov[^/]*\//i,
  /^https?:\/\/[^/]*official[^/]*\//i,
  /^https?:\/\/sede\./i,
  /^https?:\/\/www\.extranjeria\./i,
];

/**
 * Default patterns for authoritative sources
 */
const DEFAULT_AUTHORITATIVE_PATTERNS: RegExp[] = [
  /\.edu(\.[a-z]{2})?$/i,
  /\.org$/i,
  /embassy/i,
  /consulate/i,
  /consulat/i,
  /embajada/i,
  /botschaft/i,
  /ambasciata/i,
];

/**
 * Critical fields that are high-severity when contradicted
 */
const CRITICAL_FIELDS = [
  'fee', 'cost', 'price', 'amount', 'tasa', 'prix', 'preis', 'costo',
  'deadline', 'date', 'fecha', 'datum', 'scadenza',
  'requirement', 'requisito', 'exigence', 'anforderung',
];

/**
 * Major fields
 */
const MAJOR_FIELDS = [
  'duration', 'timeline', 'plazo', 'delai', 'dauer',
  'document', 'documento', 'dokument',
  'eligibility', 'elegibilidad', 'admissibilite',
];

// ============================================
// STORED DATA
// ============================================

/**
 * Stored data structure
 */
interface StoredData {
  /** Verification history */
  history: VerificationHistoryRecord[];

  /** Maximum history entries */
  maxHistoryEntries: number;
}

// ============================================
// VERIFIER CLASS
// ============================================

/**
 * Cross-Source Verifier
 *
 * Compares data from multiple sources to detect contradictions
 * and provide confidence-scored verified facts.
 */
export class CrossSourceVerifier {
  private store: PersistentStore<StoredData> | null = null;
  private data: StoredData;
  private config: Required<CrossSourceVerifierConfig>;
  private initialized: boolean = false;

  constructor(config: CrossSourceVerifierConfig = {}) {
    this.config = {
      storagePath: config.storagePath || './cross-source-verification.json',
      maxHistoryEntries: config.maxHistoryEntries || 1000,
      defaultOfficialPatterns: config.defaultOfficialPatterns || DEFAULT_OFFICIAL_PATTERNS,
      defaultAuthoritativePatterns: config.defaultAuthoritativePatterns || DEFAULT_AUTHORITATIVE_PATTERNS,
    };
    this.data = {
      history: [],
      maxHistoryEntries: this.config.maxHistoryEntries,
    };
  }

  /**
   * Initialize the verifier with optional persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.store = createPersistentStore<StoredData>(
        this.config.storagePath,
        'CrossSourceVerifier'
      );
      const stored = await this.store.load();
      if (stored) {
        this.data = {
          ...this.data,
          ...stored,
          maxHistoryEntries: this.config.maxHistoryEntries,
        };
      }
      this.initialized = true;
    } catch (error) {
      // Continue without persistence, but log the error
      logger.server.warn('Failed to initialize persistent store for CrossSourceVerifier. Continuing without persistence.', { error });
      this.initialized = true;
    }
  }

  /**
   * Verify data across multiple sources
   */
  verify(
    sources: VerificationSource[],
    options: VerificationOptions = {}
  ): VerificationResult {
    const minSources = options.minSources || 2;

    // Validate input
    if (sources.length < minSources) {
      return this.createEmptyResult(
        sources.length,
        `Insufficient sources: ${sources.length} provided, ${minSources} required`
      );
    }

    // Determine source credibilities
    const sourcesWithCredibility = sources.map(s => ({
      ...s,
      credibility: s.credibility || this.determineCredibility(s.url, options),
    }));

    // Collect all fields to analyze
    const allFields = this.collectFields(sourcesWithCredibility, options.fields);

    // Analyze each field
    const verifiedFacts: VerifiedFact[] = [];
    const contradictions: Contradiction[] = [];

    for (const field of allFields) {
      const analysis = this.analyzeField(field, sourcesWithCredibility, options);

      if (analysis.contradiction) {
        contradictions.push(analysis.contradiction);
      }

      if (analysis.fact && (options.includeUncertain || analysis.fact.confidence !== 'uncertain')) {
        verifiedFacts.push(analysis.fact);
      }
    }

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(
      verifiedFacts,
      contradictions,
      sourcesWithCredibility
    );

    // Generate summary
    const summary = this.generateSummary(
      sources.length,
      verifiedFacts,
      contradictions,
      overallConfidence
    );

    const result: VerificationResult = {
      success: true,
      sourceCount: sources.length,
      hasContradictions: contradictions.length > 0,
      contradictionCount: contradictions.length,
      contradictions,
      verifiedFacts,
      overallConfidence,
      summary,
      timestamp: Date.now(),
      metadata: {
        fieldsAnalyzed: allFields,
        officialSources: sourcesWithCredibility.filter(s => s.credibility === 'official').length,
        authoritativeSources: sourcesWithCredibility.filter(s => s.credibility === 'authoritative').length,
      },
    };

    // Add to history
    this.addToHistory(result, sources.map(s => s.url)).catch(err => {
      logger.server.error('Failed to add verification to history', { error: err });
    });

    return result;
  }

  /**
   * Get verification history
   */
  getHistory(limit?: number): VerificationHistoryRecord[] {
    const records = this.data.history;
    return limit ? records.slice(0, limit) : records;
  }

  /**
   * Clear history
   */
  async clearHistory(): Promise<void> {
    this.data.history = [];
    await this.save();
  }

  /**
   * Determine source credibility from URL
   */
  private determineCredibility(
    url: string,
    options: VerificationOptions
  ): SourceCredibility {
    const officialPatterns = options.officialPatterns || this.config.defaultOfficialPatterns;
    const authoritativePatterns = options.authoritativePatterns || this.config.defaultAuthoritativePatterns;

    // Check official patterns
    for (const pattern of officialPatterns) {
      if (pattern.test(url)) {
        return 'official';
      }
    }

    // Check authoritative patterns
    for (const pattern of authoritativePatterns) {
      if (pattern.test(url)) {
        return 'authoritative';
      }
    }

    // Check for secondary patterns (news, wiki, etc.)
    if (/wikipedia|wiki|news|blog|forum/i.test(url)) {
      return 'secondary';
    }

    return 'unverified';
  }

  /**
   * Collect all fields to analyze
   */
  private collectFields(
    sources: VerificationSource[],
    specifiedFields?: string[]
  ): string[] {
    if (specifiedFields && specifiedFields.length > 0) {
      return specifiedFields;
    }

    const fieldSet = new Set<string>();
    for (const source of sources) {
      this.collectFieldsFromObject(source.data, '', fieldSet);
    }
    return Array.from(fieldSet);
  }

  /**
   * Recursively collect field paths from an object
   */
  private collectFieldsFromObject(
    obj: Record<string, unknown>,
    prefix: string,
    fieldSet: Set<string>
  ): void {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.collectFieldsFromObject(value as Record<string, unknown>, path, fieldSet);
      } else {
        fieldSet.add(path);
      }
    }
  }

  /**
   * Analyze a single field across sources
   */
  private analyzeField(
    field: string,
    sources: VerificationSource[],
    options: VerificationOptions
  ): { fact?: VerifiedFact; contradiction?: Contradiction } {
    // Collect values from all sources
    const valueMap = new Map<string, { value: unknown; sources: string[]; credibility: SourceCredibility }>();

    for (const source of sources) {
      const value = this.getFieldValue(source.data, field);
      if (value === undefined) continue;

      const normalizedKey = this.normalizeValue(value, options.numericTolerance);

      if (valueMap.has(normalizedKey)) {
        valueMap.get(normalizedKey)!.sources.push(source.url);
      } else {
        valueMap.set(normalizedKey, {
          value,
          sources: [source.url],
          credibility: source.credibility!,
        });
      }
    }

    // No values found
    if (valueMap.size === 0) {
      return {};
    }

    // Single value - no contradiction
    if (valueMap.size === 1) {
      const entry = Array.from(valueMap.values())[0];
      return {
        fact: this.createVerifiedFact(
          field,
          entry.value,
          'unanimous',
          entry.sources,
          [],
          sources.length
        ),
      };
    }

    // Multiple values - analyze for contradictions
    const entries = Array.from(valueMap.entries()).map(([key, entry]) => ({
      key,
      ...entry,
    }));

    // Sort by number of sources (descending), then by credibility
    entries.sort((a, b) => {
      const countDiff = b.sources.length - a.sources.length;
      if (countDiff !== 0) return countDiff;
      return this.credibilityScore(b.credibility) - this.credibilityScore(a.credibility);
    });

    const topEntry = entries[0];
    const otherEntries = entries.slice(1);

    // Determine agreement level
    const totalSources = sources.filter(s => this.getFieldValue(s.data, field) !== undefined).length;
    const agreementRatio = topEntry.sources.length / totalSources;
    const agreementLevel = this.determineAgreementLevel(agreementRatio, entries.length);

    // Determine if this is a contradiction
    const isContradiction = agreementLevel === 'contested' || agreementLevel === 'conflicting';

    if (isContradiction) {
      const contradiction = this.createContradiction(
        field,
        entries,
        topEntry.value,
        agreementLevel
      );
      const fact = this.createVerifiedFact(
        field,
        topEntry.value,
        agreementLevel,
        topEntry.sources,
        otherEntries.flatMap(e => e.sources),
        totalSources
      );
      return { fact, contradiction };
    }

    // Majority agreement - return fact without contradiction
    return {
      fact: this.createVerifiedFact(
        field,
        topEntry.value,
        agreementLevel,
        topEntry.sources,
        otherEntries.flatMap(e => e.sources),
        totalSources
      ),
    };
  }

  /**
   * Get a field value from a nested object
   */
  private getFieldValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Normalize a value for comparison
   */
  private normalizeValue(value: unknown, tolerance?: number): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'number') {
      // Apply tolerance for numeric values
      if (tolerance) {
        return String(Math.round(value / tolerance) * tolerance);
      }
      return String(value);
    }

    if (typeof value === 'string') {
      // Normalize string for comparison
      return value.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    if (typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return JSON.stringify(value.map(v => this.normalizeValue(v, tolerance)).sort());
    }

    if (typeof value === 'object') {
      const sortedKeys = Object.keys(value).sort();
      const normalized: Record<string, string> = {};
      for (const key of sortedKeys) {
        normalized[key] = this.normalizeValue((value as Record<string, unknown>)[key], tolerance);
      }
      return JSON.stringify(normalized);
    }

    return String(value);
  }

  /**
   * Get credibility score for sorting
   */
  private credibilityScore(credibility: SourceCredibility): number {
    switch (credibility) {
      case 'official': return 4;
      case 'authoritative': return 3;
      case 'secondary': return 2;
      case 'unverified': return 1;
      default: return 0;
    }
  }

  /**
   * Determine agreement level from ratio
   */
  private determineAgreementLevel(ratio: number, distinctValues: number): AgreementLevel {
    if (ratio === 1) return 'unanimous';
    if (ratio >= 0.7) return 'majority';
    if (ratio >= 0.4 || distinctValues === 2) return 'contested';
    return 'conflicting';
  }

  /**
   * Create a verified fact
   */
  private createVerifiedFact(
    field: string,
    value: unknown,
    agreementLevel: AgreementLevel,
    agreeingSources: string[],
    disagreeingSources: string[],
    totalSources: number
  ): VerifiedFact {
    const confidence = this.determineConfidence(agreementLevel, agreeingSources.length, totalSources);

    return {
      field,
      value,
      valueFormatted: this.formatValue(value),
      agreementLevel,
      confidence,
      agreeingSources,
      disagreeingSources,
      sourceCount: agreeingSources.length,
    };
  }

  /**
   * Create a contradiction
   */
  private createContradiction(
    field: string,
    entries: { value: unknown; sources: string[]; credibility: SourceCredibility }[],
    recommendedValue: unknown,
    agreementLevel: AgreementLevel
  ): Contradiction {
    const severity = this.determineSeverity(field);
    const confidence = agreementLevel === 'contested' ? 'medium' : 'low';

    const values = entries.map(e => ({
      value: e.value,
      sources: e.sources,
    }));

    const explanation = this.generateContradictionExplanation(
      field,
      entries,
      severity
    );

    return {
      field,
      values,
      severity,
      recommendedValue,
      confidence,
      explanation,
    };
  }

  /**
   * Determine field severity for contradictions
   */
  private determineSeverity(field: string): 'critical' | 'major' | 'minor' {
    const lowerField = field.toLowerCase();

    for (const pattern of CRITICAL_FIELDS) {
      if (lowerField.includes(pattern)) return 'critical';
    }

    for (const pattern of MAJOR_FIELDS) {
      if (lowerField.includes(pattern)) return 'major';
    }

    return 'minor';
  }

  /**
   * Determine confidence level
   */
  private determineConfidence(
    agreementLevel: AgreementLevel,
    agreeingCount: number,
    totalCount: number
  ): ConfidenceLevel {
    if (agreementLevel === 'unanimous' && agreeingCount >= 2) return 'high';
    if (agreementLevel === 'majority' && agreeingCount >= 2) return 'medium';
    if (agreementLevel === 'contested') return 'low';
    if (agreementLevel === 'conflicting') return 'uncertain';

    // Single source
    if (agreeingCount === 1 && totalCount === 1) return 'low';

    return 'uncertain';
  }

  /**
   * Format a value for display
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        if (value.length <= 3) {
          return value.map(v => this.formatValue(v)).join(', ');
        }
        return `[${value.length} items]`;
      }
      // Check for monetary value
      const obj = value as Record<string, unknown>;
      if ('amount' in obj && 'currency' in obj) {
        return `${obj.currency} ${obj.amount}`;
      }
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Generate explanation for a contradiction
   */
  private generateContradictionExplanation(
    field: string,
    entries: { value: unknown; sources: string[]; credibility: SourceCredibility }[],
    severity: 'critical' | 'major' | 'minor'
  ): string {
    const fieldName = this.formatFieldName(field);
    const valueCount = entries.length;

    let severityText = '';
    if (severity === 'critical') {
      severityText = 'This is a critical field - verify with official sources before proceeding.';
    } else if (severity === 'major') {
      severityText = 'This is an important field that may affect planning.';
    }

    const officialValues = entries.filter(e => e.credibility === 'official');
    if (officialValues.length > 0) {
      return `${fieldName} has ${valueCount} different values across sources. Official sources indicate: ${this.formatValue(officialValues[0].value)}. ${severityText}`;
    }

    const authoritativeValues = entries.filter(e => e.credibility === 'authoritative');
    if (authoritativeValues.length > 0) {
      return `${fieldName} has ${valueCount} different values across sources. Authoritative sources suggest: ${this.formatValue(authoritativeValues[0].value)}. ${severityText}`;
    }

    return `${fieldName} has ${valueCount} different values across sources. No official source available for confirmation. ${severityText}`;
  }

  /**
   * Format a field name for display
   */
  private formatFieldName(field: string): string {
    return field
      .split('.')
      .pop()!
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(
    facts: VerifiedFact[],
    contradictions: Contradiction[],
    sources: VerificationSource[]
  ): ConfidenceLevel {
    if (facts.length === 0) return 'uncertain';

    // Check for critical contradictions
    const criticalContradictions = contradictions.filter(c => c.severity === 'critical');
    if (criticalContradictions.length > 0) return 'low';

    // Calculate confidence score
    let score = 0;
    let total = 0;

    for (const fact of facts) {
      const weight = this.getConfidenceWeight(fact.confidence);
      score += weight;
      total += 1;
    }

    // Bonus for official sources
    const officialCount = sources.filter(s => s.credibility === 'official').length;
    if (officialCount > 0) {
      score += officialCount * 0.5;
      total += officialCount * 0.5;
    }

    // Penalty for contradictions
    score -= contradictions.length * 0.5;

    const avgScore = total > 0 ? score / total : 0;

    if (avgScore >= 3) return 'high';
    if (avgScore >= 2) return 'medium';
    if (avgScore >= 1) return 'low';
    return 'uncertain';
  }

  /**
   * Get numeric weight for confidence level
   */
  private getConfidenceWeight(confidence: ConfidenceLevel): number {
    switch (confidence) {
      case 'high': return 4;
      case 'medium': return 3;
      case 'low': return 2;
      case 'uncertain': return 1;
      default: return 0;
    }
  }

  /**
   * Generate verification summary
   */
  private generateSummary(
    sourceCount: number,
    facts: VerifiedFact[],
    contradictions: Contradiction[],
    overallConfidence: ConfidenceLevel
  ): string {
    const parts: string[] = [];

    parts.push(`Analyzed ${sourceCount} sources.`);

    if (facts.length > 0) {
      const highConfidence = facts.filter(f => f.confidence === 'high').length;
      parts.push(`Found ${facts.length} verified facts (${highConfidence} high confidence).`);
    }

    if (contradictions.length > 0) {
      const critical = contradictions.filter(c => c.severity === 'critical').length;
      if (critical > 0) {
        parts.push(`Detected ${contradictions.length} contradictions (${critical} critical).`);
      } else {
        parts.push(`Detected ${contradictions.length} contradictions.`);
      }
    } else {
      parts.push('No contradictions detected.');
    }

    parts.push(`Overall confidence: ${overallConfidence}.`);

    return parts.join(' ');
  }

  /**
   * Create an empty result for error cases
   */
  private createEmptyResult(sourceCount: number, error: string): VerificationResult {
    return {
      success: false,
      sourceCount,
      hasContradictions: false,
      contradictionCount: 0,
      contradictions: [],
      verifiedFacts: [],
      overallConfidence: 'uncertain',
      summary: error,
      timestamp: Date.now(),
      metadata: {
        fieldsAnalyzed: [],
        officialSources: 0,
        authoritativeSources: 0,
      },
    };
  }

  /**
   * Add verification to history
   */
  private async addToHistory(
    result: VerificationResult,
    sourceUrls: string[],
    topic?: string
  ): Promise<void> {
    const record: VerificationHistoryRecord = {
      id: crypto.randomUUID(),
      topic,
      timestamp: result.timestamp,
      sourceCount: result.sourceCount,
      contradictionCount: result.contradictionCount,
      overallConfidence: result.overallConfidence,
      sourceUrls,
    };

    this.data.history.unshift(record);

    // Trim history if needed
    if (this.data.history.length > this.data.maxHistoryEntries) {
      this.data.history = this.data.history.slice(0, this.data.maxHistoryEntries);
    }

    await this.save();
  }

  /**
   * Save data to persistent store
   */
  private async save(): Promise<void> {
    if (this.store) {
      try {
        await this.store.save(this.data);
      } catch (error) {
        logger.server.error('Failed to save CrossSourceVerifier data', { error });
      }
    }
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a new cross-source verifier instance
 */
export function createCrossSourceVerifier(
  config?: CrossSourceVerifierConfig
): CrossSourceVerifier {
  return new CrossSourceVerifier(config);
}

/**
 * Global verifier instance
 */
let globalVerifier: CrossSourceVerifier | null = null;

/**
 * Get the global verifier instance (singleton)
 */
export function getCrossSourceVerifier(): CrossSourceVerifier {
  if (!globalVerifier) {
    globalVerifier = new CrossSourceVerifier();
  }
  return globalVerifier;
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Verify data from multiple sources (convenience function)
 * Uses the global singleton instance for persistence and history.
 */
export function verifySources(
  sources: VerificationSource[],
  options?: VerificationOptions
): VerificationResult {
  const verifier = getCrossSourceVerifier();
  return verifier.verify(sources, options);
}

/**
 * Check if sources have any contradictions (convenience function)
 */
export function hasContradictions(
  sources: VerificationSource[],
  options?: VerificationOptions
): boolean {
  const result = verifySources(sources, options);
  return result.hasContradictions;
}

/**
 * Get only the contradictions from sources (convenience function)
 */
export function getContradictions(
  sources: VerificationSource[],
  options?: VerificationOptions
): Contradiction[] {
  const result = verifySources(sources, options);
  return result.contradictions;
}

/**
 * Get high-confidence facts from sources (convenience function)
 */
export function getHighConfidenceFacts(
  sources: VerificationSource[],
  options?: VerificationOptions
): VerifiedFact[] {
  const result = verifySources(sources, options);
  return result.verifiedFacts.filter(f => f.confidence === 'high');
}
