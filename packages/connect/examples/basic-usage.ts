/**
 * Basic Usage Examples for Unbrowser Connect
 *
 * This file demonstrates the fundamental operations of the Connect SDK:
 * - Initializing the SDK
 * - Fetching content in background mode
 * - Extracting text, markdown, and specific selectors
 * - Handling results and errors
 *
 * Run with: npx tsx examples/basic-usage.ts
 */

import { createConnect, type FetchResult, type FetchError } from '@unbrowser/connect';

// =============================================================================
// Configuration
// =============================================================================

const connect = createConnect({
  appId: 'example-app',
  apiKey: process.env.UNBROWSER_API_KEY || 'ub_test_demo',
  debug: true, // Enable console logging for debugging

  onReady: () => {
    console.log('[Example] SDK is ready');
  },

  onError: (error) => {
    console.error('[Example] SDK error:', error.code, error.message);
  },
});

// =============================================================================
// Helper: Type guard for successful results
// =============================================================================

function isSuccess(result: FetchResult | FetchError): result is FetchResult {
  return result.success === true;
}

// =============================================================================
// Example 1: Simple Text Extraction
// =============================================================================

async function example1_simpleTextExtraction(): Promise<void> {
  console.log('\n=== Example 1: Simple Text Extraction ===\n');

  const result = await connect.fetch({
    url: 'https://example.com',
    mode: 'background',
    extract: {
      text: true,
    },
  });

  if (isSuccess(result)) {
    console.log('URL:', result.url);
    console.log('Title:', result.content.title);
    console.log('Text length:', result.content.text?.length, 'characters');
    console.log('Duration:', result.meta.duration, 'ms');
  } else {
    console.error('Failed:', result.error.code, '-', result.error.message);
  }
}

// =============================================================================
// Example 2: Markdown Extraction
// =============================================================================

async function example2_markdownExtraction(): Promise<void> {
  console.log('\n=== Example 2: Markdown Extraction ===\n');

  const result = await connect.fetch({
    url: 'https://httpbin.org/html',
    mode: 'background',
    extract: {
      markdown: true,
    },
  });

  if (isSuccess(result)) {
    console.log('Markdown content:');
    console.log('---');
    console.log(result.content.markdown?.slice(0, 500) + '...');
    console.log('---');
  } else {
    console.error('Failed:', result.error.code, '-', result.error.message);
  }
}

// =============================================================================
// Example 3: CSS Selector Extraction
// =============================================================================

async function example3_selectorExtraction(): Promise<void> {
  console.log('\n=== Example 3: CSS Selector Extraction ===\n');

  const result = await connect.fetch({
    url: 'https://news.ycombinator.com',
    mode: 'background',
    extract: {
      selectors: {
        // Single element
        siteTitle: '.hnname a',

        // Multiple elements (returns array)
        headlines: '.titleline > a',
        scores: '.score',
        ages: '.age a',
      },
    },
  });

  if (isSuccess(result)) {
    const { selectors } = result.content;

    console.log('Site Title:', selectors?.siteTitle);
    console.log('');

    // Headlines is an array because multiple elements match
    const headlines = selectors?.headlines;
    if (Array.isArray(headlines)) {
      console.log(`Found ${headlines.length} headlines:`);
      headlines.slice(0, 5).forEach((headline, i) => {
        console.log(`  ${i + 1}. ${headline}`);
      });
    }
  } else {
    console.error('Failed:', result.error.code, '-', result.error.message);
  }
}

// =============================================================================
// Example 4: Multiple Extraction Types
// =============================================================================

async function example4_multipleExtractionTypes(): Promise<void> {
  console.log('\n=== Example 4: Multiple Extraction Types ===\n');

  const result = await connect.fetch({
    url: 'https://example.com',
    mode: 'background',
    extract: {
      text: true,
      markdown: true,
      html: true,
      selectors: {
        heading: 'h1',
        paragraphs: 'p',
        links: 'a',
      },
    },
  });

  if (isSuccess(result)) {
    console.log('Content formats available:');
    console.log('  - text:', result.content.text ? 'Yes' : 'No');
    console.log('  - markdown:', result.content.markdown ? 'Yes' : 'No');
    console.log('  - html:', result.content.html ? 'Yes' : 'No');
    console.log('  - selectors:', result.content.selectors ? 'Yes' : 'No');
    console.log('');
    console.log('Heading:', result.content.selectors?.heading);
    console.log('Paragraphs:', result.content.selectors?.paragraphs);
  } else {
    console.error('Failed:', result.error.code, '-', result.error.message);
  }
}

// =============================================================================
// Example 5: Progress Tracking
// =============================================================================

async function example5_progressTracking(): Promise<void> {
  console.log('\n=== Example 5: Progress Tracking ===\n');

  const result = await connect.fetch({
    url: 'https://example.com',
    mode: 'background',
    extract: {
      markdown: true,
    },
    onProgress: (progress) => {
      const bar = '='.repeat(Math.floor(progress.percent / 5));
      const empty = ' '.repeat(20 - bar.length);
      console.log(`[${bar}${empty}] ${progress.percent}% - ${progress.stage}: ${progress.message}`);
    },
  });

  if (isSuccess(result)) {
    console.log('\nFetch completed successfully!');
    console.log('Total duration:', result.meta.duration, 'ms');
  } else {
    console.error('\nFetch failed:', result.error.message);
  }
}

// =============================================================================
// Example 6: Custom Timeout
// =============================================================================

async function example6_customTimeout(): Promise<void> {
  console.log('\n=== Example 6: Custom Timeout ===\n');

  const result = await connect.fetch({
    url: 'https://httpbin.org/delay/2', // Delays 2 seconds
    mode: 'background',
    timeout: 5000, // 5 second timeout (will succeed)
    extract: {
      text: true,
    },
  });

  if (isSuccess(result)) {
    console.log('Request completed within timeout');
    console.log('Duration:', result.meta.duration, 'ms');
  } else {
    console.error('Failed:', result.error.code);
    if (result.error.code === 'TIMEOUT') {
      console.log('Request timed out - consider increasing timeout value');
    }
  }
}

// =============================================================================
// Run All Examples
// =============================================================================

async function main(): Promise<void> {
  console.log('Unbrowser Connect - Basic Usage Examples');
  console.log('========================================');

  try {
    // Initialize the SDK
    await connect.init();

    // Run each example
    await example1_simpleTextExtraction();
    await example2_markdownExtraction();
    await example3_selectorExtraction();
    await example4_multipleExtractionTypes();
    await example5_progressTracking();
    await example6_customTimeout();

    console.log('\n========================================');
    console.log('All examples completed!');
  } catch (error) {
    console.error('Unexpected error:', error);
  } finally {
    // Always cleanup
    connect.destroy();
    console.log('\nSDK destroyed, resources cleaned up.');
  }
}

// Run
main();
