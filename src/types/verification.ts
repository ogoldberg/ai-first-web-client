/**
 * Verification Types
 *
 * Types for the verification loops feature that automatically validates
 * browse results and learns which checks prevent failures.
 */

/**
 * Verification options for browse operations
 */
export interface VerifyOptions {
  enabled: boolean; // default: true for basic, false for advanced
  mode: 'basic' | 'standard' | 'thorough';
  checks?: VerificationCheck[];
  onFailure?: 'retry' | 'fallback' | 'report';
}

/**
 * Individual verification check
 */
export interface VerificationCheck {
  type: 'content' | 'action' | 'state' | 'custom';
  assertion: VerificationAssertion;
  severity: 'warning' | 'error' | 'critical';
  retryable: boolean;
}

/**
 * Verification assertion (what to check)
 */
export interface VerificationAssertion {
  // Content verification
  fieldExists?: string[];
  fieldNotEmpty?: string[];
  fieldMatches?: { [field: string]: string | RegExp };
  minLength?: number;
  maxLength?: number;

  // Action verification
  statusCode?: number;
  containsText?: string;
  excludesText?: string;

  // State verification
  checkUrl?: string; // Browse this URL to verify state
  checkSelector?: string; // Element exists
  checkApi?: string; // API endpoint to verify

  // Custom
  customValidator?: (result: any) => Promise<boolean>;
}

/**
 * Result of verification
 */
export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheckResult[];
  errors?: string[];
  warnings?: string[];
  confidence: number; // 0-1 overall confidence in result
}

/**
 * Result of individual check
 */
export interface VerificationCheckResult {
  type: string;
  passed: boolean;
  message: string;
  severity: 'warning' | 'error' | 'critical';
}

/**
 * Learned verification from ProceduralMemory
 */
export interface LearnedVerification {
  domain: string;
  check: VerificationCheck;
  learnedFrom: 'success' | 'failure' | 'manual';
  successCount: number;
  totalAttempts: number;
  confidence: number;
  lastUsed: number;
}
