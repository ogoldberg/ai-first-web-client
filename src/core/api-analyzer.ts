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

    // Common API path patterns
    const apiPatterns = [
      /\/api\//,
      /\/v\d+\//,
      /\/graphql/,
      /\.json$/,
      /\/rest\//,
      /\/ajax\//,
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

    // Simple GET request
    if (request.method === 'GET') {
      score += 2;
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
    if (confidence === 'high') {
      return 'Simple API with standard auth and JSON response';
    } else if (confidence === 'medium') {
      return 'API call but may require additional parameters or complex auth';
    } else {
      return 'Complex request - may need browser context or JS-generated parameters';
    }
  }
}
