/**
 * Geographic Routing Tests (FEAT-006)
 *
 * Tests for intelligent geographic proxy selection and region restriction detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeoRoutingService, resetGeoRoutingService } from '../src/services/geo-routing-service.js';
import { GeoRestrictionDetector, resetGeoRestrictionDetector } from '../src/services/geo-restriction-detector.js';
import type { GeoRoutingRequest, GeoRoutingResult, HttpResponse } from '../src/services/geo-routing-types.js';

describe('FEAT-006: Geographic Routing', () => {
  let service: GeoRoutingService;
  let detector: GeoRestrictionDetector;

  beforeEach(() => {
    resetGeoRoutingService();
    resetGeoRestrictionDetector();
    service = new GeoRoutingService();
    detector = new GeoRestrictionDetector();
  });

  describe('GeoRestrictionDetector', () => {
    describe('HTTP Status Code Detection', () => {
      it('should detect 451 status as geo-block', () => {
        const response: HttpResponse = {
          url: 'https://example.com/video',
          statusCode: 451,
          headers: {},
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.confidence).toBe('high');
        expect(result.reason).toBe('compliance');
      });

      it('should detect 403 status as potential geo-block', () => {
        const response: HttpResponse = {
          url: 'https://example.com/content',
          statusCode: 403,
          headers: {},
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.confidence).toBe('medium');
        expect(result.reason).toBe('geo-block');
      });

      it('should not detect 200 status as geo-block', () => {
        const response: HttpResponse = {
          url: 'https://example.com/page',
          statusCode: 200,
          headers: {},
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(false);
      });
    });

    describe('Content Pattern Detection', () => {
      it('should detect geo-block messages in content', () => {
        const response: HttpResponse = {
          url: 'https://example.com/video',
          statusCode: 200,
          headers: {},
          body: '<html><body>This content is not available in your region.</body></html>',
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.confidence).toBe('high');
        expect(result.reason).toBe('geo-block');
      });

      it('should detect licensing restrictions', () => {
        const response: HttpResponse = {
          url: 'https://streaming.com/video',
          statusCode: 200,
          headers: {},
          body: 'Due to licensing restrictions, this video is not available.',
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.reason).toBe('license');
      });

      it('should detect GDPR compliance messages', () => {
        const response: HttpResponse = {
          url: 'https://news.com/article',
          statusCode: 200,
          headers: {},
          body: 'We noticed you are in the EU. Due to GDPR, this content is restricted.',
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.reason).toBe('compliance');
      });
    });

    describe('URL Pattern Detection', () => {
      it('should detect geo-block in URL', () => {
        const response: HttpResponse = {
          url: 'https://example.com/geo-blocked',
          statusCode: 200,
          headers: {},
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.reason).toBe('geo-block');
      });

      it('should detect "not available" in URL', () => {
        const response: HttpResponse = {
          url: 'https://example.com/not-available-in-your-region',
          statusCode: 200,
          headers: {},
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.reason).toBe('content-unavailable');
      });
    });

    describe('Header Detection', () => {
      it('should detect geo-restriction headers', () => {
        const response: HttpResponse = {
          url: 'https://example.com/content',
          statusCode: 200,
          headers: {
            'X-Geo-Restricted': 'true',
          },
        };

        const result = detector.detect(response);

        expect(result.detected).toBe(true);
        expect(result.confidence).toBe('high');
      });
    });
  });

  describe('GeoRoutingService', () => {
    describe('Auto Strategy', () => {
      it('should use TLD hint when no learned preference', () => {
        const request: GeoRoutingRequest = {
          domain: 'bbc.co.uk',
          url: 'https://bbc.co.uk/news',
          strategy: 'auto',
        };

        const recommendation = service.getRecommendation(request);

        expect(recommendation.country).toBe('gb');
        expect(recommendation.strategyUsed).toBe('auto');
        expect(recommendation.confidence).toBe('medium');
        expect(recommendation.reason).toContain('TLD');
      });

      it('should use user preference when provided', () => {
        const request: GeoRoutingRequest = {
          domain: 'example.com',
          url: 'https://example.com/page',
          preferredCountry: 'fr',
          strategy: 'auto',
        };

        const recommendation = service.getRecommendation(request);

        expect(recommendation.country).toBe('fr');
        expect(recommendation.reason).toContain('User preference');
      });

      it('should use learned preference over TLD hint', () => {
        const domain = 'bbc.co.uk';

        // Simulate successful requests from US
        for (let i = 0; i < 10; i++) {
          const result: GeoRoutingResult = {
            success: true,
            country: 'us',
            restrictionDetected: false,
            responseTime: 100,
            shouldRecord: true,
          };
          service.recordResult(domain, result);
        }

        const request: GeoRoutingRequest = {
          domain,
          url: 'https://bbc.co.uk/news',
          strategy: 'auto',
        };

        const recommendation = service.getRecommendation(request);

        expect(recommendation.country).toBe('us');
        expect(recommendation.learnedPreference).toBe(true);
        expect(recommendation.reason).toContain('Learned preference');
      });

      it('should default to US when no hints available', () => {
        const request: GeoRoutingRequest = {
          domain: 'example.com',
          url: 'https://example.com/page',
          strategy: 'auto',
        };

        const recommendation = service.getRecommendation(request);

        expect(recommendation.country).toBe('us');
        expect(recommendation.confidence).toBe('low');
        expect(recommendation.reason).toContain('Default');
      });
    });

    describe('Match Target Strategy', () => {
      it('should match .co.uk to GB', () => {
        const request: GeoRoutingRequest = {
          domain: 'example.co.uk',
          url: 'https://example.co.uk/page',
          strategy: 'match-target',
        };

        const recommendation = service.getRecommendation(request);

        expect(recommendation.country).toBe('gb');
        expect(recommendation.strategyUsed).toBe('match-target');
      });

      it('should match .de to Germany', () => {
        const request: GeoRoutingRequest = {
          domain: 'example.de',
          url: 'https://example.de/page',
          strategy: 'match-target',
        };

        const recommendation = service.getRecommendation(request);

        expect(recommendation.country).toBe('de');
      });
    });

    describe('Fallback Chain Strategy', () => {
      it('should build extensive fallback list', () => {
        const request: GeoRoutingRequest = {
          domain: 'example.com',
          url: 'https://example.com/page',
          strategy: 'fallback-chain',
        };

        const recommendation = service.getRecommendation(request);

        expect(recommendation.country).toBe('us');
        expect(recommendation.fallbacks.length).toBeGreaterThan(3);
        expect(recommendation.strategyUsed).toBe('fallback-chain');
      });
    });

    describe('Learning and Recording', () => {
      it('should record successful results', () => {
        const domain = 'example.com';
        const result: GeoRoutingResult = {
          success: true,
          country: 'gb',
          restrictionDetected: false,
          responseTime: 150,
          shouldRecord: true,
        };

        service.recordResult(domain, result);

        const pref = service.getPreference(domain);
        expect(pref).toBeDefined();
        expect(pref?.domain).toBe(domain);
        expect(pref?.preferredCountries.length).toBe(1);
        expect(pref?.preferredCountries[0].country).toBe('gb');
        expect(pref?.preferredCountries[0].successRate).toBeGreaterThan(0);
      });

      it('should track success rates correctly', () => {
        const domain = 'example.com';

        // 8 successful US requests
        for (let i = 0; i < 8; i++) {
          service.recordResult(domain, {
            success: true,
            country: 'us',
            restrictionDetected: false,
            responseTime: 100,
            shouldRecord: true,
          });
        }

        // 2 failed US requests
        for (let i = 0; i < 2; i++) {
          service.recordResult(domain, {
            success: false,
            country: 'us',
            restrictionDetected: false,
            responseTime: 100,
            shouldRecord: true,
          });
        }

        const pref = service.getPreference(domain);
        expect(pref?.preferredCountries[0].totalAttempts).toBe(10);
        // Success rate should be 80% (8 successes out of 10 attempts)
        expect(pref?.preferredCountries[0].successRate).toBeCloseTo(0.8, 1);
      });

      it('should detect and record region restrictions', () => {
        const domain = 'streaming.com';
        const result: GeoRoutingResult = {
          success: false,
          country: 'us',
          restrictionDetected: true,
          restriction: {
            detected: true,
            confidence: 'high',
            reason: 'geo-block',
            message: 'Not available in your region',
          },
          responseTime: 200,
          shouldRecord: true,
        };

        service.recordResult(domain, result);

        const pref = service.getPreference(domain);
        expect(pref?.restrictions?.blockedCountries).toContain('us');
      });

      it('should update statistics correctly', () => {
        const domain1 = 'example1.com';
        const domain2 = 'example2.com';

        service.recordResult(domain1, {
          success: true,
          country: 'us',
          restrictionDetected: false,
          responseTime: 100,
          shouldRecord: true,
        });

        service.recordResult(domain2, {
          success: false,
          country: 'gb',
          restrictionDetected: true,
          responseTime: 150,
          shouldRecord: true,
        });

        const stats = service.getStats();
        expect(stats.totalRequests).toBe(2);
        expect(stats.requestsByCountry.us).toBe(1);
        expect(stats.requestsByCountry.gb).toBe(1);
        expect(stats.successByCountry.us).toBe(1);
        expect(stats.restrictionsDetected).toBe(1);
        expect(stats.domainsWithPreferences).toBe(2);
      });

      it('should sort countries by success rate', () => {
        const domain = 'example.com';

        // US: 90% success
        for (let i = 0; i < 9; i++) {
          service.recordResult(domain, { success: true, country: 'us', restrictionDetected: false, responseTime: 100, shouldRecord: true });
        }
        service.recordResult(domain, { success: false, country: 'us', restrictionDetected: false, responseTime: 100, shouldRecord: true });

        // GB: 60% success
        for (let i = 0; i < 6; i++) {
          service.recordResult(domain, { success: true, country: 'gb', restrictionDetected: false, responseTime: 100, shouldRecord: true });
        }
        for (let i = 0; i < 4; i++) {
          service.recordResult(domain, { success: false, country: 'gb', restrictionDetected: false, responseTime: 100, shouldRecord: true });
        }

        const pref = service.getPreference(domain);
        expect(pref?.preferredCountries[0].country).toBe('us'); // Higher success rate first
        expect(pref?.preferredCountries[1].country).toBe('gb');
      });
    });

    describe('Confidence Calculation', () => {
      it('should have low confidence with few samples', () => {
        const domain = 'example.com';
        service.recordResult(domain, { success: true, country: 'us', restrictionDetected: false, responseTime: 100, shouldRecord: true });

        const pref = service.getPreference(domain);
        expect(pref?.confidence).toBe('low');
        expect(pref?.sampleSize).toBe(1);
      });

      it('should have medium confidence with moderate samples', () => {
        const domain = 'example.com';
        for (let i = 0; i < 7; i++) {
          service.recordResult(domain, { success: true, country: 'us', restrictionDetected: false, responseTime: 100, shouldRecord: true });
        }

        const pref = service.getPreference(domain);
        expect(pref?.confidence).toBe('medium');
      });

      it('should have high confidence with many samples', () => {
        const domain = 'example.com';
        for (let i = 0; i < 25; i++) {
          service.recordResult(domain, { success: true, country: 'us', restrictionDetected: false, responseTime: 100, shouldRecord: true });
        }

        const pref = service.getPreference(domain);
        expect(pref?.confidence).toBe('high');
      });
    });
  });
});
