/**
 * Procedural Memory - Skill-based learning system for intelligent browsing
 *
 * This module implements a procedural memory agent that:
 * - Learns reusable browsing skills from successful trajectories
 * - Stores skills with vector embeddings for similarity matching
 * - Retrieves relevant skills based on page context using cosine similarity
 * - Merges similar skills to prevent redundancy
 * - Tracks skill performance and adapts over time
 *
 * Inspired by: "A Coding Guide to Build a Procedural Memory Agent"
 * https://www.marktechpost.com/2025/12/09/a-coding-guide-to-build-a-procedural-memory-agent
 */

import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';
import type {
  BrowsingSkill,
  BrowsingAction,
  BrowsingTrajectory,
  SkillPreconditions,
  SkillMatch,
  PageContext,
  ProceduralMemoryConfig,
  SkillWorkflow,
  CoverageStats,
  SkillVersion,
  AntiPattern,
  SkillExplanation,
  SkillFeedback,
  ExtendedSkillPreconditions,
} from '../types/index.js';

// Default configuration
const DEFAULT_CONFIG: ProceduralMemoryConfig = {
  embeddingDim: 64,
  similarityThreshold: 0.7,
  maxSkills: 1000,
  minTrajectoryLength: 2,
  mergeThreshold: 0.9,
  filePath: './procedural-memory.json',
  maxVersionsPerSkill: 10,
  maxFeedbackLogSize: 500,
  autoRollbackThreshold: 0.3,
};

// Embedding feature layout configuration
// Defines the structure and position of features within the 64-dimensional embedding vector
const EMBEDDING_FEATURES = {
  DOMAIN: { offset: 0, size: 8 },         // positions 0-7: domain hash
  URL_PATTERN: { offset: 8, size: 8 },    // positions 8-15: URL pattern hash
  PAGE_TYPE: { offset: 16, size: 8 },     // positions 16-23: page type one-hot
  BOOLEAN_FLAGS: { offset: 24, size: 8 }, // positions 24-31: boolean features
  ACTIONS: { offset: 32, size: 16 },      // positions 32-47: action type counts
  SELECTORS: { offset: 48, size: 8 },     // positions 48-55: selector hash
  CONTENT_TYPES: { offset: 56, size: 8 }, // positions 56-63: content type hints
} as const;

// Known page types for embedding encoding
const PAGE_TYPES = ['list', 'detail', 'form', 'search', 'login', 'unknown'] as const;

// Boolean features tracked in embeddings
const BOOLEAN_FEATURES = ['hasForm', 'hasPagination', 'hasTable', 'hasLogin'] as const;

// Action types for sequence encoding
const ACTION_TYPES = ['navigate', 'click', 'fill', 'select', 'scroll', 'wait', 'extract', 'dismiss_banner'] as const;

// Content type categories
const CONTENT_TYPES = ['main_content', 'requirements', 'fees', 'timeline', 'documents', 'contact', 'navigation', 'table'] as const;

// Common skill templates for bootstrapping new instances
// These templates define common browsing patterns that can be used to seed
// the procedural memory with basic skills before any learning has occurred.
// See bootstrapFromTemplates() method for implementation
const SKILL_TEMPLATES: Partial<BrowsingSkill>[] = [
  {
    name: 'cookie_banner_dismiss',
    description: 'Dismiss cookie consent banners on websites',
    preconditions: {
      pageType: 'unknown',
    },
  },
  {
    name: 'pagination_navigate',
    description: 'Navigate through paginated content',
    preconditions: {
      pageType: 'list',
    },
  },
  {
    name: 'form_extraction',
    description: 'Extract data from forms and structured content',
    preconditions: {
      pageType: 'form',
      requiredSelectors: ['form', 'input'],
    },
  },
  {
    name: 'table_extraction',
    description: 'Extract tabular data from pages',
    preconditions: {
      requiredSelectors: ['table'],
      contentTypeHints: ['table'],
    },
  },
];

/**
 * Procedural Memory Agent for browsing skill learning and retrieval
 */
export class ProceduralMemory {
  private skills: Map<string, BrowsingSkill> = new Map();
  private workflows: Map<string, SkillWorkflow> = new Map();
  private trajectoryBuffer: BrowsingTrajectory[] = [];
  private config: ProceduralMemoryConfig;

  // Active learning tracking
  private visitedDomains: Set<string> = new Set();
  private visitedPageTypes: Map<string, number> = new Map(); // pageType -> count
  private failedExtractions: Map<string, number> = new Map(); // domain -> failure count

  // Versioning support
  private skillVersions: Map<string, SkillVersion[]> = new Map(); // skillId -> version history

  // Anti-patterns (negative skills)
  private antiPatterns: Map<string, AntiPattern> = new Map();

  // User feedback
  private feedbackLog: SkillFeedback[] = [];

  constructor(config: Partial<ProceduralMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    await this.load();
    // Apply decay to stale skills on startup
    this.applySkillDecay();
    // Prune consistently failing skills
    this.pruneFailedSkills();
    logger.proceduralMemory.info(`Initialized with ${this.skills.size} skills`);
  }

  // ============================================
  // EMBEDDING GENERATION
  // ============================================

  /**
   * Create a vector embedding for a skill or context
   * Uses a deterministic hash-based approach for consistency
   */
  private createEmbedding(features: Record<string, unknown>): number[] {
    const embedding = new Array(this.config.embeddingDim).fill(0);

    // Domain features
    if (features.domain) {
      const { offset, size } = EMBEDDING_FEATURES.DOMAIN;
      const domainHash = this.hashString(String(features.domain));
      for (let i = 0; i < size && offset + i < this.config.embeddingDim; i++) {
        embedding[offset + i] = ((domainHash >> (i * 4)) & 0xf) / 15;
      }
    }

    // URL pattern features
    if (features.urlPattern) {
      const { offset, size } = EMBEDDING_FEATURES.URL_PATTERN;
      const urlHash = this.hashString(String(features.urlPattern));
      for (let i = 0; i < size && offset + i < this.config.embeddingDim; i++) {
        embedding[offset + i] = ((urlHash >> (i * 4)) & 0xf) / 15;
      }
    }

    // Page type encoding (one-hot)
    if (features.pageType && typeof features.pageType === 'string') {
      const { offset } = EMBEDDING_FEATURES.PAGE_TYPE;
      const pageTypeIndex = PAGE_TYPES.indexOf(features.pageType as typeof PAGE_TYPES[number]);
      if (pageTypeIndex >= 0 && offset + pageTypeIndex < this.config.embeddingDim) {
        embedding[offset + pageTypeIndex] = 1.0;
      }
    }

    // Boolean features
    const { offset: boolOffset } = EMBEDDING_FEATURES.BOOLEAN_FLAGS;
    for (let i = 0; i < BOOLEAN_FEATURES.length && boolOffset + i < this.config.embeddingDim; i++) {
      if (features[BOOLEAN_FEATURES[i]]) {
        embedding[boolOffset + i] = 1.0;
      }
    }

    // Action sequence encoding
    if (Array.isArray(features.actions)) {
      const { offset: actionOffset, size: actionSize } = EMBEDDING_FEATURES.ACTIONS;
      const actionCounts = new Array(ACTION_TYPES.length).fill(0);

      for (const action of features.actions as BrowsingAction[]) {
        const idx = ACTION_TYPES.indexOf(action.type as typeof ACTION_TYPES[number]);
        if (idx >= 0) actionCounts[idx]++;
      }

      // Normalize and encode
      const maxCount = Math.max(...actionCounts, 1);
      for (let i = 0; i < ACTION_TYPES.length && actionOffset + i < this.config.embeddingDim; i++) {
        embedding[actionOffset + i] = actionCounts[i] / maxCount;
      }
    }

    // Selector features
    if (Array.isArray(features.selectors)) {
      const { offset, size } = EMBEDDING_FEATURES.SELECTORS;
      const selectorHash = this.hashString((features.selectors as string[]).join(','));
      for (let i = 0; i < size && offset + i < this.config.embeddingDim; i++) {
        embedding[offset + i] = ((selectorHash >> (i * 4)) & 0xf) / 15;
      }
    }

    // Content type hints
    if (Array.isArray(features.contentTypes)) {
      const { offset: ctOffset } = EMBEDDING_FEATURES.CONTENT_TYPES;
      for (const ct of features.contentTypes as string[]) {
        const idx = CONTENT_TYPES.indexOf(ct as typeof CONTENT_TYPES[number]);
        if (idx >= 0 && ctOffset + idx < this.config.embeddingDim) {
          embedding[ctOffset + idx] = 1.0;
        }
      }
    }

    // Normalize the embedding
    return this.normalizeVector(embedding);
  }

  /**
   * Create embedding from a page context
   */
  private createContextEmbedding(context: PageContext): number[] {
    return this.createEmbedding({
      domain: context.domain,
      urlPattern: this.extractUrlPattern(context.url),
      pageType: context.pageType,
      hasForm: context.hasForm,
      hasPagination: context.hasPagination,
      hasTable: context.hasTable,
      selectors: context.availableSelectors,
    });
  }

  /**
   * Create embedding from a skill
   */
  private createSkillEmbedding(
    preconditions: SkillPreconditions,
    actions: BrowsingAction[]
  ): number[] {
    return this.createEmbedding({
      domain: preconditions.domainPatterns?.[0],
      urlPattern: preconditions.urlPatterns?.[0],
      pageType: preconditions.pageType,
      hasForm: preconditions.requiredSelectors?.some(s => s.includes('form')),
      hasPagination: preconditions.requiredSelectors?.some(s => s.includes('page') || s.includes('next')),
      hasTable: preconditions.requiredSelectors?.some(s => s.includes('table')),
      actions,
      selectors: preconditions.requiredSelectors,
      contentTypes: preconditions.contentTypeHints,
    });
  }

  // ============================================
  // SIMILARITY COMPUTATION
  // ============================================

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Normalize a vector to unit length
   */
  private normalizeVector(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map(v => v / norm);
  }

  // ============================================
  // SKILL RETRIEVAL
  // ============================================

  /**
   * Retrieve the most relevant skills for a given page context
   */
  retrieveSkills(context: PageContext, topK: number = 3): SkillMatch[] {
    const contextEmbedding = this.createContextEmbedding(context);
    const matches: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      const similarity = this.cosineSimilarity(contextEmbedding, skill.embedding);

      // Check if preconditions are met
      const preconditionCheck = this.checkPreconditions(skill.preconditions, context);

      if (similarity >= this.config.similarityThreshold || preconditionCheck.met) {
        matches.push({
          skill,
          similarity,
          preconditionsMet: preconditionCheck.met,
          reason: preconditionCheck.reason,
        });
      }
    }

    // Sort by combined score (similarity + precondition bonus)
    matches.sort((a, b) => {
      const scoreA = a.similarity + (a.preconditionsMet ? 0.2 : 0);
      const scoreB = b.similarity + (b.preconditionsMet ? 0.2 : 0);
      return scoreB - scoreA;
    });

    return matches.slice(0, topK);
  }

  /**
   * Check if skill preconditions are met for a context
   */
  private checkPreconditions(
    preconditions: SkillPreconditions,
    context: PageContext
  ): { met: boolean; reason?: string } {
    // Check domain patterns
    if (preconditions.domainPatterns && preconditions.domainPatterns.length > 0) {
      const domainMatch = preconditions.domainPatterns.some(pattern => {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(context.domain);
        }
        return context.domain.includes(pattern);
      });
      if (!domainMatch) {
        return { met: false, reason: 'Domain pattern mismatch' };
      }
    }

    // Check URL patterns
    if (preconditions.urlPatterns && preconditions.urlPatterns.length > 0) {
      const urlMatch = preconditions.urlPatterns.some(pattern => {
        try {
          const regex = new RegExp(pattern);
          return regex.test(context.url);
        } catch {
          return context.url.includes(pattern);
        }
      });
      if (!urlMatch) {
        return { met: false, reason: 'URL pattern mismatch' };
      }
    }

    // Check page type
    if (preconditions.pageType && preconditions.pageType !== 'unknown') {
      if (context.pageType && context.pageType !== preconditions.pageType) {
        return { met: false, reason: `Page type mismatch: expected ${preconditions.pageType}` };
      }
    }

    // Check required selectors
    if (preconditions.requiredSelectors && preconditions.requiredSelectors.length > 0) {
      if (context.availableSelectors) {
        const hasAllSelectors = preconditions.requiredSelectors.every(required =>
          context.availableSelectors!.some(available => available.includes(required))
        );
        if (!hasAllSelectors) {
          return { met: false, reason: 'Missing required selectors' };
        }
      }
    }

    // Check language
    if (preconditions.language && context.language) {
      if (context.language !== preconditions.language) {
        return { met: false, reason: `Language mismatch: expected ${preconditions.language}` };
      }
    }

    return { met: true };
  }

  // ============================================
  // SKILL LEARNING
  // ============================================

  /**
   * Record a browsing trajectory for potential skill extraction
   */
  async recordTrajectory(trajectory: BrowsingTrajectory): Promise<void> {
    this.trajectoryBuffer.push(trajectory);

    // Limit buffer size
    if (this.trajectoryBuffer.length > 100) {
      this.trajectoryBuffer = this.trajectoryBuffer.slice(-100);
    }

    // Attempt to extract skills from successful trajectories
    if (trajectory.success && trajectory.actions.length >= this.config.minTrajectoryLength) {
      await this.extractAndLearnSkill(trajectory);
    }
  }

  /**
   * Extract a skill from a successful trajectory
   */
  private async extractAndLearnSkill(trajectory: BrowsingTrajectory): Promise<BrowsingSkill | null> {
    // Extract the meaningful action sequence (last N actions that led to success)
    const meaningfulActions = this.extractMeaningfulActions(trajectory.actions);

    if (meaningfulActions.length < this.config.minTrajectoryLength) {
      return null;
    }

    // Generate preconditions from the trajectory
    const preconditions = this.inferPreconditions(trajectory);

    // Create embedding
    const embedding = this.createSkillEmbedding(preconditions, meaningfulActions);

    // Check for similar existing skills
    const existingSkill = this.findSimilarSkill(embedding);

    if (existingSkill && this.cosineSimilarity(embedding, existingSkill.embedding) > this.config.mergeThreshold) {
      // Merge with existing skill
      return await this.mergeSkill(existingSkill, meaningfulActions, trajectory);
    }

    // Create new skill
    const skill: BrowsingSkill = {
      id: this.generateSkillId(),
      name: this.generateSkillName(trajectory, meaningfulActions),
      description: this.generateSkillDescription(trajectory, meaningfulActions),
      preconditions,
      actionSequence: meaningfulActions,
      embedding,
      metrics: {
        successCount: 1,
        failureCount: 0,
        avgDuration: trajectory.totalDuration,
        lastUsed: Date.now(),
        timesUsed: 1,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceUrl: trajectory.startUrl,
      sourceDomain: trajectory.domain,
    };

    await this.addSkill(skill);
    logger.proceduralMemory.info(`Learned new skill: ${skill.name}`);

    return skill;
  }

  /**
   * Extract meaningful actions from a trajectory
   */
  private extractMeaningfulActions(actions: BrowsingAction[]): BrowsingAction[] {
    // Filter out failed actions and redundant waits
    const filtered = actions.filter((action, index) => {
      if (!action.success) return false;
      // Skip consecutive waits
      if (action.type === 'wait' && index > 0 && actions[index - 1].type === 'wait') {
        return false;
      }
      return true;
    });

    // Take the last N actions (most relevant to the outcome)
    const maxActions = Math.min(10, filtered.length);
    return filtered.slice(-maxActions);
  }

  /**
   * Infer preconditions from a trajectory
   */
  private inferPreconditions(trajectory: BrowsingTrajectory): SkillPreconditions {
    const preconditions: SkillPreconditions = {};

    // Domain pattern
    preconditions.domainPatterns = [trajectory.domain];

    // URL pattern (generalize the URL)
    preconditions.urlPatterns = [this.extractUrlPattern(trajectory.startUrl)];

    // Detect page type from actions
    const actionTypes = trajectory.actions.map(a => a.type);
    if (actionTypes.includes('fill')) {
      preconditions.pageType = 'form';
    } else if (trajectory.extractedContent?.tables && trajectory.extractedContent.tables > 0) {
      preconditions.pageType = 'list';
    }

    // Extract required selectors from successful actions
    const selectors = trajectory.actions
      .filter(a => a.success && a.selector)
      .map(a => a.selector!)
      .filter((s, i, arr) => arr.indexOf(s) === i); // unique

    if (selectors.length > 0) {
      preconditions.requiredSelectors = selectors.slice(0, 5);
    }

    return preconditions;
  }

  /**
   * Find an existing skill similar to the given embedding
   */
  private findSimilarSkill(embedding: number[]): BrowsingSkill | null {
    let bestMatch: BrowsingSkill | null = null;
    let bestSimilarity = 0;

    for (const skill of this.skills.values()) {
      const similarity = this.cosineSimilarity(embedding, skill.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = skill;
      }
    }

    return bestSimilarity > this.config.similarityThreshold ? bestMatch : null;
  }

  /**
   * Merge a new trajectory into an existing skill
   */
  private async mergeSkill(
    existing: BrowsingSkill,
    newActions: BrowsingAction[],
    trajectory: BrowsingTrajectory
  ): Promise<BrowsingSkill> {
    // Update metrics
    existing.metrics.successCount++;
    existing.metrics.timesUsed++;
    existing.metrics.avgDuration =
      (existing.metrics.avgDuration * (existing.metrics.timesUsed - 1) + trajectory.totalDuration) /
      existing.metrics.timesUsed;
    existing.metrics.lastUsed = Date.now();

    // Optionally update action sequence if new one is shorter/better
    if (newActions.length < existing.actionSequence.length) {
      existing.actionSequence = newActions;
      existing.embedding = this.createSkillEmbedding(existing.preconditions, newActions);
    }

    // Update domain patterns
    if (!existing.preconditions.domainPatterns?.includes(trajectory.domain)) {
      existing.preconditions.domainPatterns = [
        ...(existing.preconditions.domainPatterns || []),
        trajectory.domain,
      ];
    }

    existing.updatedAt = Date.now();
    await this.save();

    logger.proceduralMemory.info(`Merged into existing skill: ${existing.name}`);
    return existing;
  }

  /**
   * Add a new skill to the library
   */
  async addSkill(skill: BrowsingSkill): Promise<void> {
    // Enforce max skills limit
    if (this.skills.size >= this.config.maxSkills) {
      this.evictLeastUsedSkill();
    }

    this.skills.set(skill.id, skill);
    await this.save();
  }

  /**
   * Remove the least used skill to make room
   */
  private evictLeastUsedSkill(): void {
    let leastUsed: BrowsingSkill | null = null;
    let lowestScore = Infinity;

    for (const skill of this.skills.values()) {
      // Score based on usage and recency
      const daysSinceUsed = (Date.now() - skill.metrics.lastUsed) / (24 * 60 * 60 * 1000);
      const score = skill.metrics.timesUsed / (1 + daysSinceUsed * 0.1);

      if (score < lowestScore) {
        lowestScore = score;
        leastUsed = skill;
      }
    }

    if (leastUsed) {
      this.skills.delete(leastUsed.id);
      logger.proceduralMemory.info(`Evicted skill: ${leastUsed.name}`);
    }
  }

  /**
   * Record skill execution result
   */
  async recordSkillExecution(skillId: string, success: boolean, duration: number): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    if (success) {
      skill.metrics.successCount++;
    } else {
      skill.metrics.failureCount++;
    }

    skill.metrics.timesUsed++;
    skill.metrics.avgDuration =
      (skill.metrics.avgDuration * (skill.metrics.timesUsed - 1) + duration) /
      skill.metrics.timesUsed;
    skill.metrics.lastUsed = Date.now();
    skill.updatedAt = Date.now();

    await this.save();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Extract a generalized URL pattern from a specific URL
   */
  private extractUrlPattern(url: string): string {
    try {
      const parsed = new URL(url);
      // Replace specific IDs with wildcards
      const pathPattern = parsed.pathname
        .replace(/\/\d+/g, '/[0-9]+')
        .replace(/\/[a-f0-9-]{36}/gi, '/[a-f0-9-]+'); // UUIDs
      return `${parsed.origin}${pathPattern}`;
    } catch {
      return url;
    }
  }

  /**
   * Generate a unique skill ID
   */
  private generateSkillId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Generate a human-readable skill name
   */
  private generateSkillName(trajectory: BrowsingTrajectory, actions: BrowsingAction[]): string {
    const actionTypes = [...new Set(actions.map(a => a.type))];
    const domain = trajectory.domain.replace(/^www\./, '').split('.')[0];

    if (actionTypes.includes('fill')) {
      return `${domain}_form_submission`;
    }
    if (actionTypes.includes('extract')) {
      return `${domain}_content_extraction`;
    }
    if (actions.some(a => a.selector?.includes('page') || a.selector?.includes('next'))) {
      return `${domain}_pagination`;
    }
    if (actionTypes.includes('dismiss_banner')) {
      return `${domain}_banner_dismiss`;
    }

    return `${domain}_browse_sequence`;
  }

  /**
   * Generate a skill description
   */
  private generateSkillDescription(trajectory: BrowsingTrajectory, actions: BrowsingAction[]): string {
    const actionSummary = actions.map(a => a.type).join(' → ');
    return `Learned from ${trajectory.domain}: ${actionSummary}`;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // ============================================
  // STATISTICS & DEBUGGING
  // ============================================

  /**
   * Get statistics about the procedural memory
   */
  getStats(): {
    totalSkills: number;
    totalTrajectories: number;
    skillsByDomain: Record<string, number>;
    avgSuccessRate: number;
    mostUsedSkills: Array<{ name: string; uses: number }>;
  } {
    const skillsByDomain: Record<string, number> = {};
    let totalSuccesses = 0;
    let totalExecutions = 0;
    const skillUsage: Array<{ name: string; uses: number }> = [];

    for (const skill of this.skills.values()) {
      // Count by domain
      const domain = skill.sourceDomain || 'unknown';
      skillsByDomain[domain] = (skillsByDomain[domain] || 0) + 1;

      // Track success rate
      totalSuccesses += skill.metrics.successCount;
      totalExecutions += skill.metrics.timesUsed;

      // Track usage
      skillUsage.push({ name: skill.name, uses: skill.metrics.timesUsed });
    }

    // Sort by usage
    skillUsage.sort((a, b) => b.uses - a.uses);

    return {
      totalSkills: this.skills.size,
      totalTrajectories: this.trajectoryBuffer.length,
      skillsByDomain,
      avgSuccessRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 1,
      mostUsedSkills: skillUsage.slice(0, 10),
    };
  }

  /**
   * Get all skills (for debugging/export)
   */
  getAllSkills(): BrowsingSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get a specific skill by ID
   */
  getSkill(skillId: string): BrowsingSkill | null {
    return this.skills.get(skillId) || null;
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.filePath, 'utf-8');
      const data = JSON.parse(content);

      this.skills = new Map();
      if (data.skills) {
        for (const skill of data.skills) {
          this.skills.set(skill.id, skill);
        }
      }

      this.workflows = new Map();
      if (data.workflows) {
        for (const workflow of data.workflows) {
          this.workflows.set(workflow.id, workflow);
        }
      }

      if (data.trajectoryBuffer) {
        this.trajectoryBuffer = data.trajectoryBuffer;
      }

      // Load active learning data
      if (data.visitedDomains) {
        this.visitedDomains = new Set(data.visitedDomains);
      }
      if (data.visitedPageTypes) {
        this.visitedPageTypes = new Map(Object.entries(data.visitedPageTypes));
      }
      if (data.failedExtractions) {
        this.failedExtractions = new Map(Object.entries(data.failedExtractions));
      }

      // Load versioning data
      if (data.skillVersions) {
        this.skillVersions = new Map(Object.entries(data.skillVersions));
      }

      // Load anti-patterns
      if (data.antiPatterns) {
        this.antiPatterns = new Map();
        for (const ap of data.antiPatterns) {
          this.antiPatterns.set(ap.id, ap);
        }
      }

      // Load user feedback
      if (data.feedbackLog) {
        this.feedbackLog = data.feedbackLog;
      }

      logger.proceduralMemory.info(`Loaded ${this.skills.size} skills, ${this.workflows.size} workflows, ${this.antiPatterns.size} anti-patterns from ${this.config.filePath}`);
    } catch {
      logger.proceduralMemory.info('No existing memory found, starting fresh');
    }
  }

  private async save(): Promise<void> {
    try {
      const data = {
        skills: Array.from(this.skills.values()),
        workflows: Array.from(this.workflows.values()),
        trajectoryBuffer: this.trajectoryBuffer.slice(-50), // Keep last 50
        // Active learning data
        visitedDomains: Array.from(this.visitedDomains),
        visitedPageTypes: Object.fromEntries(this.visitedPageTypes),
        failedExtractions: Object.fromEntries(this.failedExtractions),
        // Versioning data
        skillVersions: Object.fromEntries(
          Array.from(this.skillVersions.entries())
        ),
        // Anti-patterns
        antiPatterns: Array.from(this.antiPatterns.values()),
        // User feedback
        feedbackLog: this.feedbackLog.slice(-(this.config.maxFeedbackLogSize ?? 500)),
        lastSaved: Date.now(),
        config: this.config,
      };

      await fs.writeFile(this.config.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      logger.proceduralMemory.error('Failed to save', { error });
    }
  }

  /**
   * Export the full procedural memory for analysis
   */
  async exportMemory(): Promise<string> {
    return JSON.stringify(
      {
        skills: Array.from(this.skills.values()),
        trajectoryBuffer: this.trajectoryBuffer,
        stats: this.getStats(),
        config: this.config,
      },
      null,
      2
    );
  }

  /**
   * Import skills from another instance or backup
   */
  async importSkills(skillsJson: string, merge: boolean = true): Promise<number> {
    try {
      const data = JSON.parse(skillsJson);
      const importedSkills: BrowsingSkill[] = data.skills || data;
      let imported = 0;

      for (const skill of importedSkills) {
        if (!skill.id || !skill.embedding) continue;

        if (merge) {
          // Check for similar existing skill
          const existing = this.findSimilarSkill(skill.embedding);
          if (existing && this.cosineSimilarity(skill.embedding, existing.embedding) > this.config.mergeThreshold) {
            // Merge metrics
            existing.metrics.successCount += skill.metrics.successCount;
            existing.metrics.timesUsed += skill.metrics.timesUsed;
            continue;
          }
        }

        // Add as new skill
        this.skills.set(skill.id, skill);
        imported++;
      }

      await this.save();
      logger.proceduralMemory.info(`Imported ${imported} skills`);
      return imported;
    } catch (error) {
      logger.proceduralMemory.error('Failed to import skills', { error });
      return 0;
    }
  }

  /**
   * Apply decay to skills that haven't been used recently
   */
  applySkillDecay(decayAfterDays: number = 30, decayRate: number = 0.1): number {
    const now = Date.now();
    let decayedCount = 0;

    for (const skill of this.skills.values()) {
      const daysSinceUsed = (now - skill.metrics.lastUsed) / (24 * 60 * 60 * 1000);

      if (daysSinceUsed > decayAfterDays) {
        // Calculate decay factor
        const weeksOverdue = (daysSinceUsed - decayAfterDays) / 7;
        const decayFactor = Math.max(0.1, 1 - (weeksOverdue * decayRate));

        // Apply decay to success count (reduces skill priority in retrieval)
        const originalSuccess = skill.metrics.successCount;
        skill.metrics.successCount = Math.floor(skill.metrics.successCount * decayFactor);

        if (skill.metrics.successCount < originalSuccess) {
          decayedCount++;
          skill.updatedAt = now;
        }
      }
    }

    if (decayedCount > 0) {
      this.save();
      logger.proceduralMemory.info(`Applied decay to ${decayedCount} skills`);
    }

    return decayedCount;
  }

  /**
   * Remove skills with poor performance
   */
  pruneFailedSkills(minSuccessRate: number = 0.3, minUses: number = 3): number {
    const toRemove: string[] = [];

    for (const [id, skill] of this.skills) {
      if (skill.metrics.timesUsed >= minUses) {
        const successRate = skill.metrics.successCount / skill.metrics.timesUsed;
        if (successRate < minSuccessRate) {
          toRemove.push(id);
        }
      }
    }

    for (const id of toRemove) {
      this.skills.delete(id);
    }

    if (toRemove.length > 0) {
      this.save();
      logger.proceduralMemory.info(`Pruned ${toRemove.length} low-performing skills`);
    }

    return toRemove.length;
  }

  /**
   * Get skills grouped by domain for analysis
   */
  getSkillsByDomain(): Map<string, BrowsingSkill[]> {
    const byDomain = new Map<string, BrowsingSkill[]>();

    for (const skill of this.skills.values()) {
      const domain = skill.sourceDomain || 'unknown';
      if (!byDomain.has(domain)) {
        byDomain.set(domain, []);
      }
      byDomain.get(domain)!.push(skill);
    }

    return byDomain;
  }

  // ============================================
  // SKILL COMPOSITION (WORKFLOWS)
  // ============================================

  /**
   * Create a workflow by composing multiple skills
   */
  createWorkflow(
    name: string,
    skillIds: string[],
    description?: string
  ): SkillWorkflow | null {
    // Validate all skills exist
    const skills: BrowsingSkill[] = [];
    for (const id of skillIds) {
      const skill = this.skills.get(id);
      if (!skill) {
        logger.proceduralMemory.warn(`Skill not found for workflow: ${id}`);
        return null;
      }
      skills.push(skill);
    }

    if (skills.length < 2) {
      logger.proceduralMemory.warn('Workflow requires at least 2 skills');
      return null;
    }

    // Merge preconditions from first skill
    const preconditions: SkillPreconditions = { ...skills[0].preconditions };

    // Create transitions
    const transitions: SkillWorkflow['transitions'] = [];
    for (let i = 0; i < skillIds.length - 1; i++) {
      transitions.push({
        fromSkillId: skillIds[i],
        toSkillId: skillIds[i + 1],
        condition: 'success',
      });
    }

    const workflow: SkillWorkflow = {
      id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name,
      description: description || `Workflow: ${skills.map(s => s.name).join(' → ')}`,
      skillIds,
      preconditions,
      transitions,
      metrics: {
        successCount: 0,
        failureCount: 0,
        avgDuration: 0,
        lastUsed: Date.now(),
        timesUsed: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workflows.set(workflow.id, workflow);
    this.save();

    logger.proceduralMemory.info(`Created workflow: ${name}`);
    return workflow;
  }

  /**
   * Get a workflow by ID
   */
  getWorkflow(workflowId: string): SkillWorkflow | null {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): SkillWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Auto-detect potential workflows from trajectory patterns
   */
  detectPotentialWorkflows(): Array<{ skills: string[]; frequency: number }> {
    const sequenceMap = new Map<string, number>();

    // Analyze trajectory buffer for skill sequence patterns
    for (const trajectory of this.trajectoryBuffer) {
      if (!trajectory.success || trajectory.actions.length < 3) continue;

      // Extract action type sequences
      const actionSeq = trajectory.actions
        .filter(a => a.success)
        .map(a => a.type)
        .join('→');

      sequenceMap.set(actionSeq, (sequenceMap.get(actionSeq) || 0) + 1);
    }

    // Find frequent sequences (appeared 3+ times)
    const potentialWorkflows: Array<{ skills: string[]; frequency: number }> = [];

    for (const [seq, count] of sequenceMap) {
      if (count >= 3) {
        // Map action sequence to skill types
        const actionTypes = seq.split('→');
        const skillNames = this.mapActionsToSkillNames(actionTypes);

        if (skillNames.length >= 2) {
          potentialWorkflows.push({
            skills: skillNames,
            frequency: count,
          });
        }
      }
    }

    return potentialWorkflows.sort((a, b) => b.frequency - a.frequency);
  }

  private mapActionsToSkillNames(actionTypes: string[]): string[] {
    const skillNames: string[] = [];

    for (const action of actionTypes) {
      switch (action) {
        case 'dismiss_banner':
          if (!skillNames.includes('cookie_dismiss')) {
            skillNames.push('cookie_dismiss');
          }
          break;
        case 'extract':
          if (!skillNames.includes('content_extraction')) {
            skillNames.push('content_extraction');
          }
          break;
        case 'click':
          if (skillNames[skillNames.length - 1] !== 'navigation') {
            skillNames.push('navigation');
          }
          break;
        case 'fill':
          if (!skillNames.includes('form_fill')) {
            skillNames.push('form_fill');
          }
          break;
      }
    }

    return skillNames;
  }

  // ============================================
  // ACTIVE LEARNING
  // ============================================

  /**
   * Track a domain visit for coverage analysis
   */
  trackVisit(domain: string, pageType: PageContext['pageType'], success: boolean): void {
    this.visitedDomains.add(domain);

    if (pageType) {
      this.visitedPageTypes.set(
        pageType,
        (this.visitedPageTypes.get(pageType) || 0) + 1
      );
    }

    if (!success) {
      this.failedExtractions.set(
        domain,
        (this.failedExtractions.get(domain) || 0) + 1
      );
    }
  }

  /**
   * Get coverage statistics and suggestions for active learning
   */
  getCoverageStats(): CoverageStats {
    // Get domains with skills
    const coveredDomains = new Set<string>();
    const coveredPageTypes = new Set<SkillPreconditions['pageType']>();

    for (const skill of this.skills.values()) {
      if (skill.sourceDomain) {
        coveredDomains.add(skill.sourceDomain);
      }
      if (skill.preconditions.pageType) {
        coveredPageTypes.add(skill.preconditions.pageType);
      }
    }

    // Find uncovered domains (visited but no skills)
    const uncoveredDomains = Array.from(this.visitedDomains)
      .filter(d => !coveredDomains.has(d));

    // Find uncovered page types
    const allPageTypes: Array<SkillPreconditions['pageType']> = [
      'list', 'detail', 'form', 'search', 'login',
    ];
    const uncoveredPageTypes = allPageTypes.filter(pt => !coveredPageTypes.has(pt));

    // Generate suggestions
    const suggestions: CoverageStats['suggestions'] = [];

    // Suggest domains with failed extractions
    for (const [domain, failures] of this.failedExtractions) {
      if (failures >= 3 && !coveredDomains.has(domain)) {
        suggestions.push({
          type: 'domain',
          value: domain,
          reason: `${failures} failed extractions - needs skills`,
          priority: failures >= 5 ? 'high' : 'medium',
        });
      }
    }

    // Suggest frequently visited uncovered domains
    const domainVisitCounts = new Map<string, number>();
    for (const traj of this.trajectoryBuffer) {
      domainVisitCounts.set(
        traj.domain,
        (domainVisitCounts.get(traj.domain) || 0) + 1
      );
    }

    for (const domain of uncoveredDomains) {
      const visits = domainVisitCounts.get(domain) || 0;
      if (visits >= 3) {
        suggestions.push({
          type: 'domain',
          value: domain,
          reason: `Visited ${visits} times but no skills learned`,
          priority: visits >= 5 ? 'high' : 'medium',
        });
      }
    }

    // Suggest uncovered page types
    for (const pageType of uncoveredPageTypes) {
      if (!pageType) continue;
      const visits = this.visitedPageTypes.get(pageType) || 0;
      if (visits >= 2) {
        suggestions.push({
          type: 'pageType',
          value: pageType || 'unknown',
          reason: `${visits} ${pageType} pages visited but no skills`,
          priority: 'medium',
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return {
      coveredDomains: Array.from(coveredDomains),
      coveredPageTypes: Array.from(coveredPageTypes).filter(Boolean) as Array<SkillPreconditions['pageType']>,
      uncoveredDomains,
      uncoveredPageTypes,
      suggestions: suggestions.slice(0, 10), // Top 10 suggestions
    };
  }

  // ============================================
  // IMPROVED EMBEDDINGS
  // ============================================

  /**
   * Create enhanced embedding with more features
   */
  private createEnhancedEmbedding(context: PageContext, actions?: BrowsingAction[]): number[] {
    const embedding = new Array(this.config.embeddingDim).fill(0);
    let idx = 0;

    // Domain features (0-7): Use better hashing
    if (context.domain) {
      const domainParts = context.domain.split('.');
      const tld = domainParts[domainParts.length - 1];
      const sld = domainParts[domainParts.length - 2] || '';

      // TLD type encoding
      const govTlds = ['gov', 'gob', 'edu', 'mil'];
      const commercialTlds = ['com', 'net', 'org', 'io'];

      embedding[idx++] = govTlds.includes(tld) ? 1.0 : 0.0;
      embedding[idx++] = commercialTlds.includes(tld) ? 1.0 : 0.0;

      // Domain hash spread across multiple dimensions
      const domainHash = this.hashString(sld);
      for (let i = 0; i < 6 && idx < 8; i++) {
        embedding[idx++] = ((domainHash >> (i * 5)) & 0x1f) / 31;
      }
    }
    idx = 8;

    // URL structure features (8-15)
    if (context.url) {
      try {
        const url = new URL(context.url);
        const pathDepth = url.pathname.split('/').filter(Boolean).length;
        const hasQuery = url.search.length > 0;
        const hasHash = url.hash.length > 0;

        embedding[idx++] = Math.min(pathDepth / 5, 1.0); // Normalized path depth
        embedding[idx++] = hasQuery ? 1.0 : 0.0;
        embedding[idx++] = hasHash ? 1.0 : 0.0;

        // Path pattern detection
        const pathLower = url.pathname.toLowerCase();
        embedding[idx++] = pathLower.includes('search') || pathLower.includes('buscar') ? 1.0 : 0.0;
        embedding[idx++] = pathLower.includes('login') || pathLower.includes('signin') ? 1.0 : 0.0;
        embedding[idx++] = pathLower.includes('list') || pathLower.includes('index') ? 1.0 : 0.0;
        embedding[idx++] = /\/\d+/.test(url.pathname) ? 1.0 : 0.0; // Has numeric ID
        embedding[idx++] = pathLower.includes('form') || pathLower.includes('submit') ? 1.0 : 0.0;
      } catch {
        idx = 16;
      }
    }
    idx = 16;

    // Page type one-hot encoding (16-23)
    const pageTypes = ['list', 'detail', 'form', 'search', 'login', 'unknown'];
    if (context.pageType) {
      const typeIdx = pageTypes.indexOf(context.pageType);
      if (typeIdx >= 0 && idx + typeIdx < 24) {
        embedding[idx + typeIdx] = 1.0;
      }
    }
    idx = 24;

    // Page element features (24-31)
    embedding[idx++] = context.hasForm ? 1.0 : 0.0;
    embedding[idx++] = context.hasPagination ? 1.0 : 0.0;
    embedding[idx++] = context.hasTable ? 1.0 : 0.0;
    embedding[idx++] = context.contentLength ? Math.min(context.contentLength / 10000, 1.0) : 0.0;
    embedding[idx++] = context.availableSelectors?.includes('main') ? 1.0 : 0.0;
    embedding[idx++] = context.availableSelectors?.includes('article') ? 1.0 : 0.0;
    embedding[idx++] = context.availableSelectors?.includes('table') ? 1.0 : 0.0;
    embedding[idx++] = context.availableSelectors?.includes('form') ? 1.0 : 0.0;
    idx = 32;

    // Action sequence features (32-47)
    if (actions && actions.length > 0) {
      const actionTypes = ['navigate', 'click', 'fill', 'select', 'scroll', 'wait', 'extract', 'dismiss_banner'];
      const actionCounts = new Array(actionTypes.length).fill(0);

      for (const action of actions) {
        const actionIdx = actionTypes.indexOf(action.type);
        if (actionIdx >= 0) actionCounts[actionIdx]++;
      }

      // Normalized action counts
      const maxCount = Math.max(...actionCounts, 1);
      for (let i = 0; i < actionTypes.length && idx < 40; i++) {
        embedding[idx++] = actionCounts[i] / maxCount;
      }

      // Sequence characteristics
      embedding[idx++] = Math.min(actions.length / 10, 1.0); // Sequence length
      embedding[idx++] = actions.filter(a => a.success).length / actions.length; // Success rate
      embedding[idx++] = actions.some(a => a.type === 'fill') ? 1.0 : 0.0; // Has form interaction
      embedding[idx++] = actions.some(a => a.type === 'dismiss_banner') ? 1.0 : 0.0;
      embedding[idx++] = actions.filter(a => a.type === 'click').length / Math.max(actions.length, 1);
      embedding[idx++] = actions.filter(a => a.type === 'extract').length > 0 ? 1.0 : 0.0;
    }
    idx = 48;

    // Selector pattern features (48-55)
    if (context.availableSelectors) {
      const selectorStr = context.availableSelectors.join(',');
      const selectorHash = this.hashString(selectorStr);
      for (let i = 0; i < 8 && idx < 56; i++) {
        embedding[idx++] = ((selectorHash >> (i * 4)) & 0xf) / 15;
      }
    }
    idx = 56;

    // Language features (56-59)
    if (context.language) {
      const langHash = this.hashString(context.language);
      embedding[idx++] = context.language === 'en' ? 1.0 : 0.0;
      embedding[idx++] = context.language === 'es' ? 1.0 : 0.0;
      embedding[idx++] = (langHash & 0xff) / 255;
      embedding[idx++] = ((langHash >> 8) & 0xff) / 255;
    }
    idx = 60;

    // Reserved for future features (60-63)
    // Leave as zeros

    return this.normalizeVector(embedding);
  }

  /**
   * Update createContextEmbedding to use enhanced version
   */
  createContextEmbeddingEnhanced(context: PageContext): number[] {
    return this.createEnhancedEmbedding(context);
  }

  // ============================================
  // SKILL MANAGEMENT
  // ============================================

  /**
   * Manually add a skill (for bootstrapping or import)
   */
  addManualSkill(
    name: string,
    description: string,
    preconditions: SkillPreconditions,
    actionSequence: BrowsingAction[]
  ): BrowsingSkill {
    const skill: BrowsingSkill = {
      id: this.generateSkillId(),
      name,
      description,
      preconditions,
      actionSequence,
      embedding: this.createSkillEmbedding(preconditions, actionSequence),
      metrics: {
        successCount: 0,
        failureCount: 0,
        avgDuration: 0,
        lastUsed: Date.now(),
        timesUsed: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.skills.set(skill.id, skill);
    this.save();

    return skill;
  }

  /**
   * Delete a skill by ID
   */
  deleteSkill(skillId: string): boolean {
    const deleted = this.skills.delete(skillId);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  /**
   * Reset all procedural memory (for testing/debugging)
   */
  async reset(): Promise<void> {
    this.skills.clear();
    this.workflows.clear();
    this.trajectoryBuffer = [];
    this.visitedDomains.clear();
    this.visitedPageTypes.clear();
    this.failedExtractions.clear();
    this.skillVersions.clear();
    this.antiPatterns.clear();
    this.feedbackLog = [];
    await this.save();
    logger.proceduralMemory.info('Reset complete');
  }

  // ============================================
  // SKILL VERSIONING & ROLLBACK
  // ============================================

  /**
   * Create a version snapshot of a skill
   */
  private createVersion(
    skill: BrowsingSkill,
    reason: SkillVersion['changeReason'],
    description?: string
  ): SkillVersion {
    const successRate = skill.metrics.timesUsed > 0
      ? skill.metrics.successCount / skill.metrics.timesUsed
      : 0;

    const versions = this.skillVersions.get(skill.id) || [];
    const nextVersion = versions.length > 0
      ? Math.max(...versions.map(v => v.version)) + 1
      : 1;

    const version: SkillVersion = {
      version: nextVersion,
      createdAt: Date.now(),
      actionSequence: [...skill.actionSequence],
      embedding: [...skill.embedding],
      metricsSnapshot: {
        successCount: skill.metrics.successCount,
        failureCount: skill.metrics.failureCount,
        successRate,
        avgDuration: skill.metrics.avgDuration,
        timesUsed: skill.metrics.timesUsed,
      },
      changeReason: reason,
      changeDescription: description,
    };

    return version;
  }

  /**
   * Save a version to the skill's history
   */
  private saveVersion(skillId: string, version: SkillVersion): void {
    if (!this.skillVersions.has(skillId)) {
      this.skillVersions.set(skillId, []);
    }

    const versions = this.skillVersions.get(skillId)!;
    versions.push(version);

    // Keep only the last N versions
    const maxVersions = this.config.maxVersionsPerSkill ?? 10;
    if (versions.length > maxVersions) {
      versions.splice(0, versions.length - maxVersions);
    }
  }

  /**
   * Get version history for a skill
   */
  getVersionHistory(skillId: string): SkillVersion[] {
    return this.skillVersions.get(skillId) || [];
  }

  /**
   * Rollback a skill to a previous version
   */
  async rollbackSkill(skillId: string, targetVersion?: number): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      logger.proceduralMemory.warn(`Skill not found for rollback: ${skillId}`);
      return false;
    }

    const versions = this.skillVersions.get(skillId);
    if (!versions || versions.length === 0) {
      logger.proceduralMemory.warn(`No version history for skill: ${skillId}`);
      return false;
    }

    // Find target version
    let targetVersionData: SkillVersion;
    if (targetVersion !== undefined) {
      const found = versions.find(v => v.version === targetVersion);
      if (!found) {
        logger.proceduralMemory.warn(`Version ${targetVersion} not found for skill: ${skillId}`);
        return false;
      }
      targetVersionData = found;
    } else {
      // Rollback to previous version (second to last if exists)
      if (versions.length < 2) {
        targetVersionData = versions[0];
      } else {
        targetVersionData = versions[versions.length - 2];
      }
    }

    // Save current state as new version before rollback
    const currentVersion = this.createVersion(skill, 'rollback', `Rolled back to version ${targetVersionData.version}`);
    this.saveVersion(skillId, currentVersion);

    // Apply rollback
    skill.actionSequence = [...targetVersionData.actionSequence];
    skill.embedding = [...targetVersionData.embedding];
    skill.metrics.successCount = targetVersionData.metricsSnapshot.successCount;
    skill.metrics.failureCount = targetVersionData.metricsSnapshot.failureCount;
    skill.metrics.timesUsed = targetVersionData.metricsSnapshot.timesUsed;
    skill.metrics.avgDuration = targetVersionData.metricsSnapshot.avgDuration;
    skill.updatedAt = Date.now();

    await this.save();
    logger.proceduralMemory.info(`Rolled back skill ${skill.name} to version ${targetVersionData.version}`);
    return true;
  }

  /**
   * Check if a skill should be auto-rolled back based on performance degradation
   */
  checkForAutoRollback(skillId: string, threshold?: number): boolean {
    const effectiveThreshold = threshold ?? this.config.autoRollbackThreshold ?? 0.5;
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    const versions = this.skillVersions.get(skillId);
    if (!versions || versions.length < 2) return false;

    // Get current success rate
    const currentSuccessRate = skill.metrics.timesUsed > 0
      ? skill.metrics.successCount / skill.metrics.timesUsed
      : 0;

    // Get best historical success rate
    const bestHistoricalRate = Math.max(
      ...versions.map(v => v.metricsSnapshot.successRate)
    );

    // Check if current performance is significantly worse
    const degradation = bestHistoricalRate - currentSuccessRate;
    if (degradation > effectiveThreshold && skill.metrics.timesUsed >= 5) {
      logger.proceduralMemory.warn(`Performance degradation detected for ${skill.name}: ${(degradation * 100).toFixed(1)}% drop`);
      return true;
    }

    return false;
  }

  /**
   * Get the best performing version of a skill
   */
  getBestVersion(skillId: string): SkillVersion | null {
    const versions = this.skillVersions.get(skillId);
    if (!versions || versions.length === 0) return null;

    return versions.reduce((best, current) =>
      current.metricsSnapshot.successRate > best.metricsSnapshot.successRate ? current : best
    );
  }

  // ============================================
  // NEGATIVE SKILLS (ANTI-PATTERNS)
  // ============================================

  /**
   * Record an anti-pattern from a failed action
   */
  async recordAntiPattern(
    action: BrowsingAction,
    context: PageContext,
    consequences: string[],
    alternatives?: BrowsingAction[]
  ): Promise<AntiPattern> {
    // Check if we already have this anti-pattern
    const existingKey = `${context.domain}:${action.type}:${action.selector || 'none'}`;
    const existing = Array.from(this.antiPatterns.values()).find(
      ap => ap.sourceDomain === context.domain &&
        ap.avoidActions.some(a => a.type === action.type && a.selector === action.selector)
    );

    if (existing) {
      // Update existing anti-pattern
      existing.occurrenceCount++;
      existing.updatedAt = Date.now();
      // Add only new, unique consequences
      for (const consequence of consequences) {
        if (!existing.consequences.includes(consequence)) {
          existing.consequences.push(consequence);
        }
      }
      await this.save();
      return existing;
    }

    // Create new anti-pattern
    const antiPattern: AntiPattern = {
      id: `ap_${crypto.randomBytes(6).toString('hex')}`,
      name: this.generateAntiPatternName(action, context),
      description: `Avoid ${action.type} on ${action.selector || 'this element'} - causes issues`,
      preconditions: {
        domainPatterns: [context.domain],
        urlPatterns: context.url ? [this.extractUrlPattern(context.url)] : undefined,
        pageType: context.pageType,
      },
      avoidActions: [{
        type: action.type,
        selector: action.selector,
        reason: consequences[0] || 'Causes failures',
      }],
      occurrenceCount: 1,
      consequences,
      alternatives,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceDomain: context.domain,
      sourceUrl: context.url,
    };

    this.antiPatterns.set(antiPattern.id, antiPattern);
    await this.save();
    logger.proceduralMemory.info(`Recorded anti-pattern: ${antiPattern.name}`);
    return antiPattern;
  }

  /**
   * Generate a name for an anti-pattern
   */
  private generateAntiPatternName(action: BrowsingAction, context: PageContext): string {
    const domain = context.domain.replace(/^www\./, '').split('.')[0];
    const selectorHint = action.selector
      ? action.selector.includes('#') ? 'id_element'
        : action.selector.includes('.') ? 'class_element'
          : 'element'
      : 'generic';
    return `avoid_${action.type}_${selectorHint}_on_${domain}`;
  }

  /**
   * Check if an action matches any known anti-patterns
   */
  checkAntiPatterns(action: BrowsingAction, context: PageContext): AntiPattern | null {
    for (const antiPattern of this.antiPatterns.values()) {
      // Check domain match
      if (antiPattern.preconditions.domainPatterns) {
        const domainMatch = antiPattern.preconditions.domainPatterns.some(pattern =>
          context.domain.includes(pattern) || pattern.includes(context.domain)
        );
        if (!domainMatch) continue;
      }

      // Check if the action matches
      const actionMatch = antiPattern.avoidActions.some(avoid =>
        avoid.type === action.type &&
        (!avoid.selector || avoid.selector === action.selector)
      );

      if (actionMatch) {
        return antiPattern;
      }
    }
    return null;
  }

  /**
   * Get all anti-patterns for a domain
   */
  getAntiPatternsForDomain(domain: string): AntiPattern[] {
    return Array.from(this.antiPatterns.values()).filter(
      ap => ap.sourceDomain === domain ||
        ap.preconditions.domainPatterns?.some(p => domain.includes(p))
    );
  }

  /**
   * Get all anti-patterns
   */
  getAllAntiPatterns(): AntiPattern[] {
    return Array.from(this.antiPatterns.values());
  }

  // ============================================
  // SKILL EXPLANATION
  // ============================================

  /**
   * Generate a human-readable explanation for a skill
   */
  generateSkillExplanation(skillId: string): SkillExplanation | null {
    const skill = this.skills.get(skillId);
    if (!skill) return null;

    const steps = skill.actionSequence.map((action, index) => ({
      stepNumber: index + 1,
      action: this.describeAction(action),
      target: action.selector,
      purpose: this.inferActionPurpose(action, skill.actionSequence, index),
    }));

    const successRate = skill.metrics.timesUsed > 0
      ? skill.metrics.successCount / skill.metrics.timesUsed
      : 0;

    const explanation: SkillExplanation = {
      summary: this.generateSkillSummary(skill),
      steps,
      applicability: this.describeApplicability(skill.preconditions),
      reliability: this.describeReliability(skill.metrics, successRate),
      tips: this.generateTips(skill),
    };

    return explanation;
  }

  /**
   * Describe an action in plain English
   */
  private describeAction(action: BrowsingAction): string {
    switch (action.type) {
      case 'navigate':
        return `Navigate to ${action.url || 'a new page'}`;
      case 'click':
        return `Click on ${action.selector || 'an element'}`;
      case 'fill':
        return `Fill in ${action.selector || 'a form field'} with "${action.value || 'a value'}"`;
      case 'select':
        return `Select "${action.value || 'an option'}" from ${action.selector || 'a dropdown'}`;
      case 'scroll':
        return 'Scroll the page to load more content';
      case 'wait':
        return `Wait for ${action.waitFor || 'the page'} to be ready`;
      case 'extract':
        return `Extract content from ${action.selector || 'the page'}`;
      case 'dismiss_banner':
        return 'Dismiss a cookie/consent banner';
      default:
        return `Perform ${action.type} action`;
    }
  }

  /**
   * Infer the purpose of an action based on context
   */
  private inferActionPurpose(
    action: BrowsingAction,
    sequence: BrowsingAction[],
    index: number
  ): string {
    if (index === 0 && action.type === 'navigate') {
      return 'Start the browsing session at the target page';
    }

    if (action.type === 'dismiss_banner') {
      return 'Clear obstructions for better content access';
    }

    if (action.type === 'wait') {
      return 'Ensure dynamic content has loaded';
    }

    if (action.type === 'scroll') {
      return 'Trigger lazy-loaded content or reveal more items';
    }

    if (action.type === 'extract') {
      return 'Capture the desired information from the page';
    }

    if (action.type === 'click' && action.selector) {
      if (action.selector.includes('next') || action.selector.includes('page')) {
        return 'Navigate to the next page of results';
      }
      if (action.selector.includes('submit') || action.selector.includes('button')) {
        return 'Submit the form or trigger an action';
      }
      if (action.selector.includes('expand') || action.selector.includes('more')) {
        return 'Expand hidden content or show more details';
      }
    }

    if (action.type === 'fill') {
      return 'Provide required input for the form or search';
    }

    return 'Complete a step in the browsing workflow';
  }

  /**
   * Generate a summary for a skill
   */
  private generateSkillSummary(skill: BrowsingSkill): string {
    const actionTypes = [...new Set(skill.actionSequence.map(a => a.type))];
    const domain = skill.sourceDomain || 'unknown sites';

    if (actionTypes.includes('fill') && actionTypes.includes('extract')) {
      return `This skill fills out forms and extracts data from ${domain}`;
    }

    if (actionTypes.includes('click') && skill.actionSequence.some(a =>
      a.selector?.includes('next') || a.selector?.includes('page')
    )) {
      return `This skill navigates through paginated content on ${domain}`;
    }

    if (actionTypes.includes('dismiss_banner')) {
      return `This skill dismisses consent banners and accesses content on ${domain}`;
    }

    if (actionTypes.includes('extract')) {
      return `This skill extracts specific content from pages on ${domain}`;
    }

    return `This skill performs a ${skill.actionSequence.length}-step browsing workflow on ${domain}`;
  }

  /**
   * Describe when a skill is applicable
   */
  private describeApplicability(preconditions: SkillPreconditions): string {
    const parts: string[] = [];

    if (preconditions.domainPatterns && preconditions.domainPatterns.length > 0) {
      parts.push(`Works on: ${preconditions.domainPatterns.join(', ')}`);
    }

    if (preconditions.pageType && preconditions.pageType !== 'unknown') {
      parts.push(`Best for ${preconditions.pageType} pages`);
    }

    if (preconditions.requiredSelectors && preconditions.requiredSelectors.length > 0) {
      parts.push(`Requires specific elements: ${preconditions.requiredSelectors.slice(0, 3).join(', ')}`);
    }

    if (preconditions.language) {
      parts.push(`For ${preconditions.language} language pages`);
    }

    return parts.length > 0 ? parts.join('. ') : 'Applicable to similar page structures';
  }

  /**
   * Describe skill reliability
   */
  private describeReliability(
    metrics: BrowsingSkill['metrics'],
    successRate: number
  ): string {
    const ratePercent = Math.round(successRate * 100);

    if (metrics.timesUsed === 0) {
      return 'Not yet tested - new skill';
    }

    if (metrics.timesUsed < 3) {
      return `Limited testing (${metrics.timesUsed} uses) - ${ratePercent}% success rate`;
    }

    if (successRate >= 0.9) {
      return `Highly reliable: ${ratePercent}% success rate over ${metrics.timesUsed} uses`;
    }

    if (successRate >= 0.7) {
      return `Generally reliable: ${ratePercent}% success rate over ${metrics.timesUsed} uses`;
    }

    if (successRate >= 0.5) {
      return `Moderately reliable: ${ratePercent}% success rate - may need refinement`;
    }

    return `Low reliability: ${ratePercent}% success rate - consider alternatives`;
  }

  /**
   * Generate usage tips for a skill
   */
  private generateTips(skill: BrowsingSkill): string[] {
    const tips: string[] = [];

    if (skill.actionSequence.some(a => a.type === 'wait')) {
      tips.push('This skill includes wait steps - ensure sufficient timeout');
    }

    if (skill.actionSequence.some(a => a.type === 'scroll')) {
      tips.push('Scrolling is required - may need JavaScript enabled');
    }

    const antiPatterns = this.getAntiPatternsForDomain(skill.sourceDomain || '');
    if (antiPatterns.length > 0) {
      tips.push(`Known issues on this domain - ${antiPatterns.length} anti-patterns recorded`);
    }

    if (skill.metrics.avgDuration > 5000) {
      tips.push(`This skill takes ${Math.round(skill.metrics.avgDuration / 1000)}s on average`);
    }

    if (skill.preconditions.requiredSelectors && skill.preconditions.requiredSelectors.length > 0) {
      tips.push('Verify required elements exist before applying');
    }

    return tips;
  }

  // ============================================
  // USER FEEDBACK
  // ============================================

  /**
   * Record user feedback on a skill application
   */
  async recordFeedback(
    skillId: string,
    rating: 'positive' | 'negative',
    context: { url: string; domain: string },
    reason?: string
  ): Promise<void> {
    const feedback: SkillFeedback = {
      skillId,
      rating,
      reason,
      context: {
        ...context,
        timestamp: Date.now(),
      },
      processed: false,
    };

    this.feedbackLog.push(feedback);

    // Apply feedback to skill metrics
    const skill = this.skills.get(skillId);
    if (skill) {
      if (rating === 'positive') {
        skill.metrics.successCount++;
      } else {
        skill.metrics.failureCount++;

        // Check if we should auto-rollback
        if (this.checkForAutoRollback(skillId)) {
          logger.proceduralMemory.warn(`Auto-rollback triggered for skill ${skill.name} due to negative feedback`);
          await this.rollbackSkill(skillId);
        }
      }
      skill.metrics.timesUsed++;
      skill.updatedAt = Date.now();

      feedback.processed = true;
    }

    // Keep feedback log bounded
    const maxSize = this.config.maxFeedbackLogSize ?? 500;
    if (this.feedbackLog.length > maxSize * 2) {
      this.feedbackLog = this.feedbackLog.slice(-maxSize);
    }

    await this.save();
    logger.proceduralMemory.info(`Recorded ${rating} feedback for skill ${skillId}`);
  }

  /**
   * Get feedback summary for a skill
   */
  getFeedbackSummary(skillId: string): {
    positive: number;
    negative: number;
    recentFeedback: SkillFeedback[];
    commonIssues: string[];
  } {
    const skillFeedback = this.feedbackLog.filter(f => f.skillId === skillId);
    const positive = skillFeedback.filter(f => f.rating === 'positive').length;
    const negative = skillFeedback.filter(f => f.rating === 'negative').length;

    // Get unique negative reasons
    const commonIssues = [...new Set(
      skillFeedback
        .filter(f => f.rating === 'negative' && f.reason)
        .map(f => f.reason!)
    )];

    return {
      positive,
      negative,
      recentFeedback: skillFeedback.slice(-5),
      commonIssues,
    };
  }

  /**
   * Get all feedback
   */
  getAllFeedback(): SkillFeedback[] {
    return [...this.feedbackLog];
  }

  // ============================================
  // SKILL DEPENDENCIES & FALLBACKS
  // ============================================

  /**
   * Add fallback skills to a skill
   */
  async addFallbackSkills(skillId: string, fallbackSkillIds: string[]): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    // Validate fallback skills exist
    for (const fallbackId of fallbackSkillIds) {
      if (!this.skills.has(fallbackId)) {
        logger.proceduralMemory.warn(`Fallback skill not found: ${fallbackId}`);
        return false;
      }
    }

    // Extend preconditions with fallbacks
    (skill.preconditions as ExtendedSkillPreconditions).fallbackSkillIds = fallbackSkillIds;
    skill.updatedAt = Date.now();

    await this.save();
    logger.proceduralMemory.info(`Added ${fallbackSkillIds.length} fallback skills to ${skill.name}`);
    return true;
  }

  /**
   * Add prerequisite skills to a skill
   */
  async addPrerequisites(skillId: string, prerequisiteSkillIds: string[]): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    // Validate prerequisite skills exist
    for (const prereqId of prerequisiteSkillIds) {
      if (!this.skills.has(prereqId)) {
        logger.proceduralMemory.warn(`Prerequisite skill not found: ${prereqId}`);
        return false;
      }
    }

    // Check for circular dependencies using DFS
    if (this.wouldCreateCircularDependency(skillId, prerequisiteSkillIds)) {
      logger.proceduralMemory.warn(`Circular dependency detected when adding prerequisites to ${skillId}`);
      return false;
    }

    // Extend preconditions with prerequisites
    (skill.preconditions as ExtendedSkillPreconditions).prerequisites = prerequisiteSkillIds;
    skill.updatedAt = Date.now();

    await this.save();
    logger.proceduralMemory.info(`Added ${prerequisiteSkillIds.length} prerequisites to ${skill.name}`);
    return true;
  }

  /**
   * Check if adding prerequisites would create a circular dependency using DFS
   */
  private wouldCreateCircularDependency(skillId: string, newPrereqs: string[]): boolean {
    // Build a temporary graph with the proposed new edges
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // DFS to detect cycles
    const hasCycle = (currentId: string): boolean => {
      if (recursionStack.has(currentId)) {
        return true; // Cycle detected
      }
      if (visited.has(currentId)) {
        return false; // Already fully explored
      }

      visited.add(currentId);
      recursionStack.add(currentId);

      // Get prerequisites for this skill
      let prereqs: string[] = [];
      if (currentId === skillId) {
        // Use the proposed new prerequisites
        prereqs = newPrereqs;
      } else {
        const skill = this.skills.get(currentId);
        if (skill) {
          prereqs = (skill.preconditions as ExtendedSkillPreconditions).prerequisites || [];
        }
      }

      // Check each prerequisite
      for (const prereqId of prereqs) {
        if (hasCycle(prereqId)) {
          return true;
        }
      }

      recursionStack.delete(currentId);
      return false;
    };

    // Start DFS from each new prerequisite to see if any path leads back to skillId
    for (const prereqId of newPrereqs) {
      visited.clear();
      recursionStack.clear();
      recursionStack.add(skillId); // Mark skillId as in the current path
      if (hasCycle(prereqId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get fallback skills for a skill
   */
  getFallbackSkills(skillId: string): BrowsingSkill[] {
    const skill = this.skills.get(skillId);
    if (!skill) return [];

    const fallbackIds = (skill.preconditions as ExtendedSkillPreconditions).fallbackSkillIds || [];
    return fallbackIds
      .map(id => this.skills.get(id))
      .filter((s): s is BrowsingSkill => s !== undefined);
  }

  /**
   * Get prerequisite skills for a skill
   */
  getPrerequisiteSkills(skillId: string): BrowsingSkill[] {
    const skill = this.skills.get(skillId);
    if (!skill) return [];

    const prereqIds = (skill.preconditions as ExtendedSkillPreconditions).prerequisites || [];
    return prereqIds
      .map(id => this.skills.get(id))
      .filter((s): s is BrowsingSkill => s !== undefined);
  }

  /**
   * Execute a skill with fallback chain
   */
  async executeWithFallbacks(
    skillId: string,
    executor: (skill: BrowsingSkill) => Promise<boolean>
  ): Promise<{ success: boolean; executedSkillId: string; attempts: number }> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, executedSkillId: skillId, attempts: 0 };
    }

    let attempts = 0;
    const chain = [skill, ...this.getFallbackSkills(skillId)];

    for (const currentSkill of chain) {
      attempts++;
      const startTime = Date.now();
      try {
        const success = await executor(currentSkill);
        const duration = Date.now() - startTime;
        if (success) {
          // Record success with actual duration
          await this.recordSkillExecution(currentSkill.id, true, duration);
          return { success: true, executedSkillId: currentSkill.id, attempts };
        }
        // Record failure with actual duration
        await this.recordSkillExecution(currentSkill.id, false, duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.proceduralMemory.debug(`Skill ${currentSkill.name} failed, trying next fallback`);
        // Record failure with actual duration
        await this.recordSkillExecution(currentSkill.id, false, duration);
      }
    }

    return { success: false, executedSkillId: skillId, attempts };
  }

  // ============================================
  // BOOTSTRAP FROM TEMPLATES
  // ============================================

  /**
   * Bootstrap procedural memory with common skill templates
   */
  async bootstrapFromTemplates(): Promise<number> {
    let bootstrapped = 0;

    for (const template of SKILL_TEMPLATES) {
      // Check if we already have a similar skill
      const existingSkill = Array.from(this.skills.values()).find(
        s => s.name === template.name
      );

      if (existingSkill) {
        logger.proceduralMemory.debug(`Skipping template ${template.name} - already exists`);
        continue;
      }

      // Create skill from template
      const skill = this.addManualSkill(
        template.name!,
        template.description!,
        template.preconditions!,
        this.generateTemplateActions(template.name!)
      );

      if (skill) {
        // Create initial version
        const version = this.createVersion(skill, 'initial', 'Bootstrapped from template');
        this.saveVersion(skill.id, version);
        bootstrapped++;
      }
    }

    if (bootstrapped > 0) {
      await this.save();
      logger.proceduralMemory.info(`Bootstrapped ${bootstrapped} skills from templates`);
    }

    return bootstrapped;
  }

  /**
   * Generate default actions for a template skill
   */
  private generateTemplateActions(templateName: string): BrowsingAction[] {
    const now = Date.now();

    switch (templateName) {
      case 'cookie_banner_dismiss':
        return [
          {
            type: 'wait',
            waitFor: 'load',
            timestamp: now,
            success: true,
          },
          {
            type: 'dismiss_banner',
            selector: '[class*="cookie"], [class*="consent"], [id*="cookie"], [id*="consent"], [class*="gdpr"]',
            timestamp: now + 100,
            success: true,
          },
        ];

      case 'pagination_navigate':
        return [
          {
            type: 'wait',
            waitFor: 'load',
            timestamp: now,
            success: true,
          },
          {
            type: 'extract',
            selector: 'main, article, .content, #content',
            timestamp: now + 100,
            success: true,
          },
          {
            type: 'click',
            selector: '[class*="next"], [rel="next"], .pagination a:last-child, [aria-label*="next"]',
            timestamp: now + 200,
            success: true,
          },
        ];

      case 'form_extraction':
        return [
          {
            type: 'wait',
            waitFor: 'load',
            timestamp: now,
            success: true,
          },
          {
            type: 'extract',
            selector: 'form',
            timestamp: now + 100,
            success: true,
          },
        ];

      case 'table_extraction':
        return [
          {
            type: 'wait',
            waitFor: 'load',
            timestamp: now,
            success: true,
          },
          {
            type: 'extract',
            selector: 'table',
            timestamp: now + 100,
            success: true,
          },
        ];

      default:
        return [
          {
            type: 'wait',
            waitFor: 'load',
            timestamp: now,
            success: true,
          },
          {
            type: 'extract',
            selector: 'body',
            timestamp: now + 100,
            success: true,
          },
        ];
    }
  }
}

// Default instance
export const proceduralMemory = new ProceduralMemory();
