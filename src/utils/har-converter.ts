/**
 * HAR Converter Utility
 *
 * Converts NetworkRequest[] to HAR (HTTP Archive) format
 */

import type { NetworkRequest } from '../types/index.js';
import type {
  Har,
  HarLog,
  HarEntry,
  HarRequest,
  HarResponse,
  HarHeader,
  HarQueryParam,
  HarContent,
  HarTimings,
  HarPage,
  HarExportOptions,
} from '../types/har.js';

// Package version for HAR creator info
const PACKAGE_VERSION = '0.5.0';

/**
 * Parse query string from URL
 */
function parseQueryString(url: string): HarQueryParam[] {
  try {
    const urlObj = new URL(url);
    const params: HarQueryParam[] = [];
    urlObj.searchParams.forEach((value, name) => {
      params.push({ name, value });
    });
    return params;
  } catch {
    return [];
  }
}

/**
 * Convert headers object to HAR headers array
 */
function convertHeaders(headers: Record<string, string>): HarHeader[] {
  return Object.entries(headers).map(([name, value]) => ({
    name,
    value,
  }));
}

/**
 * Calculate approximate size of headers
 */
function calculateHeadersSize(headers: Record<string, string>): number {
  let size = 0;
  for (const [name, value] of Object.entries(headers)) {
    // Format: "Name: Value\r\n"
    size += name.length + 2 + value.length + 2;
  }
  return size;
}

/**
 * Convert a single NetworkRequest to HAR entry
 */
function convertToHarEntry(
  request: NetworkRequest,
  pageref: string,
  options: HarExportOptions
): HarEntry {
  const startedDateTime = new Date(request.timestamp).toISOString();
  const duration = request.duration ?? 0;

  // Build request object
  const harRequest: HarRequest = {
    method: request.method,
    url: request.url,
    httpVersion: 'HTTP/1.1', // Assume HTTP/1.1 as we don't have this info
    cookies: [], // We don't capture cookies in NetworkRequest
    headers: convertHeaders(request.requestHeaders),
    queryString: parseQueryString(request.url),
    headersSize: calculateHeadersSize(request.requestHeaders),
    bodySize: -1, // Request body not captured
  };

  // Build response content
  let responseText: string | undefined;
  let responseSize = 0;

  if (options.includeResponseBodies && request.responseBody !== undefined) {
    try {
      if (typeof request.responseBody === 'string') {
        responseText = request.responseBody;
      } else {
        responseText = JSON.stringify(request.responseBody);
      }

      // Apply max body size limit
      if (options.maxBodySize && responseText.length > options.maxBodySize) {
        responseText = responseText.substring(0, options.maxBodySize) +
          '... [truncated]';
      }

      responseSize = responseText.length;
    } catch {
      // Failed to stringify response
    }
  }

  const harContent: HarContent = {
    size: responseSize,
    mimeType: request.contentType || 'text/plain',
    text: responseText,
  };

  // Build response object
  const harResponse: HarResponse = {
    status: request.status,
    statusText: request.statusText,
    httpVersion: 'HTTP/1.1',
    cookies: [],
    headers: convertHeaders(request.headers),
    content: harContent,
    redirectURL: '',
    headersSize: calculateHeadersSize(request.headers),
    bodySize: responseSize,
  };

  // Build timings (simplified - we only have total duration)
  const harTimings: HarTimings = {
    blocked: -1,
    dns: -1,
    connect: -1,
    send: 0,
    wait: Math.max(0, duration - 1),
    receive: 1,
    ssl: -1,
  };

  return {
    pageref,
    startedDateTime,
    time: duration,
    request: harRequest,
    response: harResponse,
    cache: {},
    timings: harTimings,
  };
}

/**
 * Convert NetworkRequest[] to HAR format
 */
export function convertToHar(
  requests: NetworkRequest[],
  options: HarExportOptions = {}
): Har {
  const defaults: Required<HarExportOptions> = {
    includeResponseBodies: true,
    maxBodySize: 1024 * 1024, // 1MB default
    pageTitle: 'Page',
  };

  const opts = { ...defaults, ...options };

  // Find the earliest request timestamp for page start time
  const startTime = requests.length > 0
    ? Math.min(...requests.map(r => r.timestamp))
    : Date.now();

  // Find the latest request end time for page load time
  const endTime = requests.length > 0
    ? Math.max(...requests.map(r => r.timestamp + (r.duration ?? 0)))
    : Date.now();

  const pageId = 'page_1';

  // Create page entry
  const page: HarPage = {
    startedDateTime: new Date(startTime).toISOString(),
    id: pageId,
    title: opts.pageTitle,
    pageTimings: {
      onContentLoad: -1,
      onLoad: endTime - startTime,
    },
  };

  // Convert all requests to entries
  const entries: HarEntry[] = requests.map(req =>
    convertToHarEntry(req, pageId, opts)
  );

  // Sort entries by start time
  entries.sort((a, b) =>
    new Date(a.startedDateTime).getTime() - new Date(b.startedDateTime).getTime()
  );

  // Build HAR log
  const log: HarLog = {
    version: '1.2',
    creator: {
      name: 'llm-browser',
      version: PACKAGE_VERSION,
      comment: 'LLM Browser MCP Server - HAR export',
    },
    pages: [page],
    entries,
  };

  return { log };
}

/**
 * Serialize HAR to JSON string
 */
export function serializeHar(har: Har, pretty: boolean = true): string {
  return JSON.stringify(har, null, pretty ? 2 : 0);
}
