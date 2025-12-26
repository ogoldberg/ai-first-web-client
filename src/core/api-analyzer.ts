/**
 * API Analyzer - Discovers and analyzes API patterns from network traffic
 */

import type { NetworkRequest, ApiPattern } from '../types/index.js';

export class ApiAnalyzer {
  /**
   * Analyze network requests to discover API patterns
   */
  analyzeRequests(requests: NetworkRequest[]): ApiPattern[] {
    const patterns: ApiPattern[] = [];

    for (const request of requests) {
      // Skip non-API requests
      if (!this.isLikelyApiRequest(request)) {
        continue;
      }

      const pattern = this.createPattern(request);
      patterns.push(pattern);
    }

    return patterns;
  }

  /**
   * Determine if a request is likely an API call
   */
  private isLikelyApiRequest(request: NetworkRequest): boolean {
    const url = request.url.toLowerCase();
    const contentType = request.contentType?.toLowerCase() || '';

    // JSON responses are likely APIs
    if (contentType.includes('application/json')) {
      return true;
    }

    // GraphQL endpoints
    if (url.includes('graphql') || url.includes('/gql') || url.includes('/query')) {
      return true;
    }

    // Common API path patterns
    const apiPatterns = [
      /\/api\//,
      /\/v\d+\//,
      /\.json$/,
      /\/rest\//,
      /\/ajax\//,
      /\/rpc/,
    ];

    return apiPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Create an API pattern from a request
   */
  private createPattern(request: NetworkRequest): ApiPattern {
    const authType = this.detectAuthType(request);
    const authHeaders = this.extractAuthHeaders(request);
    const confidence = this.calculateConfidence(request);

    return {
      endpoint: this.normalizeEndpoint(request.url),
      method: request.method,
      confidence,
      canBypass: confidence === 'high' && request.status >= 200 && request.status < 300,
      authType,
      authHeaders,
      responseType: request.contentType,
      reason: this.getConfidenceReason(request, confidence),
    };
  }

  /**
   * Detect authentication type from request
   */
  private detectAuthType(request: NetworkRequest): ApiPattern['authType'] {
    const authHeader = request.requestHeaders['authorization']?.toLowerCase();

    if (authHeader?.includes('bearer')) {
      return 'bearer';
    }

    if (request.requestHeaders['cookie']) {
      return 'cookie';
    }

    if (request.requestHeaders['x-api-key'] || request.requestHeaders['api-key']) {
      return 'header';
    }

    return 'session';
  }

  /**
   * Extract authentication headers
   */
  private extractAuthHeaders(request: NetworkRequest): Record<string, string> {
    const authHeaders: Record<string, string> = {};

    // Common auth headers
    const authHeaderNames = [
      'authorization',
      'x-api-key',
      'api-key',
      'x-auth-token',
      'x-csrf-token',
      'cookie',
    ];

    for (const headerName of authHeaderNames) {
      const value = request.requestHeaders[headerName];
      if (value) {
        authHeaders[headerName] = value;
      }
    }

    return authHeaders;
  }

  /**
   * Calculate confidence level for direct API access
   */
  private calculateConfidence(request: NetworkRequest): 'high' | 'medium' | 'low' {
    let score = 0;

    // Successful response
    if (request.status >= 200 && request.status < 300) {
      score += 3;
    }

    // JSON response
    if (request.contentType?.includes('application/json')) {
      score += 2;
    }

    // Method-based scoring
    // GET: Simple read operations (high confidence)
    if (request.method === 'GET') {
      score += 2;
    }
    // POST/PUT/DELETE: Mutation operations - need auth to be reliable
    else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      // Mutations without auth are less reliable for bypassing
      // Only give full points if we have auth captured
      const hasAuth = request.requestHeaders['authorization'] ||
                      request.requestHeaders['cookie'] ||
                      request.requestHeaders['x-api-key'];

      if (request.status >= 200 && request.status < 300) {
        // With auth, mutations are valuable
        if (hasAuth) {
          score += 2;
        }
        // Without auth, mutations are medium confidence at best
        // (we might not be able to replay them successfully)

        // Extra points for proper REST status codes
        if (
          (request.method === 'POST' && request.status === 201) || // Created
          (request.method === 'DELETE' && (request.status === 204 || request.status === 200)) ||
          (request.method === 'PUT' && request.status === 200)
        ) {
          score += 1;
        }
      }
    }

    // Has response body
    if (request.responseBody) {
      score += 1;
    }

    // Standard auth (cookie or bearer)
    const authType = this.detectAuthType(request);
    if (authType === 'cookie' || authType === 'bearer') {
      score += 1;
    }

    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  }

  /**
   * Normalize endpoint URL to a pattern
   */
  private normalizeEndpoint(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove query params for cleaner patterns
      return urlObj.origin + urlObj.pathname;
    } catch {
      return url;
    }
  }

  /**
   * Get human-readable reason for confidence level
   */
  private getConfidenceReason(request: NetworkRequest, confidence: string): string {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const isRestCompliant =
      (request.method === 'POST' && request.status === 201) ||
      (request.method === 'DELETE' && request.status === 204);
    const isGraphQL = request.url.toLowerCase().includes('graphql') ||
                     request.url.toLowerCase().includes('/gql');

    if (confidence === 'high') {
      if (isGraphQL) {
        return 'GraphQL endpoint with standard auth and JSON response';
      }
      const mutationType = isMutation ? `${request.method} mutation` : 'GET request';
      const restNote = isRestCompliant ? ' (REST-compliant)' : '';
      return `${mutationType} with standard auth and JSON response${restNote}`;
    } else if (confidence === 'medium') {
      if (isGraphQL) {
        return 'GraphQL endpoint but may require complex auth or variables';
      }
      const requestType = isMutation ? 'Mutation' : 'API call';
      return `${requestType} but may require additional parameters or complex auth`;
    } else {
      return 'Complex request - may need browser context or JS-generated parameters';
    }
  }

  // ============================================
  // CX-009: Tier-Aware API Analysis
  // ============================================

  /**
   * Analyze requests with tier-aware confidence degradation
   *
   * For non-Playwright tiers, we have less complete data and lower certainty,
   * so we apply confidence penalties.
   *
   * @param requests - Network requests (can be partial data from lightweight tier)
   * @param tier - The rendering tier that captured these requests
   * @returns API patterns with tier-adjusted confidence
   */
  analyzeRequestsWithTier(
    requests: NetworkRequest[],
    tier: 'playwright' | 'lightweight' | 'intelligence'
  ): ApiPattern[] {
    const patterns = this.analyzeRequests(requests);

    if (tier === 'playwright') {
      // Playwright has full data - no degradation needed
      return patterns;
    }

    // Apply confidence degradation for non-Playwright tiers
    return patterns
      .map(pattern => this.degradeConfidence(pattern, tier))
      .filter((pattern): pattern is ApiPattern => pattern !== null);
  }

  /**
   * Degrade confidence level based on tier
   *
   * Lightweight tier: Downgrade by 1 level
   * Intelligence tier: Downgrade by 2 levels (essentially skip)
   */
  private degradeConfidence(
    pattern: ApiPattern,
    tier: 'lightweight' | 'intelligence'
  ): ApiPattern | null {
    const tierPenalty = tier === 'lightweight' ? 1 : 2;
    const confidenceLevels: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
    const currentIndex = confidenceLevels.indexOf(pattern.confidence);
    const newIndex = Math.min(currentIndex + tierPenalty, confidenceLevels.length - 1);

    // If degraded to 'low' and was already 'medium' or 'low', skip this pattern
    // (too uncertain to be useful)
    if (tier === 'intelligence' && pattern.confidence !== 'high') {
      return null;
    }

    const degradedConfidence = confidenceLevels[newIndex];

    // Update canBypass based on new confidence
    const canBypass = degradedConfidence === 'high' && pattern.canBypass;

    return {
      ...pattern,
      confidence: degradedConfidence,
      canBypass,
      reason: `${pattern.reason} (confidence degraded: ${tier} tier)`,
    };
  }

  /**
   * Convert lightweight renderer network requests to full NetworkRequest type
   *
   * This bridges the gap between the lightweight renderer's simpler network tracking
   * and the full NetworkRequest interface expected by analyzeRequests.
   */
  static convertLightweightRequests(
    lightweightRequests: Array<{
      url: string;
      method: string;
      status?: number;
      contentType?: string;
      requestHeaders?: Record<string, string>;
      responseHeaders?: Record<string, string>;
      responseBody?: unknown;
      timestamp: number;
      duration?: number;
    }>
  ): NetworkRequest[] {
    return lightweightRequests.map(req => {
      const status = req.status || 0;
      const statusText = status === 200 ? 'OK' : (status === 0 ? 'Error' : 'Unknown');
      return {
        url: req.url,
        method: req.method,
        status,
        statusText,
        headers: req.responseHeaders || {},
        requestHeaders: req.requestHeaders || {},
        responseBody: req.responseBody,
        contentType: req.contentType,
        timestamp: req.timestamp,
        duration: req.duration,
      };
    });
  }
}
