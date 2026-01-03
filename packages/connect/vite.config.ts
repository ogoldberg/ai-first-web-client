import { defineConfig } from 'vite';

export default defineConfig({
  root: 'test-page',
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '../dist/index.js': '../src/index.ts',
    },
  },
});
