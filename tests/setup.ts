/**
 * Test setup file
 *
 * Initializes API routes before tests run.
 * This is needed because app.ts uses dynamic imports for API routes.
 */

// Polyfill globals for Node.js (needed by undici and other packages in Node 22+)
import { File, Blob } from 'node:buffer';
import { webcrypto } from 'node:crypto';

if (typeof globalThis.File === 'undefined') {
  // @ts-expect-error - File exists in node:buffer but globalThis types don't include it
  globalThis.File = File;
}
if (typeof globalThis.Blob === 'undefined') {
  // @ts-expect-error - Blob exists in node:buffer but globalThis types don't include it
  globalThis.Blob = Blob;
}
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error - webcrypto API compatible with globalThis.crypto
  globalThis.crypto = webcrypto;
}

import { initializeApiRoutes } from '../packages/api/src/app.js';

// Initialize API routes before any tests run
await initializeApiRoutes();
