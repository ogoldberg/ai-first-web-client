/**
 * Plan Preview Types
 *
 * Types for the plan preview feature that shows users what will happen
 * before executing a browse operation.
 */

import type { RenderTier } from './index.js';
import type { SmartBrowseOptions } from '../core/smart-browser.js';

/**
 * Request to preview a browse operation
 */
export interface BrowsePreviewRequest {
  url: string;
  options?: SmartBrowseOptions;
}

/**
 * Complete preview response showing execution plan
 */
export interface BrowsePreviewResponse {
  schemaVersion: string;
  plan: ExecutionPlan;
  estimatedTime: TimeEstimate;
  confidence: ConfidenceLevel;
  alternativePlans?: ExecutionPlan[];
}

/**
 * Execution plan showing what will happen
 */
export interface ExecutionPlan {
  steps: ExecutionStep[];
  tier: RenderTier;
  reasoning: string;
  fallbackPlan?: ExecutionPlan;
}

/**
 * Individual step in execution plan
 */
export interface ExecutionStep {
  order: number;
  action: string;
  description: string;
  tier: RenderTier;
  expectedDuration: number; // milliseconds
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
}

/**
 * Time estimate for operation
 */
export interface TimeEstimate {
  min: number; // milliseconds
  max: number;
  expected: number;
  breakdown: {
    [tier: string]: number;
  };
}

/**
 * Confidence assessment
 */
export interface ConfidenceLevel {
  overall: 'high' | 'medium' | 'low';
  factors: ConfidenceFactors;
}

/**
 * Factors contributing to confidence
 */
export interface ConfidenceFactors {
  hasLearnedPatterns: boolean;
  domainFamiliarity: 'high' | 'medium' | 'low' | 'none';
  apiDiscovered: boolean;
  requiresAuth: boolean;
  botDetectionLikely: boolean;
  skillsAvailable: boolean;
  patternCount: number;
  patternSuccessRate: number;
}

/**
 * Internal analysis result used to build plan
 */
export interface PreviewAnalysis {
  domain: string;
  hasPatterns: boolean;
  patterns: Array<{
    type: string;
    confidence: number;
    successCount: number;
    totalAttempts: number;
  }>;
  hasSkills: boolean;
  skills: Array<{
    name: string;
    similarity: number;
  }>;
  domainGroup?: string;
  hasSession: boolean;
  hasFailureHistory: boolean;
  failureRate: number;
  recommendedTier: RenderTier;
  needsFullBrowser: boolean;
}
