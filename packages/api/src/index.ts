/**
 * Unbrowser API Server Entry Point
 *
 * Starts the Hono server using Node.js HTTP adapter.
 */

import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Starting Unbrowser API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Unbrowser API server running at http://localhost:${port}`);
console.log(`Health check: http://localhost:${port}/health`);
