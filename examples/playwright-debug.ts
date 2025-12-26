/**
 * Playwright Debug Mode Example (PLAY-001)
 *
 * Demonstrates visual debugging capabilities:
 * - Visible browser window
 * - Slow motion delays
 * - Screenshot capture after actions
 * - Console log collection
 * - Action trace with timing
 *
 * Useful for:
 * - Understanding what Playwright is doing
 * - Teaching/demo purposes
 * - Debugging complex page interactions
 * - Verifying skill execution
 */

import { createLLMBrowser } from '../src/sdk.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function debugBrowse(url: string, options: {
  visible?: boolean;
  slowMotion?: number;
  screenshots?: boolean;
  consoleLogs?: boolean;
} = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Debug Browse: ${url}`);
  console.log('='.repeat(60));

  const browser = await createLLMBrowser();

  // Enable debug mode
  const result = await browser.browse(url, {
    debug: {
      visible: options.visible ?? true,
      slowMotion: options.slowMotion ?? 150,
      screenshots: options.screenshots ?? true,
      consoleLogs: options.consoleLogs ?? true,
    },
    // Force Playwright tier to see debug output
    maxCostTier: 'playwright',
  });

  console.log(`\nTier: ${result.learning.renderTier || 'unknown'}`);
  console.log(`Time: ${result.metadata.loadTime}ms`);

  // Display debug data if available
  if (result.debug) {
    console.log('\n' + '-'.repeat(60));
    console.log('Debug Information:');
    console.log('-'.repeat(60));

    // Action trace
    if (result.debug.actionTrace.length > 0) {
      console.log('\nAction Trace:');
      result.debug.actionTrace.forEach((trace, i) => {
        const status = trace.success ? '✓' : '✗';
        console.log(
          `  ${i + 1}. ${status} ${trace.action} (${trace.duration}ms)`
        );
        if (trace.error) {
          console.log(`     Error: ${trace.error}`);
        }
      });
    }

    // Console logs
    if (result.debug.consoleLogs.length > 0) {
      console.log('\nConsole Logs:');
      result.debug.consoleLogs.forEach(log => {
        const emoji = {
          log: '📝',
          warn: '⚠️',
          error: '❌',
          info: 'ℹ️',
          debug: '🔍',
        };
        console.log(`  ${emoji[log.type]} [${log.type}] ${log.message}`);
      });
    }

    // Screenshots
    if (result.debug.screenshots.length > 0) {
      console.log(`\nScreenshots: ${result.debug.screenshots.length} captured`);

      // Save screenshots to files
      const outputDir = path.join(process.cwd(), 'debug-screenshots');
      await fs.mkdir(outputDir, { recursive: true });

      for (let i = 0; i < result.debug.screenshots.length; i++) {
        const screenshot = result.debug.screenshots[i];
        const filename = `${i + 1}-${screenshot.action.replace(/[^a-z0-9]/gi, '-')}.png`;
        const filepath = path.join(outputDir, filename);

        // Decode base64 and save
        const buffer = Buffer.from(screenshot.image, 'base64');
        await fs.writeFile(filepath, buffer);

        console.log(`  ${i + 1}. ${screenshot.action} → ${filename}`);
      }

      console.log(`\nScreenshots saved to: ${outputDir}`);
    }

    console.log('-'.repeat(60));
  } else {
    console.log('\n⚠️  No debug data available (may not have used Playwright tier)');
  }

  // Content preview
  console.log('\nContent Preview:');
  console.log('-'.repeat(60));
  const preview = result.content.text.slice(0, 300);
  console.log(preview);
  if (result.content.text.length > 300) {
    console.log('...');
  }
  console.log('-'.repeat(60));

  return result;
}

// Example usage
async function main() {
  console.log('Playwright Debug Mode Example (PLAY-001)');
  console.log('Demonstrates visual debugging with screenshots and traces\n');

  const exampleUrls = [
    'https://example.com',
    // Add more URLs to test different page types
  ];

  for (const url of exampleUrls) {
    try {
      await debugBrowse(url, {
        visible: true,         // Show browser window
        slowMotion: 150,       // 150ms delay between actions
        screenshots: true,     // Capture screenshots
        consoleLogs: true,     // Collect console logs
      });
    } catch (error) {
      console.error(`Error debugging ${url}:`, error);
    }
  }

  console.log('\n\nKey Learning Points:');
  console.log('='.repeat(60));
  console.log('1. Visible Browser: Watch Playwright navigate in real-time');
  console.log('2. Slow Motion: See each action with configurable delay');
  console.log('3. Screenshots: Capture visual state after each action');
  console.log('4. Console Logs: See JavaScript errors and warnings');
  console.log('5. Action Trace: Track timing and success of each step');
  console.log('\nUseful for teaching, debugging, and verifying automation!');

  console.log('\n\nDebug Options:');
  console.log('-'.repeat(60));
  console.log('visible: true         - Show browser window (headless: false)');
  console.log('slowMotion: 150       - 150ms delay between actions');
  console.log('screenshots: true     - Capture screenshots after actions');
  console.log('consoleLogs: true     - Collect browser console output');
  console.log('\nAdjust these options based on your debugging needs!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { debugBrowse };
