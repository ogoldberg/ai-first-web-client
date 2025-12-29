/**
 * Unbrowser API Server Entry Point
 *
 * Starts the Hono server using Node.js HTTP adapter.
 */

import { serve } from '@hono/node-server';
import { app } from './app.js';

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const port = parseInt(process.env.PORT || '3001', 10);
const mode = process.env.UNBROWSER_MODE || 'all';

console.log(`Starting Unbrowser API server on port ${port}...`);
console.log(`Server mode: ${mode}`);
console.log(`Node version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0', // Bind to all interfaces for Railway/Docker
});

console.log(`Unbrowser API server running at http://localhost:${port}`);
console.log(`Health check: http://localhost:${port}/health`);
