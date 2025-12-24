/**
 * Skill Generalizer - Cross-domain skill transfer using semantic embeddings
 *
 * This module enables skills learned on one domain to be applied to semantically
 * similar domains, even if they weren't in the same pre-configured domain group.
 *
 * Key capabilities:
 * - Semantic domain similarity detection using neural embeddings
 * - Skill abstraction: Convert domain-specific skills to portable templates
 * - Automatic domain clustering based on behavior patterns
 * - Cross-domain skill matching with confidence scoring
 */

import { logger } from '../utils/logger.js';
import { embeddingManager, cosineSimilarity } from '../utils/embedding-provider.js';
import type { ProceduralSkill, SkillAction, SkillPreconditions } from '../types/index.js';

/**
 * Element pattern for abstract templates
 */
interface ElementPattern {
  type: 'semantic' | 'selector';
  semanticDescription?: string;
  selector?: string;
  confidence: number;
}

/**
 * Abstract action pattern
 */
interface ActionPattern {
  type: string;
  elementPattern?: ElementPattern;
  knownSelectors?: string[];
  valuePattern?: string;
  purpose: string;
  optional: boolean;
}

/**
 * Abstract preconditions
 */
interface AbstractPreconditions {
  pageType?: string;
  requiredPatterns?: ElementPattern[];
  contentHints?: string[];
  languagePatterns?: string[];
}

/**
 * Abstract skill template that can be applied across domains
 */
export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  embedding: number[];
  preconditions: AbstractPreconditions;
  actionPatterns: ActionPattern[];
  sourceSkillIds: string[];
  successfulDomains: string[];
  failedDomains: string[];
  crossDomainSuccessRate: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Domain embedding data
 */
interface DomainEmbedding {
  domain: string;
  embedding: number[];
  characteristics: string[];
  lastUpdated: number;
}

/**
 * Domain characteristics for embedding
 */
interface DomainCharacteristics {
  pageTypes?: string[];
  selectors?: string[];
  apiPatterns?: string[];
  language?: string;
}

/**
 * Context for finding applicable templates
 */
interface PageContext {
  domain: string;
  url: string;
  pageType?: string;
  availableSelectors?: string[];
}

/**
 * Template match result
 */
interface TemplateMatch {
  template: SkillTemplate;
  similarity: number;
  reason: string;
}

/**
 * Skill Generalizer - Manages cross-domain skill transfer
 */
export class SkillGeneralizer {
  /** Abstract skill templates */
  private templates = new Map<string, SkillTemplate>();

  /** Domain embeddings for similarity matching */
  private domainEmbeddings = new Map<string, DomainEmbedding>();

  /** Similarity threshold for cross-domain matching */
  private similarityThreshold = 0.65;

  /** Minimum successful applications before a skill can be generalized */
  private minSuccessesForGeneralization = 3;

  constructor() {}

  async initialize(): Promise<void> {
    await embeddingManager.initialize();
    logger.embedding.info('SkillGeneralizer initialized');
  }

  // ============================================
  // SKILL ABSTRACTION
  // ============================================

  /**
   * Create an abstract template from a successful domain-specific skill
   */
  async abstractSkill(skill: ProceduralSkill): Promise<SkillTemplate | null> {
    // Only abstract skills with proven success
    if (skill.metrics.successCount < this.minSuccessesForGeneralization) {
      logger.embedding.debug('Skill not yet ready for abstraction', {
        skillId: skill.id,
        successCount: skill.metrics.successCount,
        required: this.minSuccessesForGeneralization,
      });
      return null;
    }

    const successRate =
      skill.metrics.timesUsed > 0
        ? skill.metrics.successCount / skill.metrics.timesUsed
        : 0;

    if (successRate < 0.7) {
      logger.embedding.debug('Skill success rate too low for abstraction', {
        skillId: skill.id,
        successRate,
      });
      return null;
    }

    // Create semantic description for embedding
    const semanticDesc = this.createSkillSemanticDescription(skill);
    const embedding = await embeddingManager.embed(semanticDesc);

    // Abstract the actions
    const actionPatterns = this.abstractActions(skill.actionSequence);

    // Abstract preconditions
    const abstractPreconditions = this.abstractPreconditions(skill.preconditions);

    const template: SkillTemplate = {
      id: `tmpl_${skill.id}`,
      name: this.generateTemplateName(skill),
      description: this.generateTemplateDescription(skill, actionPatterns),
      embedding,
      preconditions: abstractPreconditions,
      actionPatterns,
      sourceSkillIds: [skill.id],
      successfulDomains: skill.sourceDomain ? [skill.sourceDomain] : [],
      failedDomains: [],
      crossDomainSuccessRate: successRate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Check if we already have a similar template
    const existingTemplate = await this.findSimilarTemplate(embedding);
    if (existingTemplate && cosineSimilarity(embedding, existingTemplate.embedding) > 0.85) {
      // Merge into existing template
      return this.mergeTemplates(existingTemplate, template);
    }

    this.templates.set(template.id, template);

    logger.embedding.info('Created abstract skill template', {
      templateId: template.id,
      name: template.name,
      sourceSkill: skill.id,
    });

    return template;
  }

  /**
   * Create semantic description for a skill
   */
  private createSkillSemanticDescription(skill: ProceduralSkill): string {
    const parts: string[] = [];

    // Describe the page type
    if (skill.preconditions.pageType) {
      parts.push(`page type: ${skill.preconditions.pageType}`);
    }

    // Describe the actions
    const actionTypes = [...new Set(skill.actionSequence.map((a) => a.type))];
    parts.push(`actions: ${actionTypes.join(', ')}`);

    // Include selector hints (abstracted)
    const selectorHints = skill.actionSequence
      .filter((a) => a.selector)
      .map((a) => this.abstractSelector(a.selector!))
      .filter((v, i, arr) => arr.indexOf(v) === i);

    if (selectorHints.length > 0) {
      parts.push(`targets: ${selectorHints.join(', ')}`);
    }

    // Add content type hints
    if (skill.preconditions.contentTypeHints) {
      parts.push(`content: ${skill.preconditions.contentTypeHints.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Abstract a selector into a semantic description
   */
  private abstractSelector(selector: string): string {
    const lower = selector.toLowerCase();

    // Detect common patterns
    if (/button|btn|submit/i.test(lower)) return 'button';
    if (/input|field|text/i.test(lower)) return 'input field';
    if (/form/i.test(lower)) return 'form';
    if (/next|pag|page/i.test(lower)) return 'pagination';
    if (/cookie|consent|gdpr|accept/i.test(lower)) return 'cookie banner';
    if (/table|grid|list/i.test(lower)) return 'data display';
    if (/nav|menu/i.test(lower)) return 'navigation';
    if (/search/i.test(lower)) return 'search';
    if (/login|signin|auth/i.test(lower)) return 'authentication';
    if (/close|dismiss|x\b/i.test(lower)) return 'dismissible element';

    // Extract tag name if present
    const tagMatch = selector.match(/^(\w+)/);
    if (tagMatch) return tagMatch[1];

    return 'element';
  }

  /**
   * Abstract actions into patterns
   */
  private abstractActions(actions: SkillAction[]): ActionPattern[] {
    return actions.map((action) => ({
      type: action.type,
      elementPattern: action.selector
        ? {
            type: 'semantic' as const,
            semanticDescription: this.abstractSelector(action.selector),
            confidence: 0.7,
          }
        : undefined,
      knownSelectors: action.selector ? [action.selector] : undefined,
      valuePattern: action.value,
      purpose: this.inferActionPurpose(action),
      optional: action.type === 'dismiss_banner' || action.type === 'wait',
    }));
  }

  /**
   * Infer the purpose of an action
   */
  private inferActionPurpose(action: SkillAction): string {
    switch (action.type) {
      case 'navigate':
        return 'Navigate to target page';
      case 'click':
        return action.selector?.includes('next') || action.selector?.includes('page')
          ? 'Navigate to next page'
          : 'Interact with element';
      case 'fill':
        return 'Enter data into form';
      case 'select':
        return 'Select option from dropdown';
      case 'scroll':
        return 'Load more content';
      case 'wait':
        return 'Wait for page to be ready';
      case 'extract':
        return 'Extract content from page';
      case 'dismiss_banner':
        return 'Clear obstructions';
      default:
        return 'Perform action';
    }
  }

  /**
   * Abstract preconditions
   */
  private abstractPreconditions(preconditions: SkillPreconditions): AbstractPreconditions {
    return {
      pageType: preconditions.pageType,
      requiredPatterns: preconditions.requiredSelectors?.map((selector) => ({
        type: 'semantic' as const,
        semanticDescription: this.abstractSelector(selector),
        confidence: 0.6,
      })),
      contentHints: preconditions.contentTypeHints,
      languagePatterns: preconditions.language ? [preconditions.language] : undefined,
    };
  }

  /**
   * Generate template name
   */
  private generateTemplateName(skill: ProceduralSkill): string {
    const actionTypes = [...new Set(skill.actionSequence.map((a) => a.type))];

    if (actionTypes.includes('fill') && actionTypes.includes('click')) {
      return 'Form Submission';
    }

    if (skill.actionSequence.some((a) => a.selector?.includes('next') || a.selector?.includes('page'))) {
      return 'Pagination Navigation';
    }

    if (actionTypes.includes('dismiss_banner')) {
      return 'Banner Dismissal';
    }

    if (actionTypes.includes('extract')) {
      return 'Content Extraction';
    }

    return `${skill.preconditions.pageType || 'Generic'} Workflow`;
  }

  /**
   * Generate template description
   */
  private generateTemplateDescription(skill: ProceduralSkill, patterns: ActionPattern[]): string {
    const steps = patterns.map((p) => p.purpose).join(', then ');
    return `Workflow: ${steps}. Originally learned from ${skill.sourceDomain || 'unknown domain'}.`;
  }

  // ============================================
  // CROSS-DOMAIN MATCHING
  // ============================================

  /**
   * Find similar template by embedding
   */
  private async findSimilarTemplate(embedding: number[]): Promise<SkillTemplate | null> {
    let bestMatch: SkillTemplate | null = null;
    let bestSimilarity = 0;

    for (const template of this.templates.values()) {
      const similarity = cosineSimilarity(embedding, template.embedding);
      if (similarity > bestSimilarity && similarity > this.similarityThreshold) {
        bestSimilarity = similarity;
        bestMatch = template;
      }
    }

    return bestMatch;
  }

  /**
   * Find applicable templates for a page context
   */
  async findApplicableTemplates(context: PageContext, topK = 3): Promise<TemplateMatch[]> {
    // Create semantic description of the context
    const contextDesc = embeddingManager.createSemanticDescription({
      domain: context.domain,
      url: context.url,
      pageType: context.pageType,
      contentHints: context.availableSelectors?.slice(0, 5),
    });

    const contextEmbedding = await embeddingManager.embed(contextDesc);

    const matches: TemplateMatch[] = [];

    for (const template of this.templates.values()) {
      const similarity = cosineSimilarity(contextEmbedding, template.embedding);

      // Check if preconditions match
      const preconditionsMatch = this.checkAbstractPreconditions(template.preconditions, context);

      if (similarity > this.similarityThreshold || preconditionsMatch.matches) {
        const combinedScore = similarity * 0.6 + (preconditionsMatch.matches ? 0.4 : 0);

        matches.push({
          template,
          similarity: combinedScore,
          reason: preconditionsMatch.reason || `Semantic similarity: ${(similarity * 100).toFixed(1)}%`,
        });
      }
    }

    // Sort by combined score
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches.slice(0, topK);
  }

  /**
   * Check if abstract preconditions match a context
   */
  private checkAbstractPreconditions(
    preconditions: AbstractPreconditions,
    context: PageContext
  ): { matches: boolean; reason?: string } {
    // Page type match
    if (preconditions.pageType && context.pageType) {
      if (preconditions.pageType === context.pageType) {
        return { matches: true, reason: `Page type matches: ${preconditions.pageType}` };
      }
    }

    // Check content hints
    if (preconditions.contentHints && context.availableSelectors) {
      const matchingHints = preconditions.contentHints.filter((hint) =>
        context.availableSelectors!.some((sel) => sel.toLowerCase().includes(hint.toLowerCase()))
      );
      if (matchingHints.length > 0) {
        return { matches: true, reason: `Content hints match: ${matchingHints.join(', ')}` };
      }
    }

    return { matches: false };
  }

  // ============================================
  // DOMAIN SIMILARITY
  // ============================================

  /**
   * Update domain embedding based on observed characteristics
   */
  async updateDomainEmbedding(domain: string, characteristics: DomainCharacteristics): Promise<void> {
    const parts = [`domain: ${domain}`];

    if (characteristics.pageTypes?.length) {
      parts.push(`page types: ${characteristics.pageTypes.join(', ')}`);
    }

    if (characteristics.selectors?.length) {
      const abstracted = characteristics.selectors.map((s) => this.abstractSelector(s));
      parts.push(`elements: ${[...new Set(abstracted)].join(', ')}`);
    }

    if (characteristics.apiPatterns?.length) {
      parts.push(`apis: ${characteristics.apiPatterns.join(', ')}`);
    }

    if (characteristics.language) {
      parts.push(`language: ${characteristics.language}`);
    }

    const description = parts.join('. ');
    const embedding = await embeddingManager.embed(description);

    this.domainEmbeddings.set(domain, {
      domain,
      embedding,
      characteristics: parts,
      lastUpdated: Date.now(),
    });

    logger.embedding.debug('Updated domain embedding', { domain });
  }

  /**
   * Find domains similar to the given domain
   */
  async findSimilarDomains(domain: string, topK = 5): Promise<Array<{ domain: string; similarity: number }>> {
    const sourceDomain = this.domainEmbeddings.get(domain);

    if (!sourceDomain) {
      // Generate a basic embedding from the domain name
      const embedding = await embeddingManager.embed(`domain: ${domain}`);
      return this.findSimilarDomainsFromEmbedding(embedding, domain, topK);
    }

    return this.findSimilarDomainsFromEmbedding(sourceDomain.embedding, domain, topK);
  }

  private findSimilarDomainsFromEmbedding(
    embedding: number[],
    excludeDomain: string,
    topK: number
  ): Array<{ domain: string; similarity: number }> {
    const similarities: Array<{ domain: string; similarity: number }> = [];

    for (const [domain, data] of this.domainEmbeddings) {
      if (domain === excludeDomain) continue;

      const similarity = cosineSimilarity(embedding, data.embedding);
      if (similarity > this.similarityThreshold) {
        similarities.push({ domain, similarity });
      }
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK);
  }

  // ============================================
  // TEMPLATE MANAGEMENT
  // ============================================

  /**
   * Merge two similar templates
   */
  private mergeTemplates(existing: SkillTemplate, newTemplate: SkillTemplate): SkillTemplate {
    // Combine source skills
    existing.sourceSkillIds = [
      ...new Set([...existing.sourceSkillIds, ...newTemplate.sourceSkillIds]),
    ];

    // Combine successful domains
    existing.successfulDomains = [
      ...new Set([...existing.successfulDomains, ...newTemplate.successfulDomains]),
    ];

    // Update success rate (weighted average)
    const totalApplications = existing.successfulDomains.length + newTemplate.successfulDomains.length;
    existing.crossDomainSuccessRate =
      (existing.crossDomainSuccessRate * existing.successfulDomains.length +
        newTemplate.crossDomainSuccessRate * newTemplate.successfulDomains.length) /
      totalApplications;

    // Merge known selectors in action patterns
    for (let i = 0; i < existing.actionPatterns.length && i < newTemplate.actionPatterns.length; i++) {
      if (newTemplate.actionPatterns[i].knownSelectors) {
        existing.actionPatterns[i].knownSelectors = [
          ...new Set([
            ...(existing.actionPatterns[i].knownSelectors || []),
            ...newTemplate.actionPatterns[i].knownSelectors!,
          ]),
        ];
      }
    }

    existing.updatedAt = Date.now();

    logger.embedding.info('Merged skill templates', {
      templateId: existing.id,
      totalSources: existing.sourceSkillIds.length,
      totalDomains: existing.successfulDomains.length,
    });

    return existing;
  }

  /**
   * Record template application result
   */
  recordTemplateApplication(templateId: string, domain: string, success: boolean): void {
    const template = this.templates.get(templateId);
    if (!template) return;

    if (success) {
      if (!template.successfulDomains.includes(domain)) {
        template.successfulDomains.push(domain);
      }
      // Remove from failed if it was there
      template.failedDomains = template.failedDomains.filter((d) => d !== domain);
    } else {
      if (!template.failedDomains.includes(domain)) {
        template.failedDomains.push(domain);
      }
    }

    // Update cross-domain success rate
    const total = template.successfulDomains.length + template.failedDomains.length;
    template.crossDomainSuccessRate = template.successfulDomains.length / total;

    template.updatedAt = Date.now();
  }

  /**
   * Get all templates
   */
  getAllTemplates(): SkillTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalTemplates: number;
    totalDomains: number;
    avgCrossDomainSuccessRate: number;
    mostPortableTemplates: Array<{ name: string; domains: number }>;
  } {
    const templates = Array.from(this.templates.values());

    const avgSuccessRate =
      templates.length > 0
        ? templates.reduce((sum, t) => sum + t.crossDomainSuccessRate, 0) / templates.length
        : 0;

    const mostPortable = templates
      .sort((a, b) => b.successfulDomains.length - a.successfulDomains.length)
      .slice(0, 5)
      .map((t) => ({ name: t.name, domains: t.successfulDomains.length }));

    return {
      totalTemplates: templates.length,
      totalDomains: this.domainEmbeddings.size,
      avgCrossDomainSuccessRate: avgSuccessRate,
      mostPortableTemplates: mostPortable,
    };
  }

  /**
   * Export templates for persistence
   */
  exportTemplates(): string {
    return JSON.stringify(
      {
        templates: Array.from(this.templates.values()),
        domainEmbeddings: Array.from(this.domainEmbeddings.values()),
      },
      null,
      2
    );
  }

  /**
   * Import templates from persistence
   */
  importTemplates(json: string): number {
    try {
      const data = JSON.parse(json) as {
        templates?: SkillTemplate[];
        domainEmbeddings?: DomainEmbedding[];
      };

      let imported = 0;

      if (data.templates) {
        for (const template of data.templates) {
          this.templates.set(template.id, template);
          imported++;
        }
      }

      if (data.domainEmbeddings) {
        for (const embedding of data.domainEmbeddings) {
          this.domainEmbeddings.set(embedding.domain, embedding);
        }
      }

      logger.embedding.info('Imported skill templates', { count: imported });
      return imported;
    } catch (error) {
      logger.embedding.error('Failed to import templates', { error });
      return 0;
    }
  }
}

// Default singleton instance
export const skillGeneralizer = new SkillGeneralizer();
