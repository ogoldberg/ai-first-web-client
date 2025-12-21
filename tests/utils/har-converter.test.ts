import { describe, it, expect } from 'vitest';
import { convertToHar, serializeHar } from '../../src/utils/har-converter.js';
import type { NetworkRequest } from '../../src/types/index.js';

describe('HAR Converter', () => {
  describe('convertToHar', () => {
    it('should convert empty request array to valid HAR', () => {
      const requests: NetworkRequest[] = [];

      const har = convertToHar(requests);

      expect(har.log).toBeDefined();
      expect(har.log.version).toBe('1.2');
      expect(har.log.creator.name).toBe('llm-browser');
      expect(har.log.entries).toHaveLength(0);
      expect(har.log.pages).toHaveLength(1);
    });

    it('should convert single request to HAR entry', () => {
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/api/data',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          requestHeaders: { accept: 'application/json' },
          responseBody: { message: 'success' },
          contentType: 'application/json',
          timestamp: 1703179200000, // 2023-12-21T20:00:00.000Z
          duration: 150,
        },
      ];

      const har = convertToHar(requests);

      expect(har.log.entries).toHaveLength(1);
      const entry = har.log.entries[0];

      // Check request
      expect(entry.request.method).toBe('GET');
      expect(entry.request.url).toBe('https://example.com/api/data');
      expect(entry.request.headers).toContainEqual({ name: 'accept', value: 'application/json' });

      // Check response
      expect(entry.response.status).toBe(200);
      expect(entry.response.statusText).toBe('OK');
      expect(entry.response.headers).toContainEqual({ name: 'content-type', value: 'application/json' });

      // Check timing
      expect(entry.time).toBe(150);
    });

    it('should include response body when includeResponseBodies is true', () => {
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/api/data',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          responseBody: { data: 'test' },
          contentType: 'application/json',
          timestamp: Date.now(),
          duration: 100,
        },
      ];

      const har = convertToHar(requests, { includeResponseBodies: true });

      expect(har.log.entries[0].response.content.text).toBe('{"data":"test"}');
    });

    it('should exclude response body when includeResponseBodies is false', () => {
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/api/data',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          responseBody: { data: 'test' },
          contentType: 'application/json',
          timestamp: Date.now(),
          duration: 100,
        },
      ];

      const har = convertToHar(requests, { includeResponseBodies: false });

      expect(har.log.entries[0].response.content.text).toBeUndefined();
    });

    it('should truncate response body when exceeding maxBodySize', () => {
      const largeBody = 'x'.repeat(1000);
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/api/data',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          responseBody: largeBody,
          contentType: 'text/plain',
          timestamp: Date.now(),
          duration: 100,
        },
      ];

      const har = convertToHar(requests, { includeResponseBodies: true, maxBodySize: 100 });

      expect(har.log.entries[0].response.content.text).toContain('... [truncated]');
      expect(har.log.entries[0].response.content.text!.length).toBeLessThan(1000);
    });

    it('should parse query string from URL', () => {
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/search?q=test&page=1&sort=desc',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          timestamp: Date.now(),
          duration: 100,
        },
      ];

      const har = convertToHar(requests);

      const queryString = har.log.entries[0].request.queryString;
      expect(queryString).toContainEqual({ name: 'q', value: 'test' });
      expect(queryString).toContainEqual({ name: 'page', value: '1' });
      expect(queryString).toContainEqual({ name: 'sort', value: 'desc' });
    });

    it('should set custom page title', () => {
      const requests: NetworkRequest[] = [];

      const har = convertToHar(requests, { pageTitle: 'My Custom Page' });

      expect(har.log.pages![0].title).toBe('My Custom Page');
    });

    it('should sort entries by start time', () => {
      const baseTime = Date.now();
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/third',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          timestamp: baseTime + 200,
          duration: 50,
        },
        {
          url: 'https://example.com/first',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          timestamp: baseTime,
          duration: 50,
        },
        {
          url: 'https://example.com/second',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          timestamp: baseTime + 100,
          duration: 50,
        },
      ];

      const har = convertToHar(requests);

      expect(har.log.entries[0].request.url).toBe('https://example.com/first');
      expect(har.log.entries[1].request.url).toBe('https://example.com/second');
      expect(har.log.entries[2].request.url).toBe('https://example.com/third');
    });

    it('should handle multiple requests', () => {
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/page',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html' },
          requestHeaders: {},
          timestamp: Date.now(),
          duration: 300,
        },
        {
          url: 'https://example.com/style.css',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/css' },
          requestHeaders: {},
          timestamp: Date.now() + 50,
          duration: 100,
        },
        {
          url: 'https://example.com/script.js',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/javascript' },
          requestHeaders: {},
          timestamp: Date.now() + 100,
          duration: 150,
        },
      ];

      const har = convertToHar(requests);

      expect(har.log.entries).toHaveLength(3);
    });

    it('should handle POST request with different status codes', () => {
      const requests: NetworkRequest[] = [
        {
          url: 'https://api.example.com/users',
          method: 'POST',
          status: 201,
          statusText: 'Created',
          headers: { 'content-type': 'application/json' },
          requestHeaders: { 'content-type': 'application/json' },
          responseBody: { id: 123, name: 'New User' },
          contentType: 'application/json',
          timestamp: Date.now(),
          duration: 200,
        },
      ];

      const har = convertToHar(requests);
      const entry = har.log.entries[0];

      expect(entry.request.method).toBe('POST');
      expect(entry.response.status).toBe(201);
      expect(entry.response.statusText).toBe('Created');
    });

    it('should handle request with missing optional fields', () => {
      const requests: NetworkRequest[] = [
        {
          url: 'https://example.com/api',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          requestHeaders: {},
          timestamp: Date.now(),
          // No duration, responseBody, contentType
        },
      ];

      const har = convertToHar(requests);

      expect(har.log.entries).toHaveLength(1);
      expect(har.log.entries[0].time).toBe(0);
      expect(har.log.entries[0].response.content.mimeType).toBe('text/plain');
    });
  });

  describe('serializeHar', () => {
    it('should serialize HAR to JSON string with pretty printing', () => {
      const har = convertToHar([]);

      const json = serializeHar(har, true);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
      expect(JSON.parse(json)).toEqual(har);
    });

    it('should serialize HAR to compact JSON string', () => {
      const har = convertToHar([]);

      const json = serializeHar(har, false);

      expect(json).not.toContain('\n');
      expect(JSON.parse(json)).toEqual(har);
    });
  });
});
