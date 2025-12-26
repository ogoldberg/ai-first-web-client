/**
 * Article Extraction Example
 *
 * Demonstrates Unbrowser's intelligent content extraction capabilities.
 *
 * Features:
 * - Automatic tier selection (intelligence -> lightweight -> playwright)
 * - Clean markdown conversion
 * - Text extraction
 * - Timing and confidence reporting
 *
 * Note: Full article detection (ART-001) is available in ContentIntelligence
 * but not yet exposed in the browse API. This example shows general content
 * extraction which works for any page type.
 */

import { createLLMBrowser } from '../src/sdk.js';

async function extractContent(url: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Extracting content: ${url}`);
  console.log('='.repeat(60));

  const browser = await createLLMBrowser();

  try {
    const result = await browser.browse(url);

    // Display extraction results
    console.log('\nContent Extracted Successfully\n');

    console.log('Page Info:');
    console.log('-'.repeat(60));
    console.log(`Title:         ${result.title}`);
    console.log(`Final URL:     ${result.metadata.finalUrl}`);
    if (result.metadata.language) {
      console.log(`Language:      ${result.metadata.language}`);
    }
    console.log('-'.repeat(60));

    // Display content preview
    console.log('\nContent Preview (first 500 chars):');
    console.log('-'.repeat(60));
    const preview = result.content.text.slice(0, 500);
    console.log(preview);
    if (result.content.text.length > 500) {
      console.log('...');
    }
    console.log('-'.repeat(60));

    // Display markdown preview
    console.log('\nMarkdown Preview (first 300 chars):');
    console.log('-'.repeat(60));
    const mdPreview = result.content.markdown.slice(0, 300);
    console.log(mdPreview);
    if (result.content.markdown.length > 300) {
      console.log('...');
    }
    console.log('-'.repeat(60));

    // Display extraction stats
    console.log('\nExtraction Stats:');
    console.log('-'.repeat(60));
    console.log(`Tier:          ${result.learning.renderTier || 'unknown'}`);
    console.log(`Confidence:    ${result.learning.confidenceLevel}`);
    console.log(`Time:          ${result.metadata.loadTime}ms`);
    console.log(`Text Length:   ${result.content.text.length.toLocaleString()} chars`);
    console.log(`MD Length:     ${result.content.markdown.length.toLocaleString()} chars`);
    console.log('-'.repeat(60));

    // Display discovered APIs if any
    if (result.discoveredApis.length > 0) {
      console.log('\nDiscovered APIs:');
      console.log('-'.repeat(60));
      result.discoveredApis.slice(0, 3).forEach(api => {
        console.log(`  ${api.method} ${api.endpoint} (${api.confidence})`);
      });
      if (result.discoveredApis.length > 3) {
        console.log(`  ... and ${result.discoveredApis.length - 3} more`);
      }
      console.log('-'.repeat(60));
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

// Example usage
async function main() {
  const exampleUrls = [
    'https://news.ycombinator.com/item?id=1',  // Discussion page
    'https://dev.to',                          // Homepage
    // Add more URLs when testing:
    // 'https://example.com/blog/article-title',
  ];

  console.log('Content Extraction Example');
  console.log('Demonstrates intelligent content extraction\n');

  for (const url of exampleUrls) {
    await extractContent(url);
  }

  console.log('\n\nExample complete!');
  console.log('\nKey Learning Points:');
  console.log('1. Unbrowser uses tiered rendering for optimal speed');
  console.log('2. Content is extracted as both text and markdown');
  console.log('3. APIs are automatically discovered for future bypass');
  console.log('4. Confidence levels help gauge extraction quality');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { extractContent };
