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
import type {
  BrowsingSkill,
  BrowsingAction,
  BrowsingTrajectory,
  SkillPreconditions,
  SkillMatch,
  PageContext,
  ProceduralMemoryConfig,
} from '../types/index.js';

// Default configuration
const DEFAULT_CONFIG: ProceduralMemoryConfig = {
  embeddingDim: 64,
  similarityThreshold: 0.7,
  maxSkills: 1000,
  minTrajectoryLength: 2,
  mergeThreshold: 0.9,
  filePath: './procedural-memory.json',
};

// Common skill templates for bootstrapping
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
  private trajectoryBuffer: BrowsingTrajectory[] = [];
  private config: ProceduralMemoryConfig;

  constructor(config: Partial<ProceduralMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    await this.load();
    console.error(`[ProceduralMemory] Initialized with ${this.skills.size} skills`);
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

    // Feature extraction and encoding
    let featureIndex = 0;

    // Domain features (positions 0-7)
    if (features.domain) {
      const domainHash = this.hashString(String(features.domain));
      for (let i = 0; i < 8 && i < this.config.embeddingDim; i++) {
        embedding[i] = ((domainHash >> (i * 4)) & 0xf) / 15;
      }
      featureIndex = 8;
    }

    // URL pattern features (positions 8-15)
    if (features.urlPattern) {
      const urlHash = this.hashString(String(features.urlPattern));
      for (let i = 0; i < 8 && featureIndex + i < this.config.embeddingDim; i++) {
        embedding[featureIndex + i] = ((urlHash >> (i * 4)) & 0xf) / 15;
      }
      featureIndex += 8;
    }

    // Page type encoding (positions 16-23)
    const pageTypes = ['list', 'detail', 'form', 'search', 'login', 'unknown'];
    if (features.pageType && typeof features.pageType === 'string') {
      const pageTypeIndex = pageTypes.indexOf(features.pageType);
      if (pageTypeIndex >= 0 && featureIndex < this.config.embeddingDim) {
        embedding[featureIndex + pageTypeIndex] = 1.0;
      }
    }
    featureIndex += 8;

    // Boolean features (positions 24-31)
    const boolFeatures = ['hasForm', 'hasPagination', 'hasTable', 'hasLogin'];
    for (let i = 0; i < boolFeatures.length && featureIndex + i < this.config.embeddingDim; i++) {
      if (features[boolFeatures[i]]) {
        embedding[featureIndex + i] = 1.0;
      }
    }
    featureIndex += 8;

    // Action sequence encoding (positions 32-47)
    if (Array.isArray(features.actions)) {
      const actionTypes = ['navigate', 'click', 'fill', 'select', 'scroll', 'wait', 'extract', 'dismiss_banner'];
      const actionCounts = new Array(actionTypes.length).fill(0);

      for (const action of features.actions as BrowsingAction[]) {
        const idx = actionTypes.indexOf(action.type);
        if (idx >= 0) actionCounts[idx]++;
      }

      // Normalize and encode
      const maxCount = Math.max(...actionCounts, 1);
      for (let i = 0; i < actionTypes.length && featureIndex + i < this.config.embeddingDim; i++) {
        embedding[featureIndex + i] = actionCounts[i] / maxCount;
      }
      featureIndex += 16;
    }

    // Selector features (positions 48-55)
    if (Array.isArray(features.selectors)) {
      const selectorHash = this.hashString((features.selectors as string[]).join(','));
      for (let i = 0; i < 8 && featureIndex + i < this.config.embeddingDim; i++) {
        embedding[featureIndex + i] = ((selectorHash >> (i * 4)) & 0xf) / 15;
      }
      featureIndex += 8;
    }

    // Content type hints (positions 56-63)
    const contentTypes = ['main_content', 'requirements', 'fees', 'timeline', 'documents', 'contact', 'navigation', 'table'];
    if (Array.isArray(features.contentTypes)) {
      for (const ct of features.contentTypes as string[]) {
        const idx = contentTypes.indexOf(ct);
        if (idx >= 0 && featureIndex + idx < this.config.embeddingDim) {
          embedding[featureIndex + idx] = 1.0;
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
  recordTrajectory(trajectory: BrowsingTrajectory): void {
    this.trajectoryBuffer.push(trajectory);

    // Limit buffer size
    if (this.trajectoryBuffer.length > 100) {
      this.trajectoryBuffer = this.trajectoryBuffer.slice(-100);
    }

    // Attempt to extract skills from successful trajectories
    if (trajectory.success && trajectory.actions.length >= this.config.minTrajectoryLength) {
      this.extractAndLearnSkill(trajectory);
    }
  }

  /**
   * Extract a skill from a successful trajectory
   */
  private extractAndLearnSkill(trajectory: BrowsingTrajectory): BrowsingSkill | null {
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
      return this.mergeSkill(existingSkill, meaningfulActions, trajectory);
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

    this.addSkill(skill);
    console.error(`[ProceduralMemory] Learned new skill: ${skill.name}`);

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
  private mergeSkill(
    existing: BrowsingSkill,
    newActions: BrowsingAction[],
    trajectory: BrowsingTrajectory
  ): BrowsingSkill {
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
    this.save();

    console.error(`[ProceduralMemory] Merged into existing skill: ${existing.name}`);
    return existing;
  }

  /**
   * Add a new skill to the library
   */
  addSkill(skill: BrowsingSkill): void {
    // Enforce max skills limit
    if (this.skills.size >= this.config.maxSkills) {
      this.evictLeastUsedSkill();
    }

    this.skills.set(skill.id, skill);
    this.save();
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
      console.error(`[ProceduralMemory] Evicted skill: ${leastUsed.name}`);
    }
  }

  /**
   * Record skill execution result
   */
  recordSkillExecution(skillId: string, success: boolean, duration: number): void {
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

    this.save();
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

      if (data.trajectoryBuffer) {
        this.trajectoryBuffer = data.trajectoryBuffer;
      }

      console.error(`[ProceduralMemory] Loaded ${this.skills.size} skills from ${this.config.filePath}`);
    } catch {
      console.error('[ProceduralMemory] No existing memory found, starting fresh');
    }
  }

  private async save(): Promise<void> {
    try {
      const data = {
        skills: Array.from(this.skills.values()),
        trajectoryBuffer: this.trajectoryBuffer.slice(-50), // Keep last 50
        lastSaved: Date.now(),
        config: this.config,
      };

      await fs.writeFile(this.config.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[ProceduralMemory] Failed to save:', error);
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
}

// Default instance
export const proceduralMemory = new ProceduralMemory();
