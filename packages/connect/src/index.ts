/**
 * Unbrowser Connect SDK
 *
 * JavaScript SDK for B2B SaaS applications to fetch content
 * through their users' browsers.
 */

export { UnbrowserConnect, createConnect } from './connect.js';
export type {
  ConnectConfig,
  ConnectTheme,
  FetchOptions,
  ExtractionOptions,
  FetchProgress,
  FetchResult,
  FetchError,
  ConnectError,
  ConnectErrorCode,
  BatchFetchOptions,
  BatchFetchResult,
} from './types.js';
