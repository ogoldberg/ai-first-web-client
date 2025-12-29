/**
 * Unbrowser API Server Entry Point
 *
 * Starts the Hono server using Node.js HTTP adapter.
 * Dynamically loads API routes only when not in marketing mode.
 */

import { serve } from '@hono/node-server';
import { app, initializeApiRoutes } from './app.js';

// Catch unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const port = parseInt(process.env.PORT || '3001', 10);
const mode = process.env.UNBROWSER_MODE || 'all';

async function main() {
  console.log(`Starting Unbrowser API server on port ${port}...`);
  console.log(`Server mode: ${mode}`);
  console.log(`Node version: ${process.version}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize API routes (skipped in marketing mode)
  await initializeApiRoutes();

  serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0', // Bind to all interfaces for Railway/Docker
  });

  console.log(`Unbrowser API server running at http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
