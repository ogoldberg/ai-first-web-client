/**
 * HAR (HTTP Archive) Format Types
 *
 * HAR 1.2 specification: http://www.softwareishard.com/blog/har-12-spec/
 */

/**
 * Creator/Browser info
 */
export interface HarCreator {
  name: string;
  version: string;
  comment?: string;
}

/**
 * Page timing info
 */
export interface HarPageTimings {
  onContentLoad?: number;
  onLoad?: number;
  comment?: string;
}

/**
 * Page info
 */
export interface HarPage {
  startedDateTime: string;
  id: string;
  title: string;
  pageTimings: HarPageTimings;
  comment?: string;
}

/**
 * Cookie info
 */
export interface HarCookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  comment?: string;
}

/**
 * Header info
 */
export interface HarHeader {
  name: string;
  value: string;
  comment?: string;
}

/**
 * Query string parameter
 */
export interface HarQueryParam {
  name: string;
  value: string;
  comment?: string;
}

/**
 * POST data parameter
 */
export interface HarPostParam {
  name: string;
  value?: string;
  fileName?: string;
  contentType?: string;
  comment?: string;
}

/**
 * POST data
 */
export interface HarPostData {
  mimeType: string;
  params?: HarPostParam[];
  text?: string;
  comment?: string;
}

/**
 * Request info
 */
export interface HarRequest {
  method: string;
  url: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  queryString: HarQueryParam[];
  postData?: HarPostData;
  headersSize: number;
  bodySize: number;
  comment?: string;
}

/**
 * Response content
 */
export interface HarContent {
  size: number;
  compression?: number;
  mimeType: string;
  text?: string;
  encoding?: string;
  comment?: string;
}

/**
 * Response info
 */
export interface HarResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  content: HarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
  comment?: string;
}

/**
 * Cache state
 */
export interface HarCache {
  beforeRequest?: object;
  afterRequest?: object;
  comment?: string;
}

/**
 * Request timings breakdown
 */
export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  send: number;
  wait: number;
  receive: number;
  ssl?: number;
  comment?: string;
}

/**
 * HAR entry (single request/response)
 */
export interface HarEntry {
  pageref?: string;
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  cache: HarCache;
  timings: HarTimings;
  serverIPAddress?: string;
  connection?: string;
  comment?: string;
}

/**
 * HAR log
 */
export interface HarLog {
  version: string;
  creator: HarCreator;
  browser?: HarCreator;
  pages?: HarPage[];
  entries: HarEntry[];
  comment?: string;
}

/**
 * Root HAR object
 */
export interface Har {
  log: HarLog;
}

/**
 * Options for HAR export
 */
export interface HarExportOptions {
  includeResponseBodies?: boolean;
  maxBodySize?: number;
  pageTitle?: string;
}

/**
 * Result of HAR export
 */
export interface HarExportResult {
  success: boolean;
  har?: Har;
  url: string;
  finalUrl: string;
  title: string;
  entriesCount: number;
  timestamp: string;
  durationMs: number;
  error?: string;
}
