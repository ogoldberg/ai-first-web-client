/**
 * Unbrowser HTTP Client
 *
 * Client for interacting with the Unbrowser cloud API.
 * Provides a simple interface for browsing URLs via the cloud service.
 */

// ============================================
// Types
// ============================================

export interface UnbrowserConfig {
  /** API key for authentication (required) */
  apiKey: string;
  /** Base URL for the API (default: https://api.unbrowser.ai) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Retry failed requests (default: true) */
  retry?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
}

export interface BrowseOptions {
  /** Content type to return (default: markdown) */
  contentType?: 'markdown' | 'text' | 'html';
  /** CSS selector to wait for before extraction */
  waitForSelector?: string;
  /** Scroll page to trigger lazy loading */
  scrollToLoad?: boolean;
  /** Maximum characters to return */
  maxChars?: number;
  /** Include tables in response */
  includeTables?: boolean;
  /** Maximum latency allowed (will skip slower tiers) */
  maxLatencyMs?: number;
  /** Maximum cost tier to use */
  maxCostTier?: 'intelligence' | 'lightweight' | 'playwright';
  /** Verification options (COMP-015) */
  verify?: {
    /** Enable verification (default: true for basic mode) */
    enabled?: boolean;
    /** Verification mode: basic, standard, or thorough */
    mode?: 'basic' | 'standard' | 'thorough';
  };
}

export interface SessionData {
  /** Cookies to send with the request */
  cookies?: Cookie[];
  /** LocalStorage values to set */
  localStorage?: Record<string, string>;
}

export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

export interface BrowseResult {
  /** The original URL requested */
  url: string;
  /** The final URL after redirects */
  finalUrl: string;
  /** Page title */
  title: string;
  /** Extracted content */
  content: {
    markdown: string;
    text: string;
    html?: string;
  };
  /** Extracted tables (if includeTables was true) */
  tables?: Array<{
    headers: string[];
    rows: string[][];
  }>;
  /** Discovered API endpoints */
  discoveredApis?: Array<{
    url: string;
    method: string;
    contentType: string;
  }>;
  /** Request metadata */
  metadata: {
    loadTime: number;
    tier: string;
    tiersAttempted: string[];
  };
  /** New cookies set during the request */
  newCookies?: Cookie[];
  /** Verification result (COMP-015) */
  verification?: {
    /** Whether all checks passed */
    passed: boolean;
    /** Overall confidence (0-1) */
    confidence: number;
    /** Number of checks run */
    checksRun: number;
    /** Error messages from failed checks */
    errors?: string[];
    /** Warning messages */
    warnings?: string[];
  };
}

export interface BatchResult {
  results: Array<{
    url: string;
    success: boolean;
    data?: BrowseResult;
    error?: { code: string; message: string };
  }>;
  totalTime: number;
}

// ============================================
// Plan Preview Types
// ============================================

export interface ExecutionStep {
  order: number;
  action: string;
  description: string;
  tier: 'intelligence' | 'lightweight' | 'playwright';
  expectedDuration: number; // milliseconds
  confidence: 'high' | 'medium' | 'low';
  reason?: string;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  tier: 'intelligence' | 'lightweight' | 'playwright';
  reasoning: string;
  fallbackPlan?: ExecutionPlan;
}

export interface TimeEstimate {
  min: number; // milliseconds
  max: number;
  expected: number;
  breakdown: {
    [tier: string]: number;
  };
}

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

export interface ConfidenceLevel {
  overall: 'high' | 'medium' | 'low';
  factors: ConfidenceFactors;
}

export interface BrowsePreview {
  schemaVersion: string;
  plan: ExecutionPlan;
  estimatedTime: TimeEstimate;
  confidence: ConfidenceLevel;
  alternativePlans?: ExecutionPlan[];
}

export interface DomainIntelligence {
  domain: string;
  knownPatterns: number;
  selectorChains: number;
  validators: number;
  paginationPatterns: number;
  recentFailures: number;
  successRate: number;
  domainGroup: string | null;
  recommendedWaitStrategy: string;
  shouldUseSession: boolean;
}

export interface ProgressEvent {
  stage: string;
  tier?: string;
  elapsed: number;
  message?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export class UnbrowserError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'UnbrowserError';
  }
}

// ============================================
// Client Implementation
// ============================================

export class UnbrowserClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retry: boolean;
  private maxRetries: number;

  constructor(config: UnbrowserConfig) {
    if (!config.apiKey) {
      throw new UnbrowserError('MISSING_API_KEY', 'apiKey is required');
    }

    if (!config.apiKey.startsWith('ub_')) {
      throw new UnbrowserError('INVALID_API_KEY', 'Invalid API key format');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.unbrowser.ai').replace(/\/$/, '');
    this.timeout = config.timeout || 60000;
    this.retry = config.retry !== false;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let lastError: Error | null = null;
    const attempts = this.retry ? this.maxRetries : 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: options?.signal || controller.signal,
        });

        clearTimeout(timeoutId);

        const result = (await response.json()) as { success: boolean; data?: T; error?: { code: string; message: string } };

        if (!result.success) {
          const error = result.error || { code: 'UNKNOWN_ERROR', message: 'Unknown error' };
          throw new UnbrowserError(error.code, error.message);
        }

        return result.data as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on auth errors or bad requests
        if (error instanceof UnbrowserError) {
          if (['UNAUTHORIZED', 'FORBIDDEN', 'INVALID_REQUEST', 'INVALID_URL'].includes(error.code)) {
            throw error;
          }
        }

        // Don't retry on user abort
        if (error instanceof Error && error.name === 'AbortError') {
          throw new UnbrowserError('REQUEST_ABORTED', 'Request was aborted');
        }

        // Wait before retrying (exponential backoff)
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new UnbrowserError('UNKNOWN_ERROR', 'Request failed');
  }

  /**
   * Browse a URL and extract content
   */
  async browse(url: string, options?: BrowseOptions, session?: SessionData): Promise<BrowseResult> {
    return this.request<BrowseResult>('POST', '/v1/browse', {
      url,
      options,
      session,
    });
  }

  /**
   * Preview what will happen when browsing a URL (without executing)
   *
   * Returns execution plan, time estimates, and confidence levels.
   * Completes in <50ms vs 2-5s for browser automation.
   *
   * @example
   * ```typescript
   * const preview = await client.previewBrowse('https://reddit.com/r/programming');
   * console.log(`Expected time: ${preview.estimatedTime.expected}ms`);
   * console.log(`Confidence: ${preview.confidence.overall}`);
   * console.log(`Plan: ${preview.plan.steps.length} steps using ${preview.plan.tier} tier`);
   * ```
   */
  async previewBrowse(url: string, options?: BrowseOptions): Promise<BrowsePreview> {
    return this.request<BrowsePreview>('POST', '/v1/browse/preview', {
      url,
      options,
    });
  }

  /**
   * Browse a URL with progress updates via SSE
   */
  async browseWithProgress(
    url: string,
    onProgress: ProgressCallback,
    options?: BrowseOptions,
    session?: SessionData
  ): Promise<BrowseResult> {
    const fullUrl = `${this.baseUrl}/v1/browse`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ url, options, session }),
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const error = JSON.parse(text);
        throw new UnbrowserError(error.error?.code || 'HTTP_ERROR', error.error?.message || `HTTP ${response.status}`);
      } catch {
        throw new UnbrowserError('HTTP_ERROR', `HTTP ${response.status}: ${text}`);
      }
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new UnbrowserError('SSE_ERROR', 'Failed to get response reader');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let result: BrowseResult | null = null;
    let error: UnbrowserError | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7).trim();

          // Read the data line
          const dataLineIndex = lines.indexOf(line) + 1;
          if (dataLineIndex < lines.length && lines[dataLineIndex].startsWith('data: ')) {
            const data = JSON.parse(lines[dataLineIndex].slice(6));

            if (eventType === 'progress') {
              onProgress(data as ProgressEvent);
            } else if (eventType === 'result') {
              result = data.data as BrowseResult;
            } else if (eventType === 'error') {
              error = new UnbrowserError(data.error?.code || 'BROWSE_ERROR', data.error?.message || 'Browse failed');
            }
          }
        }
      }
    }

    if (error) throw error;
    if (!result) throw new UnbrowserError('SSE_ERROR', 'No result received');

    return result;
  }

  /**
   * Fast content fetch (tiered rendering)
   */
  async fetch(url: string, options?: BrowseOptions, session?: SessionData): Promise<BrowseResult> {
    return this.request<BrowseResult>('POST', '/v1/fetch', {
      url,
      options,
      session,
    });
  }

  /**
   * Browse multiple URLs in parallel
   */
  async batch(urls: string[], options?: BrowseOptions, session?: SessionData): Promise<BatchResult> {
    return this.request<BatchResult>('POST', '/v1/batch', {
      urls,
      options,
      session,
    });
  }

  /**
   * Get domain intelligence summary
   */
  async getDomainIntelligence(domain: string): Promise<DomainIntelligence> {
    return this.request<DomainIntelligence>('GET', `/v1/domains/${encodeURIComponent(domain)}/intelligence`);
  }

  /**
   * Get usage statistics for the current billing period
   */
  async getUsage(): Promise<{
    period: { start: string; end: string };
    requests: { total: number; byTier: Record<string, number> };
    limits: { daily: number; remaining: number };
  }> {
    return this.request('GET', '/v1/usage');
  }

  /**
   * Check API health (no auth required)
   */
  async health(): Promise<{ status: string; version: string; uptime?: number }> {
    const url = `${this.baseUrl}/health`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new UnbrowserError('HEALTH_CHECK_FAILED', `Health check failed: HTTP ${response.status}`);
    }

    return response.json() as Promise<{ status: string; version: string; uptime?: number }>;
  }

  // ============================================
  // Workflow Recording (COMP-010)
  // ============================================

  /**
   * Start a workflow recording session
   *
   * Records all browse operations for later replay.
   * Use with browse() by passing the recordingId in headers.
   *
   * @example
   * ```typescript
   * // Start recording
   * const session = await client.startRecording({
   *   name: 'Extract product pricing',
   *   description: 'Navigate to product page and extract price',
   *   domain: 'example.com'
   * });
   *
   * // Browse (auto-captured)
   * await client.browse('https://example.com/products/123', {
   *   headers: { 'X-Recording-Session': session.recordingId }
   * });
   *
   * // Stop and save
   * const workflow = await client.stopRecording(session.recordingId);
   * ```
   */
  async startRecording(request: {
    name: string;
    description: string;
    domain: string;
    tags?: string[];
  }): Promise<{ recordingId: string; status: string; startedAt: string }> {
    return this.request('POST', '/v1/workflows/record/start', request);
  }

  /**
   * Stop a recording session and optionally save as workflow
   */
  async stopRecording(recordingId: string, save: boolean = true): Promise<{
    workflowId: string;
    skillId: string;
    name: string;
    steps: number;
    estimatedDuration: number;
  } | null> {
    return this.request('POST', `/v1/workflows/record/${recordingId}/stop`, { save });
  }

  /**
   * Annotate a step in an active recording
   *
   * Mark steps as critical/important/optional and add descriptions.
   */
  async annotateRecording(recordingId: string, annotation: {
    stepNumber: number;
    annotation: string;
    importance?: 'critical' | 'important' | 'optional';
  }): Promise<{ recordingId: string; stepNumber: number; annotated: boolean }> {
    return this.request('POST', `/v1/workflows/record/${recordingId}/annotate`, annotation);
  }

  /**
   * Replay a saved workflow with optional variable substitution
   *
   * @example
   * ```typescript
   * // Replay with different product ID
   * const results = await client.replayWorkflow('wf_xyz789', {
   *   productId: '456'
   * });
   *
   * console.log(results.overallSuccess); // true
   * console.log(results.results[0].data); // First step result
   * ```
   */
  async replayWorkflow(workflowId: string, variables?: Record<string, string | number | boolean>): Promise<{
    workflowId: string;
    overallSuccess: boolean;
    totalDuration: number;
    results: Array<{
      stepNumber: number;
      success: boolean;
      duration: number;
      tier?: 'intelligence' | 'lightweight' | 'playwright';
      error?: string;
    }>;
  }> {
    return this.request('POST', `/v1/workflows/${workflowId}/replay`, { variables });
  }

  /**
   * List saved workflows
   */
  async listWorkflows(options?: {
    domain?: string;
    tags?: string[];
  }): Promise<{
    workflows: Array<{
      id: string;
      name: string;
      description: string;
      domain: string;
      tags: string[];
      steps: number;
      version: number;
      usageCount: number;
      successRate: number;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
  }> {
    const params = new URLSearchParams();
    if (options?.domain) params.set('domain', options.domain);
    if (options?.tags) params.set('tags', options.tags.join(','));

    const query = params.toString();
    return this.request('GET', `/v1/workflows${query ? `?${query}` : ''}`);
  }

  /**
   * Get workflow details including full step information
   */
  async getWorkflow(workflowId: string): Promise<{
    id: string;
    name: string;
    description: string;
    domain: string;
    tags: string[];
    version: number;
    usageCount: number;
    successRate: number;
    skillId?: string;
    steps: Array<{
      stepNumber: number;
      action: string;
      url?: string;
      description: string;
      userAnnotation?: string;
      importance: 'critical' | 'important' | 'optional';
      tier?: 'intelligence' | 'lightweight' | 'playwright';
      duration?: number;
      success: boolean;
    }>;
    createdAt: string;
    updatedAt: string;
  }> {
    return this.request('GET', `/v1/workflows/${workflowId}`);
  }

  /**
   * Delete a saved workflow
   */
  async deleteWorkflow(workflowId: string): Promise<{ workflowId: string; deleted: boolean }> {
    return this.request('DELETE', `/v1/workflows/${workflowId}`);
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an Unbrowser client for cloud API access
 *
 * @example
 * ```typescript
 * import { createUnbrowser } from '@unbrowser/core';
 *
 * const client = createUnbrowser({
 *   apiKey: 'ub_live_xxxxx',
 * });
 *
 * const result = await client.browse('https://example.com');
 * console.log(result.content.markdown);
 * ```
 */
export function createUnbrowser(config: UnbrowserConfig): UnbrowserClient {
  return new UnbrowserClient(config);
}
