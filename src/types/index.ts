/**
 * Core types for LLM Browser MCP Server
 */

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  requestHeaders: Record<string, string>;
  responseBody?: any;
  contentType?: string;
  timestamp: number;
  duration?: number;
}

export interface ConsoleMessage {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  timestamp: number;
  location?: {
    url: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export interface BrowseResult {
  url: string;
  title: string;
  content: {
    html: string;
    markdown: string;
    text: string;
  };
  network: NetworkRequest[];
  console: ConsoleMessage[];
  discoveredApis: ApiPattern[];
  metadata: {
    loadTime: number;
    timestamp: number;
    finalUrl: string;
  };
}

export interface ApiPattern {
  endpoint: string;
  method: string;
  confidence: 'high' | 'medium' | 'low';
  canBypass: boolean;
  authType?: 'cookie' | 'bearer' | 'header' | 'session';
  authHeaders?: Record<string, string>;
  responseType?: string;
  params?: Record<string, any>;
  reason?: string;
}

export interface SessionStore {
  domain: string;
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  isAuthenticated: boolean;
  authType?: string;
  lastUsed: number;
  expiresAt?: number;
  username?: string;
}

export interface KnowledgeBaseEntry {
  domain: string;
  patterns: ApiPattern[];
  lastUsed: number;
  usageCount: number;
  successRate: number;
}

export interface BrowseOptions {
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
  captureNetwork?: boolean;
  captureConsole?: boolean;
  sessionProfile?: string;
}

export interface ApiCallOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  inheritAuth?: boolean;
  sessionProfile?: string;
}
