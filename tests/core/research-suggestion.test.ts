/**
 * Tests for Research Suggestion Generator (LR-005)
 *
 * Tests the recursion depth limiting feature that prevents infinite
 * LLM research loops when attempting to bypass blocked sites.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_RESEARCH_DEPTH,
  TRUSTED_SOURCES,
  generateResearchSuggestion,
  detectBotProtection,
  classifyProblem,
  createProblemResponse,
  generateProblemReason,
  isBlockedByBotDetection,
  suggestRetryConfig,
} from '../../src/core/research-suggestion.js';

describe('Research Suggestion (LR-005)', () => {
  describe('MAX_RESEARCH_DEPTH constant', () => {
    it('should export MAX_RESEARCH_DEPTH constant', () => {
      expect(MAX_RESEARCH_DEPTH).toBeDefined();
      expect(typeof MAX_RESEARCH_DEPTH).toBe('number');
    });

    it('should be set to 2', () => {
      expect(MAX_RESEARCH_DEPTH).toBe(2);
    });
  });

  describe('createProblemResponse with research depth tracking', () => {
    const testUrl = 'https://example.com/protected-page';

    it('should include researchDepth field defaulting to 0', () => {
      const response = createProblemResponse(testUrl, 'bot_detection');
      expect(response.researchDepth).toBe(0);
      expect(response.maxResearchDepthReached).toBe(false);
    });

    it('should track researchDepth when provided', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: 1,
      });
      expect(response.researchDepth).toBe(1);
      expect(response.maxResearchDepthReached).toBe(false);
    });

    it('should set maxResearchDepthReached to true when depth equals MAX', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });
      expect(response.researchDepth).toBe(MAX_RESEARCH_DEPTH);
      expect(response.maxResearchDepthReached).toBe(true);
    });

    it('should set maxResearchDepthReached to true when depth exceeds MAX', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH + 1,
      });
      expect(response.researchDepth).toBe(MAX_RESEARCH_DEPTH + 1);
      expect(response.maxResearchDepthReached).toBe(true);
    });

    it('should append depth warning to reason when max reached', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });
      expect(response.reason).toContain('Maximum research depth');
      expect(response.reason).toContain(`(${MAX_RESEARCH_DEPTH})`);
      expect(response.reason).toContain('Manual intervention may be required');
    });

    it('should not append depth warning when under max', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: 1,
      });
      expect(response.reason).not.toContain('Maximum research depth');
      expect(response.reason).not.toContain('Manual intervention');
    });

    it('should provide limited hints when max depth reached', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });

      expect(response.researchSuggestion.hints).toBeDefined();
      expect(response.researchSuggestion.hints.length).toBeGreaterThan(0);
      expect(response.researchSuggestion.hints[0]).toContain('Maximum research depth');
      expect(response.researchSuggestion.hints).toContain(
        'Automated research-based retries have been exhausted.'
      );
      expect(response.researchSuggestion.hints.some(h =>
        h.includes('manual browser inspection') || h.includes('alternative data sources')
      )).toBe(true);
    });

    it('should clear search query when max depth reached', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });
      expect(response.researchSuggestion.searchQuery).toBe('');
    });

    it('should clear recommended sources when max depth reached', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });
      expect(response.researchSuggestion.recommendedSources).toEqual([]);
    });

    it('should clear retry parameters when max depth reached', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });
      expect(response.researchSuggestion.retryParameters).toEqual([]);
    });

    it('should provide full suggestions when under max depth', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: 1,
        detectionType: 'cloudflare',
      });

      expect(response.researchSuggestion.searchQuery).not.toBe('');
      expect(response.researchSuggestion.recommendedSources.length).toBeGreaterThan(0);
      expect(response.researchSuggestion.retryParameters.length).toBeGreaterThan(0);
    });

    it('should maintain needsAssistance as true regardless of depth', () => {
      const underMax = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: 1,
      });
      const atMax = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });

      expect(underMax.needsAssistance).toBe(true);
      expect(atMax.needsAssistance).toBe(true);
    });

    it('should preserve url and domain in response', () => {
      const response = createProblemResponse(testUrl, 'bot_detection', {
        researchDepth: MAX_RESEARCH_DEPTH,
      });
      expect(response.url).toBe(testUrl);
      expect(response.domain).toBe('example.com');
    });
  });

  describe('generateResearchSuggestion', () => {
    it('should include trusted sources', () => {
      const suggestion = generateResearchSuggestion('bot_detection', 'example.com');
      expect(suggestion.recommendedSources).toEqual(expect.arrayContaining([...TRUSTED_SOURCES]));
    });

    it('should generate search query for bot detection', () => {
      const suggestion = generateResearchSuggestion('bot_detection', 'example.com', 'cloudflare');
      expect(suggestion.searchQuery).toContain('cloudflare');
      expect(suggestion.searchQuery).toContain('bypass');
    });

    it('should include problem type', () => {
      const suggestion = generateResearchSuggestion('extraction_failure', 'example.com');
      expect(suggestion.problemType).toBe('extraction_failure');
    });

    it('should include detection type when provided', () => {
      const suggestion = generateResearchSuggestion('bot_detection', 'example.com', 'datadome');
      expect(suggestion.detectionType).toBe('datadome');
    });

    it('should include retry parameters', () => {
      const suggestion = generateResearchSuggestion('javascript_required', 'example.com');
      expect(suggestion.retryParameters).toContain('useFullBrowser');
      expect(suggestion.retryParameters).toContain('waitForSelector');
    });

    it('should include hints', () => {
      const suggestion = generateResearchSuggestion('timeout', 'example.com');
      expect(suggestion.hints.length).toBeGreaterThan(0);
    });
  });

  describe('detectBotProtection', () => {
    it('should detect Cloudflare', () => {
      const html = '<html>Checking your browser before accessing cloudflare</html>';
      expect(detectBotProtection(html)).toBe('cloudflare');
    });

    it('should detect Cloudflare from headers', () => {
      const html = '<html>Normal page</html>';
      const headers = { 'cf-ray': '12345' };
      expect(detectBotProtection(html, 200, headers)).toBe('cloudflare');
    });

    it('should detect Turnstile', () => {
      const html = '<html>challenges.cloudflare.com/turnstile</html>';
      expect(detectBotProtection(html)).toBe('turnstile');
    });

    it('should detect DataDome', () => {
      const html = '<html>datadome protection</html>';
      expect(detectBotProtection(html)).toBe('datadome');
    });

    it('should detect PerimeterX', () => {
      const html = '<html>perimeterx human-challenge</html>';
      expect(detectBotProtection(html)).toBe('perimeterx');
    });

    it('should detect Akamai', () => {
      const html = '<html>akamai_bm_sz protection</html>';
      expect(detectBotProtection(html)).toBe('akamai');
    });

    it('should detect reCAPTCHA', () => {
      const html = '<html><script src="google.com/recaptcha"></script></html>';
      expect(detectBotProtection(html)).toBe('recaptcha');
    });

    it('should return unknown for unrecognized protection', () => {
      const html = '<html>Normal content</html>';
      expect(detectBotProtection(html)).toBe('unknown');
    });
  });

  describe('classifyProblem', () => {
    it('should classify timeout errors', () => {
      expect(classifyProblem('Request timed out')).toBe('timeout');
    });

    it('should classify rate limiting from status code', () => {
      expect(classifyProblem(undefined, 429)).toBe('rate_limiting');
    });

    it('should classify rate limiting from error message', () => {
      expect(classifyProblem('Too many requests')).toBe('rate_limiting');
    });

    it('should classify authentication from status code', () => {
      expect(classifyProblem(undefined, 401)).toBe('authentication');
    });

    it('should classify selector failures', () => {
      expect(classifyProblem('Element not found for selector')).toBe('selector_failure');
    });

    it('should classify javascript required', () => {
      expect(classifyProblem(undefined, 200, '<html>Please enable javascript to view</html>')).toBe('javascript_required');
    });

    it('should classify bot detection on 403', () => {
      const html = '<html>Checking your browser cloudflare</html>';
      expect(classifyProblem(undefined, 403, html)).toBe('bot_detection');
    });

    it('should return unknown for unrecognized problems', () => {
      expect(classifyProblem()).toBe('unknown');
    });
  });

  describe('generateProblemReason', () => {
    it('should generate reason for bot detection with type', () => {
      const reason = generateProblemReason('bot_detection', 'cloudflare');
      expect(reason).toContain('Cloudflare');
      expect(reason).toContain('real browser');
    });

    it('should generate reason for generic bot detection', () => {
      const reason = generateProblemReason('bot_detection');
      expect(reason).toContain('Bot protection detected');
    });

    it('should include error message when provided', () => {
      const reason = generateProblemReason('extraction_failure', undefined, 'Custom error');
      expect(reason).toContain('Custom error');
    });

    it('should generate reason for each problem type', () => {
      const problemTypes = [
        'bot_detection', 'extraction_failure', 'api_discovery', 'authentication',
        'rate_limiting', 'javascript_required', 'dynamic_content', 'pagination',
        'selector_failure', 'timeout', 'unknown'
      ] as const;

      for (const type of problemTypes) {
        const reason = generateProblemReason(type);
        expect(reason).toBeTruthy();
        expect(reason.length).toBeGreaterThan(10);
      }
    });
  });

  describe('isBlockedByBotDetection', () => {
    it('should detect blocking on 403 with cloudflare', () => {
      const html = '<html>Cloudflare checking browser</html>';
      expect(isBlockedByBotDetection(403, html)).toBe(true);
    });

    it('should detect blocking on 503 with datadome', () => {
      const html = '<html>DataDome protection</html>';
      expect(isBlockedByBotDetection(503, html)).toBe(true);
    });

    it('should detect challenge page on 200', () => {
      const html = '<html>Just a moment... Checking your browser</html>';
      expect(isBlockedByBotDetection(200, html)).toBe(true);
    });

    it('should not flag normal 200 responses', () => {
      const html = '<html><body>Normal content with lots of text and navigation elements</body></html>'.repeat(100);
      expect(isBlockedByBotDetection(200, html)).toBe(false);
    });

    it('should not flag normal 403 without bot protection', () => {
      const html = '<html>Forbidden - You do not have permission</html>';
      expect(isBlockedByBotDetection(403, html)).toBe(false);
    });
  });

  describe('suggestRetryConfig', () => {
    it('should suggest full browser for bot detection', () => {
      const config = suggestRetryConfig('bot_detection');
      expect(config.useFullBrowser).toBe(true);
      expect(config.delayMs).toBeGreaterThan(0);
    });

    it('should suggest timeout increase for timeout problems', () => {
      const config = suggestRetryConfig('timeout');
      expect(config.timeout).toBeGreaterThan(30000);
    });

    it('should suggest scrollToLoad for dynamic content', () => {
      const config = suggestRetryConfig('dynamic_content');
      expect(config.scrollToLoad).toBe(true);
    });

    it('should add extra delay for advanced bot protection', () => {
      const datadomeConfig = suggestRetryConfig('bot_detection', 'datadome');
      expect(datadomeConfig.delayMs).toBeGreaterThan(2000);

      const perimeterxConfig = suggestRetryConfig('bot_detection', 'perimeterx');
      expect(perimeterxConfig.delayMs).toBeGreaterThan(2000);
    });

    it('should suggest retry with backoff for rate limiting', () => {
      const config = suggestRetryConfig('rate_limiting');
      expect(config.delayMs).toBeGreaterThan(0);
    });
  });

  describe('TRUSTED_SOURCES', () => {
    it('should export TRUSTED_SOURCES', () => {
      expect(TRUSTED_SOURCES).toBeDefined();
      expect(Array.isArray(TRUSTED_SOURCES)).toBe(true);
    });

    it('should include common technical sources', () => {
      expect(TRUSTED_SOURCES).toContain('github.com');
      expect(TRUSTED_SOURCES).toContain('stackoverflow.com');
      expect(TRUSTED_SOURCES).toContain('developer.mozilla.org');
    });
  });
});
