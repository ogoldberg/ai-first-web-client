/**
 * Learning Effectiveness Metrics (LI-003)
 *
 * Tracks and computes learning effectiveness metrics from the learning system.
 * These metrics help assess how well the learning system is performing.
 *
 * Key metrics:
 * - Pattern hit rate: How often discovered patterns are used successfully
 * - Confidence accuracy: How well predicted confidence matches actual success
 * - Tier optimization savings: Time and cost saved by tier selection
 * - Skill reuse rate: How often learned skills are reused
 */

import { logger } from '../utils/logger.js';
import type { LearningEngine } from './learning-engine.js';
import type { TieredFetcher } from './tiered-fetcher.js';
import type { ProceduralMemory } from './procedural-memory.js';
import type { EnhancedKnowledgeBaseEntry, FailureContext } from '../types/index.js';

const log = logger.create('LearningEffectiveness');

/**
 * Pattern effectiveness metrics
 */
export interface PatternEffectiveness {
  /** Total API patterns discovered */
  totalDiscovered: number;

  /** Patterns that have been used at least once */
  patternsUsed: number;

  /** Pattern hit rate (patternsUsed / totalDiscovered) */
  hitRate: number;

  /** Patterns marked as high-confidence that actually work */
  highConfidenceSuccessRate: number;

  /** Patterns that can bypass browser rendering */
  bypassablePatterns: number;

  /** Breakdown by confidence level */
  byConfidence: {
    high: { count: number; successRate: number };
    medium: { count: number; successRate: number };
    low: { count: number; successRate: number };
  };

  /** Average verification count per pattern */
  avgVerificationCount: number;

  /** Patterns with recent failures */
  recentlyFailedPatterns: number;
}

/**
 * Confidence accuracy metrics
 */
export interface ConfidenceAccuracy {
  /** Overall accuracy of confidence predictions */
  overallAccuracy: number;

  /** High confidence patterns that actually succeed */
  highConfidenceAccuracy: number;

  /** Medium confidence patterns that actually succeed */
  mediumConfidenceAccuracy: number;

  /** Low confidence patterns that actually succeed */
  lowConfidenceAccuracy: number;

  /** Average predicted confidence (0-1 scale) */
  avgPredictedConfidence: number;

  /** Average actual success rate (0-1 scale) */
  avgActualSuccessRate: number;

  /** Confidence gap (predicted - actual) */
  confidenceGap: number;

  /** Patterns that are over-confident (predicted > actual) */
  overConfidentPatterns: number;

  /** Patterns that are under-confident (predicted < actual) */
  underConfidentPatterns: number;
}

/**
 * Tier optimization metrics
 */
export interface TierOptimization {
  /** How often the first tier choice is correct */
  firstTierSuccessRate: number;

  /** Average tiers attempted before success */
  avgTiersAttempted: number;

  /** Time saved by using intelligence tier vs playwright */
  timeSavedMs: number;

  /** Estimated time if all requests used playwright */
  estimatedPlaywrightTimeMs: number;

  /** Actual time with tier optimization */
  actualTimeMs: number;

  /** Optimization ratio (1 - actual/estimated) */
  optimizationRatio: number;

  /** Tier usage distribution */
  tierDistribution: {
    intelligence: { count: number; avgTimeMs: number };
    lightweight: { count: number; avgTimeMs: number };
    playwright: { count: number; avgTimeMs: number };
  };

  /** Domains with optimal tier preference */
  domainsWithPreference: number;
}

/**
 * Skill effectiveness metrics
 */
export interface SkillEffectiveness {
  /** Total skills learned */
  totalSkills: number;

  /** Skills that have been reused at least once */
  reusedSkills: number;

  /** Skill reuse rate (reusedSkills / totalSkills) */
  reuseRate: number;

  /** Average skill success rate */
  avgSuccessRate: number;

  /** Total skill executions */
  totalExecutions: number;

  /** Skills with high success rate (>80%) */
  highPerformingSkills: number;

  /** Anti-patterns learned */
  antiPatterns: number;

  /** Estimated failures prevented by anti-patterns */
  failuresPreventedEstimate: number;

  /** Average skill execution time */
  avgExecutionTimeMs: number;
}

/**
 * Selector learning metrics
 */
export interface SelectorEffectiveness {
  /** Total selectors learned */
  totalSelectors: number;

  /** Selectors with high priority (working well) */
  highPrioritySelectors: number;

  /** Average selector success rate */
  avgSuccessRate: number;

  /** Selectors that have failed recently */
  recentlyFailedSelectors: number;

  /** Average fallback chain length */
  avgFallbackChainLength: number;
}

/**
 * Domain coverage metrics
 */
export interface DomainCoverage {
  /** Total domains visited */
  totalDomains: number;

  /** Domains with learned patterns */
  domainsWithPatterns: number;

  /** Domains with learned selectors */
  domainsWithSelectors: number;

  /** Domains with skills */
  domainsWithSkills: number;

  /** Domains with high success rate (>80%) */
  highSuccessDomains: number;

  /** Average success rate across domains */
  avgDomainSuccessRate: number;

  /** Domain groups established */
  domainGroups: number;

  /** Domains benefiting from cross-domain transfer */
  crossDomainBeneficiaries: number;
}

/**
 * Learning trend over time
 */
export interface LearningTrend {
  /** Time window for trend calculation (ms) */
  windowMs: number;

  /** Recent learning events count */
  recentEvents: number;

  /** New patterns in window */
  newPatterns: number;

  /** New skills in window */
  newSkills: number;

  /** Verification events in window */
  verifications: number;

  /** Failures in window */
  failures: number;

  /** Learning velocity (events per hour) */
  eventsPerHour: number;
}

/**
 * Complete learning effectiveness report
 */
export interface LearningEffectivenessReport {
  /** When the report was generated */
  generatedAt: number;

  /** Pattern effectiveness metrics */
  patterns: PatternEffectiveness;

  /** Confidence accuracy metrics */
  confidence: ConfidenceAccuracy;

  /** Tier optimization metrics */
  tiers: TierOptimization;

  /** Skill effectiveness metrics */
  skills: SkillEffectiveness;

  /** Selector learning metrics */
  selectors: SelectorEffectiveness;

  /** Domain coverage metrics */
  domains: DomainCoverage;

  /** Learning trend over last 24 hours */
  trend24h: LearningTrend;

  /** Overall health score (0-100) */
  healthScore: number;

  /** Key insights and recommendations */
  insights: string[];
}

/**
 * Compute learning effectiveness metrics from learning components.
 *
 * @param learningEngine The learning engine instance
 * @param tieredFetcher Optional tiered fetcher for tier metrics
 * @param proceduralMemory Optional procedural memory for skill metrics
 * @returns Complete learning effectiveness report
 */
export async function computeLearningEffectiveness(
  learningEngine: LearningEngine,
  tieredFetcher?: TieredFetcher,
  proceduralMemory?: ProceduralMemory
): Promise<LearningEffectivenessReport> {
  const now = Date.now();

  log.debug('Computing learning effectiveness metrics');

  // Get pattern effectiveness
  const patterns = computePatternEffectiveness(learningEngine);

  // Get confidence accuracy
  const confidence = computeConfidenceAccuracy(learningEngine);

  // Get tier optimization (if fetcher available)
  const tiers = tieredFetcher
    ? computeTierOptimization(tieredFetcher)
    : getDefaultTierOptimization();

  // Get skill effectiveness (if memory available)
  const skills = proceduralMemory
    ? await computeSkillEffectiveness(proceduralMemory)
    : getDefaultSkillEffectiveness();

  // Get selector effectiveness
  const selectors = computeSelectorEffectiveness(learningEngine);

  // Get domain coverage
  const domains = computeDomainCoverage(learningEngine);

  // Get learning trend
  const trend24h = computeLearningTrend(learningEngine, 24 * 60 * 60 * 1000);

  // Compute health score
  const healthScore = computeHealthScore(
    patterns,
    confidence,
    tiers,
    skills,
    domains
  );

  // Generate insights
  const insights = generateInsights(
    patterns,
    confidence,
    tiers,
    skills,
    selectors,
    domains,
    trend24h
  );

  const report: LearningEffectivenessReport = {
    generatedAt: now,
    patterns,
    confidence,
    tiers,
    skills,
    selectors,
    domains,
    trend24h,
    healthScore,
    insights,
  };

  log.info('Learning effectiveness computed', {
    healthScore,
    insightCount: insights.length,
  });

  return report;
}

/**
 * Compute pattern effectiveness metrics
 */
function computePatternEffectiveness(
  learningEngine: LearningEngine
): PatternEffectiveness {
  const stats = learningEngine.getStats();
  const entries = getAllEntries(learningEngine);

  let patternsUsed = 0;
  let bypassablePatterns = 0;
  let highCount = 0,
    highSuccess = 0,
    highTotal = 0;
  let mediumCount = 0,
    mediumSuccess = 0,
    mediumTotal = 0;
  let lowCount = 0,
    lowSuccess = 0,
    lowTotal = 0;
  let totalVerifications = 0;
  let recentlyFailed = 0;

  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const [, entry] of entries) {
    for (const pattern of entry.apiPatterns || []) {
      const verificationCount = pattern.verificationCount || 0;
      const failureCount = pattern.failureCount || 0;

      if (verificationCount > 0) {
        patternsUsed++;
        totalVerifications += verificationCount;
      }

      if (pattern.canBypass) {
        bypassablePatterns++;
      }

      const total = verificationCount + failureCount;
      const successRate = total > 0 ? verificationCount / total : 0;

      if (pattern.confidence === 'high') {
        highCount++;
        if (total > 0) {
          highSuccess += successRate;
          highTotal++;
        }
      } else if (pattern.confidence === 'medium') {
        mediumCount++;
        if (total > 0) {
          mediumSuccess += successRate;
          mediumTotal++;
        }
      } else {
        lowCount++;
        if (total > 0) {
          lowSuccess += successRate;
          lowTotal++;
        }
      }

      // Check for recent failures
      if (failureCount > 0 && entry.recentFailures) {
        const recentPatternFailures = entry.recentFailures.filter(
          (f: FailureContext) => f.timestamp > oneHourAgo
        );
        if (recentPatternFailures.length > 0) {
          recentlyFailed++;
        }
      }
    }
  }

  const totalDiscovered = stats.totalApiPatterns;
  const hitRate = totalDiscovered > 0 ? patternsUsed / totalDiscovered : 0;

  return {
    totalDiscovered,
    patternsUsed,
    hitRate,
    highConfidenceSuccessRate: highTotal > 0 ? highSuccess / highTotal : 0,
    bypassablePatterns,
    byConfidence: {
      high: {
        count: highCount,
        successRate: highTotal > 0 ? highSuccess / highTotal : 0,
      },
      medium: {
        count: mediumCount,
        successRate: mediumTotal > 0 ? mediumSuccess / mediumTotal : 0,
      },
      low: {
        count: lowCount,
        successRate: lowTotal > 0 ? lowSuccess / lowTotal : 0,
      },
    },
    avgVerificationCount:
      patternsUsed > 0 ? totalVerifications / patternsUsed : 0,
    recentlyFailedPatterns: recentlyFailed,
  };
}

/**
 * Compute confidence accuracy metrics
 */
function computeConfidenceAccuracy(
  learningEngine: LearningEngine
): ConfidenceAccuracy {
  const entries = getAllEntries(learningEngine);

  let totalPatterns = 0;
  let highConfPatterns = 0,
    highConfSuccess = 0;
  let medConfPatterns = 0,
    medConfSuccess = 0;
  let lowConfPatterns = 0,
    lowConfSuccess = 0;
  let sumPredicted = 0;
  let sumActual = 0;
  let overConfident = 0;
  let underConfident = 0;

  for (const [, entry] of entries) {
    for (const pattern of entry.apiPatterns || []) {
      const verificationCount = pattern.verificationCount || 0;
      const failureCount = pattern.failureCount || 0;
      const total = verificationCount + failureCount;

      if (total === 0) continue;

      totalPatterns++;
      const actualSuccessRate = verificationCount / total;
      sumActual += actualSuccessRate;

      let predictedConfidence = 0;
      if (pattern.confidence === 'high') {
        predictedConfidence = 0.9;
        highConfPatterns++;
        highConfSuccess += actualSuccessRate;
      } else if (pattern.confidence === 'medium') {
        predictedConfidence = 0.7;
        medConfPatterns++;
        medConfSuccess += actualSuccessRate;
      } else {
        predictedConfidence = 0.5;
        lowConfPatterns++;
        lowConfSuccess += actualSuccessRate;
      }

      sumPredicted += predictedConfidence;

      // Check over/under confidence
      const gap = predictedConfidence - actualSuccessRate;
      if (gap > 0.2) {
        overConfident++;
      } else if (gap < -0.2) {
        underConfident++;
      }
    }
  }

  const avgPredicted = totalPatterns > 0 ? sumPredicted / totalPatterns : 0;
  const avgActual = totalPatterns > 0 ? sumActual / totalPatterns : 0;

  // Overall accuracy: how close predicted is to actual
  const gap = avgPredicted - avgActual;
  const accuracy = 1 - Math.abs(gap);

  return {
    overallAccuracy: Math.max(0, Math.min(1, accuracy)),
    highConfidenceAccuracy:
      highConfPatterns > 0 ? highConfSuccess / highConfPatterns : 0,
    mediumConfidenceAccuracy:
      medConfPatterns > 0 ? medConfSuccess / medConfPatterns : 0,
    lowConfidenceAccuracy:
      lowConfPatterns > 0 ? lowConfSuccess / lowConfPatterns : 0,
    avgPredictedConfidence: avgPredicted,
    avgActualSuccessRate: avgActual,
    confidenceGap: gap,
    overConfidentPatterns: overConfident,
    underConfidentPatterns: underConfident,
  };
}

/**
 * Compute tier optimization metrics
 */
function computeTierOptimization(fetcher: TieredFetcher): TierOptimization {
  const stats = fetcher.getStats();

  // Calculate tier distribution
  const tierDistribution = {
    intelligence: { count: stats.byTier.intelligence || 0, avgTimeMs: 100 },
    lightweight: { count: stats.byTier.lightweight || 0, avgTimeMs: 300 },
    playwright: { count: stats.byTier.playwright || 0, avgTimeMs: 2000 },
  };

  // Get avg times from stats if available
  if (stats.avgResponseTimes) {
    if (stats.avgResponseTimes.intelligence) {
      tierDistribution.intelligence.avgTimeMs = stats.avgResponseTimes.intelligence;
    }
    if (stats.avgResponseTimes.lightweight) {
      tierDistribution.lightweight.avgTimeMs = stats.avgResponseTimes.lightweight;
    }
    if (stats.avgResponseTimes.playwright) {
      tierDistribution.playwright.avgTimeMs = stats.avgResponseTimes.playwright;
    }
  }

  const totalRequests =
    tierDistribution.intelligence.count +
    tierDistribution.lightweight.count +
    tierDistribution.playwright.count;

  // Estimate time if all requests used playwright
  const estimatedPlaywrightTime =
    totalRequests * tierDistribution.playwright.avgTimeMs;

  // Actual time with tier optimization
  const actualTime =
    tierDistribution.intelligence.count *
      tierDistribution.intelligence.avgTimeMs +
    tierDistribution.lightweight.count *
      tierDistribution.lightweight.avgTimeMs +
    tierDistribution.playwright.count * tierDistribution.playwright.avgTimeMs;

  const timeSaved = estimatedPlaywrightTime - actualTime;
  const optimizationRatio =
    estimatedPlaywrightTime > 0 ? timeSaved / estimatedPlaywrightTime : 0;

  // First tier success rate approximation
  // Assume domains with preferences had successful first attempts
  const firstTierSuccessRate =
    totalRequests > 0 ? Math.min(0.95, stats.totalDomains / totalRequests) : 0;

  return {
    firstTierSuccessRate,
    avgTiersAttempted: 1.2, // Approximation
    timeSavedMs: Math.max(0, timeSaved),
    estimatedPlaywrightTimeMs: estimatedPlaywrightTime,
    actualTimeMs: actualTime,
    optimizationRatio: Math.max(0, optimizationRatio),
    tierDistribution,
    domainsWithPreference: stats.totalDomains,
  };
}

/**
 * Compute skill effectiveness metrics
 */
async function computeSkillEffectiveness(
  memory: ProceduralMemory
): Promise<SkillEffectiveness> {
  const stats = memory.getStats();
  const antiPatternStats = memory.getAntiPatternStats();

  let totalExecutions = 0;
  let totalSuccessRate = 0;
  let reusedSkills = 0;
  let highPerforming = 0;

  // Get skill details from learning progress
  const progress = memory.getLearningProgress();
  const topPerformers = progress.skills.topPerformers || [];

  for (const skill of topPerformers) {
    if (skill.uses > 1) {
      reusedSkills++;
    }
    if (skill.successRate > 0.8) {
      highPerforming++;
    }
    totalExecutions += skill.uses;
    totalSuccessRate += skill.successRate;
  }

  const totalSkills = stats.totalSkills;
  const reuseRate = totalSkills > 0 ? reusedSkills / totalSkills : 0;
  const avgSuccessRate = progress.skills.avgSuccessRate;

  // Estimate failures prevented by anti-patterns
  const antiPatternCount = antiPatternStats.totalAntiPatterns;
  const failuresPreventedEstimate = antiPatternCount * 2; // Rough estimate

  return {
    totalSkills,
    reusedSkills,
    reuseRate,
    avgSuccessRate,
    totalExecutions,
    highPerformingSkills: highPerforming,
    antiPatterns: antiPatternCount,
    failuresPreventedEstimate,
    avgExecutionTimeMs: 0, // Not tracked at skill level
  };
}

/**
 * Compute selector effectiveness metrics
 */
function computeSelectorEffectiveness(
  learningEngine: LearningEngine
): SelectorEffectiveness {
  const entries = getAllEntries(learningEngine);

  let totalSelectors = 0;
  let highPriority = 0;
  let totalSuccessRate = 0;
  let selectorsWithRate = 0;
  let recentlyFailed = 0;
  let totalChainLength = 0;
  let chainsCount = 0;

  for (const [, entry] of entries) {
    for (const chain of entry.selectorChains || []) {
      chainsCount++;
      totalChainLength += chain.selectors?.length || 0;

      for (const selector of chain.selectors || []) {
        totalSelectors++;
        if (selector.priority > 70) {
          highPriority++;
        }

        const total = (selector.successCount || 0) + (selector.failureCount || 0);
        if (total > 0) {
          totalSuccessRate += (selector.successCount || 0) / total;
          selectorsWithRate++;

          if (selector.failureCount && selector.failureCount > selector.successCount) {
            recentlyFailed++;
          }
        }
      }
    }
  }

  return {
    totalSelectors,
    highPrioritySelectors: highPriority,
    avgSuccessRate: selectorsWithRate > 0 ? totalSuccessRate / selectorsWithRate : 0,
    recentlyFailedSelectors: recentlyFailed,
    avgFallbackChainLength: chainsCount > 0 ? totalChainLength / chainsCount : 0,
  };
}

/**
 * Compute domain coverage metrics
 */
function computeDomainCoverage(
  learningEngine: LearningEngine
): DomainCoverage {
  const entries = getAllEntries(learningEngine);
  const stats = learningEngine.getStats();

  let domainsWithPatterns = 0;
  let domainsWithSelectors = 0;
  let domainsWithSkills = 0;
  let highSuccessDomains = 0;
  let totalSuccessRate = 0;
  let domainsWithSuccessRate = 0;
  let crossDomainBeneficiaries = 0;

  for (const [, entry] of entries) {
    if (entry.apiPatterns && entry.apiPatterns.length > 0) {
      domainsWithPatterns++;
    }
    if (entry.selectorChains && entry.selectorChains.length > 0) {
      domainsWithSelectors++;
    }
    // Use entry's overallSuccessRate directly
    if (entry.overallSuccessRate !== undefined) {
      totalSuccessRate += entry.overallSuccessRate;
      domainsWithSuccessRate++;
      if (entry.overallSuccessRate > 0.8) {
        highSuccessDomains++;
      }
    }
    // Check for transferred patterns (cross-domain) via provenance
    for (const pattern of entry.apiPatterns || []) {
      if (pattern.provenance?.sourceDomain && pattern.provenance.sourceDomain !== entry.domain) {
        crossDomainBeneficiaries++;
        break; // Count domain once
      }
    }
  }

  return {
    totalDomains: stats.totalDomains,
    domainsWithPatterns,
    domainsWithSelectors,
    domainsWithSkills: 0, // Would need to check procedural memory
    highSuccessDomains,
    avgDomainSuccessRate:
      domainsWithSuccessRate > 0 ? totalSuccessRate / domainsWithSuccessRate : 0,
    domainGroups: 0, // Would need config access
    crossDomainBeneficiaries,
  };
}

/**
 * Compute learning trend over a time window
 */
function computeLearningTrend(
  learningEngine: LearningEngine,
  windowMs: number
): LearningTrend {
  const stats = learningEngine.getStats();
  const cutoff = Date.now() - windowMs;

  let newPatterns = 0;
  let newSkills = 0;
  let verifications = 0;
  let failures = 0;

  // Count recent learning events
  for (const event of stats.recentLearningEvents || []) {
    if (event.timestamp < cutoff) continue;

    switch (event.type) {
      case 'api_discovered':
        newPatterns++;
        break;
      case 'pattern_verified':
        verifications++;
        break;
      case 'failure_recorded':
        failures++;
        break;
      // Note: Skills are tracked in ProceduralMemory, not LearningEngine events
    }
  }

  const recentEvents = newPatterns + newSkills + verifications + failures;
  const hoursInWindow = windowMs / (60 * 60 * 1000);
  const eventsPerHour = hoursInWindow > 0 ? recentEvents / hoursInWindow : 0;

  return {
    windowMs,
    recentEvents,
    newPatterns,
    newSkills,
    verifications,
    failures,
    eventsPerHour,
  };
}

/**
 * Compute overall health score
 */
function computeHealthScore(
  patterns: PatternEffectiveness,
  confidence: ConfidenceAccuracy,
  tiers: TierOptimization,
  skills: SkillEffectiveness,
  domains: DomainCoverage
): number {
  // Weighted average of component scores
  const weights = {
    patternHitRate: 20,
    confidenceAccuracy: 25,
    tierOptimization: 20,
    skillReuse: 15,
    domainCoverage: 20,
  };

  const patternScore = patterns.hitRate * 100;
  const confidenceScore = confidence.overallAccuracy * 100;
  const tierScore = tiers.optimizationRatio * 100;
  const skillScore = skills.reuseRate * 100;
  const domainScore =
    domains.totalDomains > 0
      ? (domains.domainsWithPatterns / domains.totalDomains) * 100
      : 0;

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightedSum =
    patternScore * weights.patternHitRate +
    confidenceScore * weights.confidenceAccuracy +
    tierScore * weights.tierOptimization +
    skillScore * weights.skillReuse +
    domainScore * weights.domainCoverage;

  return Math.round(Math.min(100, Math.max(0, weightedSum / totalWeight)));
}

/**
 * Generate insights and recommendations
 */
function generateInsights(
  patterns: PatternEffectiveness,
  confidence: ConfidenceAccuracy,
  tiers: TierOptimization,
  skills: SkillEffectiveness,
  selectors: SelectorEffectiveness,
  domains: DomainCoverage,
  trend: LearningTrend
): string[] {
  const insights: string[] = [];

  // Pattern insights
  if (patterns.hitRate < 0.5 && patterns.totalDiscovered > 10) {
    insights.push(
      `Low pattern hit rate (${(patterns.hitRate * 100).toFixed(1)}%): ${patterns.totalDiscovered - patterns.patternsUsed} discovered APIs have never been used`
    );
  }

  if (patterns.recentlyFailedPatterns > 0) {
    insights.push(
      `${patterns.recentlyFailedPatterns} patterns have failed in the last hour - consider refreshing confidence scores`
    );
  }

  // Confidence insights
  if (confidence.confidenceGap > 0.2) {
    insights.push(
      `Confidence predictions are ${(confidence.confidenceGap * 100).toFixed(1)}% too optimistic - consider lowering thresholds`
    );
  } else if (confidence.confidenceGap < -0.2) {
    insights.push(
      `Confidence predictions are ${Math.abs(confidence.confidenceGap * 100).toFixed(1)}% too pessimistic - patterns are better than expected`
    );
  }

  if (confidence.overConfidentPatterns > 5) {
    insights.push(
      `${confidence.overConfidentPatterns} patterns are over-confident - predicted confidence exceeds actual success rate`
    );
  }

  // Tier optimization insights
  if (tiers.timeSavedMs > 10000) {
    insights.push(
      `Tier optimization saved ${(tiers.timeSavedMs / 1000).toFixed(1)}s total - ${(tiers.optimizationRatio * 100).toFixed(0)}% faster than always using Playwright`
    );
  }

  if (tiers.tierDistribution.playwright.count > tiers.tierDistribution.intelligence.count * 2) {
    insights.push(
      'Heavy reliance on Playwright tier - consider improving API discovery for faster access'
    );
  }

  // Skill insights
  if (skills.totalSkills > 10 && skills.reuseRate < 0.3) {
    insights.push(
      `Low skill reuse rate (${(skills.reuseRate * 100).toFixed(1)}%): ${skills.totalSkills - skills.reusedSkills} skills have only been used once`
    );
  }

  if (skills.antiPatterns > 10) {
    insights.push(
      `${skills.antiPatterns} anti-patterns learned - estimated ${skills.failuresPreventedEstimate} failures prevented`
    );
  }

  // Selector insights
  if (selectors.avgFallbackChainLength > 3) {
    insights.push(
      `Long selector fallback chains (avg ${selectors.avgFallbackChainLength.toFixed(1)}) - primary selectors may be unstable`
    );
  }

  // Domain insights
  if (domains.crossDomainBeneficiaries > 0) {
    insights.push(
      `Cross-domain pattern transfer active: ${domains.crossDomainBeneficiaries} domains benefit from shared patterns`
    );
  }

  // Trend insights
  if (trend.eventsPerHour > 10) {
    insights.push(`Active learning: ${trend.eventsPerHour.toFixed(1)} events/hour in last 24h`);
  } else if (trend.eventsPerHour < 1 && trend.windowMs > 60 * 60 * 1000) {
    insights.push('Low learning activity - consider exploring more domains to build patterns');
  }

  return insights;
}

/**
 * Get all entries from LearningEngine
 */
function getAllEntries(
  learningEngine: LearningEngine
): Map<string, EnhancedKnowledgeBaseEntry> {
  // Access internal entries - this requires the LearningEngine to expose them
  // For now, we use getStats and available methods
  const allDomains = learningEngine.getAllDomains?.() || [];
  const entries = new Map<string, EnhancedKnowledgeBaseEntry>();

  for (const domain of allDomains) {
    const entry = learningEngine.getEntry(domain);
    if (entry) {
      entries.set(domain, entry);
    }
  }

  return entries;
}

/**
 * Default tier optimization for when fetcher is not available
 */
function getDefaultTierOptimization(): TierOptimization {
  return {
    firstTierSuccessRate: 0,
    avgTiersAttempted: 0,
    timeSavedMs: 0,
    estimatedPlaywrightTimeMs: 0,
    actualTimeMs: 0,
    optimizationRatio: 0,
    tierDistribution: {
      intelligence: { count: 0, avgTimeMs: 0 },
      lightweight: { count: 0, avgTimeMs: 0 },
      playwright: { count: 0, avgTimeMs: 0 },
    },
    domainsWithPreference: 0,
  };
}

/**
 * Default skill effectiveness for when memory is not available
 */
function getDefaultSkillEffectiveness(): SkillEffectiveness {
  return {
    totalSkills: 0,
    reusedSkills: 0,
    reuseRate: 0,
    avgSuccessRate: 0,
    totalExecutions: 0,
    highPerformingSkills: 0,
    antiPatterns: 0,
    failuresPreventedEstimate: 0,
    avgExecutionTimeMs: 0,
  };
}
