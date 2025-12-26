/**
 * Workflow Optimizer (GAP-004)
 *
 * Analyzes multi-step workflows to find optimization opportunities:
 * 1. Detects when later steps contain API endpoints that can replace earlier steps
 * 2. Identifies data sufficiency - when API response has all needed data
 * 3. Suggests shortcut paths that bypass browser rendering
 * 4. Tracks optimization metrics for A/B testing
 *
 * Example: 4-step form wizard -> single API call to final endpoint
 * Result: 10-100x speedup by eliminating browser renders
 */

import { logger } from '../utils/logger.js';
import type { NetworkRequest } from '../types/index.js';
import type { Workflow, WorkflowStep } from '../types/workflow.js';

const optimizerLogger = logger.create('WorkflowOptimizer');

// ============================================
// TYPES
// ============================================

/**
 * Detected optimization opportunity in a workflow
 */
export interface WorkflowOptimization {
  /** Unique ID for this optimization */
  id: string;
  /** Workflow this optimization applies to */
  workflowId: string;
  /** Type of optimization detected */
  type: 'api_shortcut' | 'data_sufficiency' | 'step_merge';
  /** Original steps that can be bypassed */
  bypassedSteps: number[];
  /** The step containing the shortcut (API endpoint) */
  shortcutStep: number;
  /** The API endpoint that provides the shortcut */
  shortcutEndpoint: ShortcutEndpoint;
  /** Estimated speedup factor (e.g., 10x, 50x) */
  estimatedSpeedupFactor: number;
  /** Confidence in this optimization (0-1) */
  confidence: number;
  /** Data fields available via the shortcut */
  dataFieldsCovered: string[];
  /** Parameters needed to call the shortcut directly */
  requiredParameters: string[];
  /** Metrics tracking optimization success */
  metrics: OptimizationMetrics;
  /** When this optimization was discovered */
  discoveredAt: number;
  /** Whether this optimization is promoted for use */
  isPromoted: boolean;
}

/**
 * API endpoint that provides a workflow shortcut
 */
export interface ShortcutEndpoint {
  url: string;
  method: string;
  contentType: string;
  /** Parameter placeholders in the URL (e.g., {id}, {page}) */
  urlParameters: string[];
  /** Query parameters */
  queryParameters: Record<string, string>;
  /** Required headers */
  headers: Record<string, string>;
  /** Response structure info */
  responseStructure?: {
    dataPath?: string; // JSON path to main data
    fields: string[];  // Available fields
  };
}

/**
 * Metrics for tracking optimization effectiveness
 */
export interface OptimizationMetrics {
  /** Times the optimized path was used */
  timesUsed: number;
  /** Times it succeeded */
  successCount: number;
  /** Times it failed */
  failureCount: number;
  /** Average duration using optimized path (ms) */
  avgOptimizedDuration: number;
  /** Average duration using original path (ms) */
  avgOriginalDuration: number;
  /** Last time metrics were updated */
  lastUpdated: number;
}

/**
 * Result of workflow analysis
 */
export interface WorkflowAnalysisResult {
  workflowId: string;
  workflowName: string;
  totalSteps: number;
  totalDuration: number;
  optimizations: WorkflowOptimization[];
  analysisTimestamp: number;
}

/**
 * Captured network data for a workflow step
 */
export interface StepNetworkData {
  stepNumber: number;
  stepUrl: string;
  requests: NetworkRequest[];
  apiRequests: NetworkRequest[]; // Filtered to API-like requests
  duration: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Minimum confidence to suggest an optimization */
const MIN_OPTIMIZATION_CONFIDENCE = 0.6;

/** Success rate threshold to auto-promote optimization */
const AUTO_PROMOTE_SUCCESS_RATE = 0.9;

/** Minimum number of uses before auto-promotion */
const MIN_USES_FOR_PROMOTION = 5;

/** API content types that indicate JSON APIs */
const API_CONTENT_TYPES = [
  'application/json',
  'application/graphql+json',
  'application/ld+json',
  'text/json',
];

/** HTTP methods that typically indicate data fetching */
const DATA_FETCH_METHODS = ['GET', 'POST'];

/** Status codes indicating successful API response */
const SUCCESS_STATUS_CODES = [200, 201];

// ============================================
// MAIN CLASS
// ============================================

export class WorkflowOptimizer {
  private optimizations: Map<string, WorkflowOptimization> = new Map();
  private optimizationsByWorkflow: Map<string, string[]> = new Map();

  /**
   * Analyze a workflow to find optimization opportunities
   */
  async analyzeWorkflow(
    workflow: Workflow,
    stepNetworkData: StepNetworkData[]
  ): Promise<WorkflowAnalysisResult> {
    optimizerLogger.info('Analyzing workflow for optimizations', {
      workflowId: workflow.id,
      workflowName: workflow.name,
      stepCount: workflow.steps.length,
    });

    const optimizations: WorkflowOptimization[] = [];
    const totalDuration = stepNetworkData.reduce((sum, step) => sum + step.duration, 0);

    // Strategy 1: Find API shortcuts in later steps
    const apiShortcuts = this.findApiShortcuts(workflow, stepNetworkData);
    optimizations.push(...apiShortcuts);

    // Strategy 2: Find data sufficiency patterns
    const dataSufficiencyOpts = this.findDataSufficiency(workflow, stepNetworkData);
    optimizations.push(...dataSufficiencyOpts);

    // Store optimizations
    for (const opt of optimizations) {
      this.optimizations.set(opt.id, opt);
      const workflowOpts = this.optimizationsByWorkflow.get(workflow.id) || [];
      workflowOpts.push(opt.id);
      this.optimizationsByWorkflow.set(workflow.id, workflowOpts);
    }

    optimizerLogger.info('Workflow analysis complete', {
      workflowId: workflow.id,
      optimizationsFound: optimizations.length,
      types: optimizations.map(o => o.type),
    });

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      totalSteps: workflow.steps.length,
      totalDuration,
      optimizations,
      analysisTimestamp: Date.now(),
    };
  }

  /**
   * Find API shortcuts - later steps that have API endpoints containing all needed data
   */
  private findApiShortcuts(
    workflow: Workflow,
    stepNetworkData: StepNetworkData[]
  ): WorkflowOptimization[] {
    const optimizations: WorkflowOptimization[] = [];

    // Analyze each step starting from the end
    for (let i = stepNetworkData.length - 1; i > 0; i--) {
      const currentStep = stepNetworkData[i];
      const apiRequests = this.filterApiRequests(currentStep.requests);

      for (const apiRequest of apiRequests) {
        // Check if this API contains data that could replace earlier steps
        const analysis = this.analyzeApiForShortcut(
          apiRequest,
          workflow,
          stepNetworkData,
          i
        );

        if (analysis && analysis.confidence >= MIN_OPTIMIZATION_CONFIDENCE) {
          const bypassedDuration = stepNetworkData
            .slice(0, i)
            .reduce((sum, step) => sum + step.duration, 0);

          optimizations.push({
            id: this.generateOptimizationId(),
            workflowId: workflow.id,
            type: 'api_shortcut',
            bypassedSteps: Array.from({ length: i }, (_, idx) => idx + 1),
            shortcutStep: i + 1,
            shortcutEndpoint: this.extractEndpointInfo(apiRequest),
            estimatedSpeedupFactor: this.calculateSpeedup(bypassedDuration, apiRequest.duration || 200),
            confidence: analysis.confidence,
            dataFieldsCovered: analysis.fieldsCovered,
            requiredParameters: analysis.requiredParams,
            metrics: this.createEmptyMetrics(),
            discoveredAt: Date.now(),
            isPromoted: false,
          });
        }
      }
    }

    return optimizations;
  }

  /**
   * Find data sufficiency patterns - where one step's extracted data
   * contains all fields from earlier steps
   */
  private findDataSufficiency(
    workflow: Workflow,
    stepNetworkData: StepNetworkData[]
  ): WorkflowOptimization[] {
    const optimizations: WorkflowOptimization[] = [];

    // Get extracted data fields from each step
    const stepFields: Map<number, Set<string>> = new Map();
    for (const step of workflow.steps) {
      if (step.extractedData) {
        const fields = this.extractFieldNames(step.extractedData);
        stepFields.set(step.stepNumber, fields);
      }
    }

    // Check if later steps contain data from earlier steps
    for (let i = workflow.steps.length - 1; i > 0; i--) {
      const laterFields = stepFields.get(i + 1) || new Set();
      const earlierFields = new Set<string>();

      for (let j = 0; j < i; j++) {
        const fields = stepFields.get(j + 1) || new Set();
        fields.forEach(f => earlierFields.add(f));
      }

      // Calculate overlap
      const covered = [...earlierFields].filter(f => laterFields.has(f));
      const coverage = earlierFields.size > 0 ? covered.length / earlierFields.size : 0;

      if (coverage >= 0.8) { // 80% field coverage threshold
        const networkData = stepNetworkData[i];
        const apiRequest = this.findBestApiRequest(networkData?.requests || []);

        if (apiRequest) {
          const bypassedDuration = stepNetworkData
            .slice(0, i)
            .reduce((sum, step) => sum + step.duration, 0);

          optimizations.push({
            id: this.generateOptimizationId(),
            workflowId: workflow.id,
            type: 'data_sufficiency',
            bypassedSteps: Array.from({ length: i }, (_, idx) => idx + 1),
            shortcutStep: i + 1,
            shortcutEndpoint: this.extractEndpointInfo(apiRequest),
            estimatedSpeedupFactor: this.calculateSpeedup(bypassedDuration, apiRequest.duration || 200),
            confidence: coverage,
            dataFieldsCovered: covered,
            requiredParameters: this.extractUrlParameters(apiRequest.url),
            metrics: this.createEmptyMetrics(),
            discoveredAt: Date.now(),
            isPromoted: false,
          });
        }
      }
    }

    return optimizations;
  }

  /**
   * Filter requests to only include API-like requests
   */
  private filterApiRequests(requests: NetworkRequest[]): NetworkRequest[] {
    return requests.filter(req => {
      // Must be a data-fetching method
      if (!DATA_FETCH_METHODS.includes(req.method)) {
        return false;
      }

      // Must have successful status
      if (!SUCCESS_STATUS_CODES.includes(req.status)) {
        return false;
      }

      // Must be JSON content type
      const contentType = req.contentType?.toLowerCase() || '';
      const isApiContentType = API_CONTENT_TYPES.some(type =>
        contentType.includes(type)
      );

      // Or must have /api/ in URL path
      const hasApiPath = /\/api\//i.test(req.url) ||
        /\/v\d+\//i.test(req.url) ||
        /\.json$/i.test(req.url);

      return isApiContentType || hasApiPath;
    });
  }

  /**
   * Analyze if an API request could serve as a shortcut
   */
  private analyzeApiForShortcut(
    apiRequest: NetworkRequest,
    workflow: Workflow,
    stepNetworkData: StepNetworkData[],
    currentStepIndex: number
  ): { confidence: number; fieldsCovered: string[]; requiredParams: string[] } | null {
    // Check if the API response contains meaningful data
    if (!apiRequest.responseBody) {
      return null;
    }

    let responseData: any;
    try {
      responseData = typeof apiRequest.responseBody === 'string'
        ? JSON.parse(apiRequest.responseBody)
        : apiRequest.responseBody;
    } catch (error) {
      optimizerLogger.debug('Failed to parse API response body as JSON', { url: apiRequest.url, error });
      return null; // Not valid JSON
    }

    // Extract fields from the response
    const apiFields = this.extractFieldNames(responseData);

    // Collect fields from earlier steps
    const earlierFields = new Set<string>();
    for (let i = 0; i < currentStepIndex; i++) {
      const step = workflow.steps[i];
      if (step?.extractedData) {
        const fields = this.extractFieldNames(step.extractedData);
        fields.forEach(f => earlierFields.add(f));
      }
    }

    // Calculate coverage
    const covered = [...earlierFields].filter(f => apiFields.has(f));
    const coverage = earlierFields.size > 0 ? covered.length / earlierFields.size : 0;

    // Extract required parameters from URL
    const urlParams = this.extractUrlParameters(apiRequest.url);

    // Calculate confidence based on coverage and API quality indicators
    let confidence = coverage;

    // Boost confidence if API returns a lot of data
    if (apiFields.size > 5) {
      confidence = Math.min(1.0, confidence + 0.1);
    }

    // Reduce confidence if many params are needed
    if (urlParams.length > 3) {
      confidence = Math.max(0, confidence - 0.1);
    }

    if (confidence >= MIN_OPTIMIZATION_CONFIDENCE) {
      return {
        confidence,
        fieldsCovered: covered,
        requiredParams: urlParams,
      };
    }

    return null;
  }

  /**
   * Extract field names from an object (recursive, limited depth)
   */
  private extractFieldNames(obj: any, prefix = '', depth = 0): Set<string> {
    const fields = new Set<string>();

    if (depth > 3 || obj === null || obj === undefined) {
      return fields;
    }

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      for (const key of Object.keys(obj)) {
        const fieldName = prefix ? `${prefix}.${key}` : key;
        fields.add(fieldName);

        // Recurse into nested objects
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const nestedFields = this.extractFieldNames(obj[key], fieldName, depth + 1);
          nestedFields.forEach(f => fields.add(f));
        }
      }
    } else if (Array.isArray(obj) && obj.length > 0) {
      // For arrays, analyze first element
      const nestedFields = this.extractFieldNames(obj[0], prefix, depth + 1);
      nestedFields.forEach(f => fields.add(f));
    }

    return fields;
  }

  /**
   * Extract URL parameters and query params
   */
  private extractUrlParameters(url: string): string[] {
    const params: string[] = [];

    try {
      const parsed = new URL(url);

      // Extract path parameters (e.g., /users/123/orders/456 -> resourceId0, resourceId1)
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      for (const part of pathParts) {
        // Detect numeric IDs or UUIDs
        if (/^\d+$/.test(part) || /^[a-f0-9-]{36}$/i.test(part)) {
          // Use unique names for each resource ID found
          params.push(`resourceId${params.filter(p => p.startsWith('resourceId')).length}`);
        }
      }

      // Extract query parameters
      parsed.searchParams.forEach((_, key) => {
        params.push(key);
      });
    } catch (error) {
      optimizerLogger.warn('Failed to parse URL', { url, error });
    }

    return [...new Set(params)]; // Deduplicate
  }

  /**
   * Extract endpoint info from a network request
   */
  private extractEndpointInfo(request: NetworkRequest): ShortcutEndpoint {
    const parsed = new URL(request.url);

    // Extract URL parameters (path segments that look like IDs)
    const urlParameters: string[] = [];
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (/^\d+$/.test(part) || /^[a-f0-9-]{36}$/i.test(part)) {
        urlParameters.push(`{param${i}}`);
      }
    }

    // Extract query parameters
    const queryParameters: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      queryParameters[key] = value;
    });

    // Extract relevant headers
    const headers: Record<string, string> = {};
    const relevantHeaders = ['authorization', 'x-api-key', 'content-type', 'accept'];
    for (const header of relevantHeaders) {
      if (request.requestHeaders?.[header]) {
        headers[header] = request.requestHeaders[header];
      }
    }

    return {
      url: request.url,
      method: request.method,
      contentType: request.contentType || 'application/json',
      urlParameters,
      queryParameters,
      headers,
      responseStructure: this.analyzeResponseStructure(request.responseBody),
    };
  }

  /**
   * Analyze response structure to understand data layout
   */
  private analyzeResponseStructure(responseBody: any): { dataPath?: string; fields: string[] } | undefined {
    if (!responseBody) {
      return undefined;
    }

    let data: any;
    try {
      data = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
    } catch (error) {
      optimizerLogger.debug('Failed to parse response body for structure analysis', { error });
      return undefined;
    }

    // Common data paths in API responses
    const dataPaths = ['data', 'results', 'items', 'records', 'response', 'payload'];
    let mainData = data;
    let dataPath: string | undefined;

    for (const path of dataPaths) {
      if (data[path] && typeof data[path] === 'object') {
        mainData = data[path];
        dataPath = path;
        break;
      }
    }

    const fields = [...this.extractFieldNames(mainData)];

    return { dataPath, fields: fields.slice(0, 20) }; // Limit to 20 fields
  }

  /**
   * Find the best API request from a list (most data, most relevant)
   */
  private findBestApiRequest(requests: NetworkRequest[]): NetworkRequest | null {
    const apiRequests = this.filterApiRequests(requests);

    if (apiRequests.length === 0) {
      return null;
    }

    // Score each request
    const scored = apiRequests.map(req => {
      let score = 0;

      // Prefer JSON responses
      if (req.contentType?.includes('json')) {
        score += 2;
      }

      // Prefer larger responses (more data)
      if (req.responseBody) {
        const size = typeof req.responseBody === 'string'
          ? req.responseBody.length
          : JSON.stringify(req.responseBody).length;
        score += Math.min(3, size / 1000); // Up to 3 points for size
      }

      // Prefer /api/ paths
      if (/\/api\//i.test(req.url)) {
        score += 1;
      }

      // Prefer faster responses
      if (req.duration && req.duration < 500) {
        score += 1;
      }

      return { request: req, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.request || null;
  }

  /**
   * Calculate speedup factor
   */
  private calculateSpeedup(originalDuration: number, optimizedDuration: number): number {
    if (optimizedDuration <= 0) {
      return 1;
    }
    return Math.round((originalDuration / optimizedDuration) * 10) / 10;
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): OptimizationMetrics {
    return {
      timesUsed: 0,
      successCount: 0,
      failureCount: 0,
      avgOptimizedDuration: 0,
      avgOriginalDuration: 0,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Generate unique optimization ID
   */
  private generateOptimizationId(): string {
    return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // ============================================
  // OPTIMIZATION MANAGEMENT
  // ============================================

  /**
   * Get optimization by ID
   */
  getOptimization(id: string): WorkflowOptimization | undefined {
    return this.optimizations.get(id);
  }

  /**
   * Get all optimizations for a workflow
   */
  getWorkflowOptimizations(workflowId: string): WorkflowOptimization[] {
    const optIds = this.optimizationsByWorkflow.get(workflowId) || [];
    return optIds
      .map(id => this.optimizations.get(id))
      .filter((opt): opt is WorkflowOptimization => opt !== undefined);
  }

  /**
   * Get promoted optimization for a workflow (if any)
   */
  getPromotedOptimization(workflowId: string): WorkflowOptimization | undefined {
    const opts = this.getWorkflowOptimizations(workflowId);
    return opts.find(opt => opt.isPromoted);
  }

  /**
   * Record optimization usage result
   */
  recordOptimizationResult(
    optimizationId: string,
    success: boolean,
    duration: number
  ): void {
    const opt = this.optimizations.get(optimizationId);
    if (!opt) {
      return;
    }

    opt.metrics.timesUsed++;
    opt.metrics.lastUpdated = Date.now();

    if (success) {
      opt.metrics.successCount++;
      // Update running average for optimized duration
      opt.metrics.avgOptimizedDuration = this.updateRunningAverage(
        opt.metrics.avgOptimizedDuration,
        duration,
        opt.metrics.successCount
      );
    } else {
      opt.metrics.failureCount++;
    }

    // Check for auto-promotion
    this.checkAutoPromotion(opt);

    optimizerLogger.debug('Recorded optimization result', {
      optimizationId,
      success,
      duration,
      totalUses: opt.metrics.timesUsed,
    });
  }

  /**
   * Record original workflow duration (for comparison)
   */
  recordOriginalDuration(workflowId: string, duration: number): void {
    const opts = this.getWorkflowOptimizations(workflowId);
    for (const opt of opts) {
      opt.metrics.avgOriginalDuration = this.updateRunningAverage(
        opt.metrics.avgOriginalDuration,
        duration,
        opt.metrics.timesUsed + 1
      );
      opt.metrics.lastUpdated = Date.now();
    }
  }

  /**
   * Check if optimization should be auto-promoted
   */
  private checkAutoPromotion(opt: WorkflowOptimization): void {
    if (opt.isPromoted) {
      return; // Already promoted
    }

    const successRate = opt.metrics.timesUsed > 0
      ? opt.metrics.successCount / opt.metrics.timesUsed
      : 0;

    if (
      opt.metrics.timesUsed >= MIN_USES_FOR_PROMOTION &&
      successRate >= AUTO_PROMOTE_SUCCESS_RATE
    ) {
      opt.isPromoted = true;
      optimizerLogger.info('Auto-promoted optimization', {
        optimizationId: opt.id,
        workflowId: opt.workflowId,
        successRate,
        timesUsed: opt.metrics.timesUsed,
      });
    }
  }

  /**
   * Manually promote an optimization
   */
  promoteOptimization(optimizationId: string): boolean {
    const opt = this.optimizations.get(optimizationId);
    if (!opt) {
      return false;
    }

    // Demote any other promoted optimization for this workflow
    const workflowOpts = this.getWorkflowOptimizations(opt.workflowId);
    for (const other of workflowOpts) {
      if (other.id !== optimizationId && other.isPromoted) {
        other.isPromoted = false;
      }
    }

    opt.isPromoted = true;
    optimizerLogger.info('Manually promoted optimization', {
      optimizationId: opt.id,
      workflowId: opt.workflowId,
    });

    return true;
  }

  /**
   * Demote an optimization
   */
  demoteOptimization(optimizationId: string): boolean {
    const opt = this.optimizations.get(optimizationId);
    if (!opt) {
      return false;
    }

    opt.isPromoted = false;
    optimizerLogger.info('Demoted optimization', {
      optimizationId: opt.id,
      workflowId: opt.workflowId,
    });

    return true;
  }

  /**
   * Update running average calculation
   */
  private updateRunningAverage(
    currentAvg: number,
    newValue: number,
    count: number
  ): number {
    if (count <= 1) {
      return newValue;
    }
    return currentAvg + (newValue - currentAvg) / count;
  }

  // ============================================
  // STATISTICS AND REPORTING
  // ============================================

  /**
   * Get optimization statistics
   */
  getStatistics(): {
    totalOptimizations: number;
    promotedOptimizations: number;
    byType: Record<string, number>;
    avgSpeedup: number;
    avgConfidence: number;
  } {
    const opts = [...this.optimizations.values()];

    const byType: Record<string, number> = {};
    let totalSpeedup = 0;
    let totalConfidence = 0;

    for (const opt of opts) {
      byType[opt.type] = (byType[opt.type] || 0) + 1;
      totalSpeedup += opt.estimatedSpeedupFactor;
      totalConfidence += opt.confidence;
    }

    return {
      totalOptimizations: opts.length,
      promotedOptimizations: opts.filter(o => o.isPromoted).length,
      byType,
      avgSpeedup: opts.length > 0 ? totalSpeedup / opts.length : 0,
      avgConfidence: opts.length > 0 ? totalConfidence / opts.length : 0,
    };
  }

  /**
   * Clear all optimizations
   */
  clear(): void {
    this.optimizations.clear();
    this.optimizationsByWorkflow.clear();
    optimizerLogger.info('Cleared all optimizations');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

/** Default workflow optimizer instance */
export const workflowOptimizer = new WorkflowOptimizer();
