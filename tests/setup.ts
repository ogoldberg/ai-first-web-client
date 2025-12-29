/**
 * Test setup file
 *
 * Initializes API routes before tests run.
 * This is needed because app.ts uses dynamic imports for API routes.
 */

import { initializeApiRoutes } from '../packages/api/src/app.js';

// Initialize API routes before any tests run
await initializeApiRoutes();
