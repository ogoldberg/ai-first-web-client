/**
 * Article Extraction Example
 *
 * Demonstrates Unbrowser's enhanced article detection and metadata extraction (ART-001).
 *
 * Features:
 * - Multi-indicator article detection (6 indicators)
 * - Comprehensive metadata extraction (author, dates, tags)
 * - Clean content isolation
 * - Reading time estimation
 *
 * The article detection system uses multiple indicators:
 * 1. Presence of <article> tag
 * 2. Schema.org Article/NewsArticle/BlogPosting types
 * 3. OpenGraph type="article"
 * 4. Author metadata
 * 5. Publish date
 * 6. Article structure (word count, paragraphs, headings, link density)
 *
 * Requires 3+ indicators to classify as article.
 */

import { createLLMBrowser } from '../sdk/index.js';

async function extractArticle(url: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Extracting article: ${url}`);
  console.log('='.repeat(60));

  const browser = await createLLMBrowser();

  try {
    const result = await browser.browse(url);

    // Check if it's an article
    if (result.article?.isArticle) {
      console.log('\n✓ Detected as article\n');

      // Display article metadata
      console.log('Article Metadata:');
      console.log('-'.repeat(60));

      if (result.article.author) {
        console.log(`Author:        ${result.article.author}`);
      }

      if (result.article.publishDate) {
        console.log(`Published:     ${new Date(result.article.publishDate).toLocaleDateString()}`);
      }

      if (result.article.modifiedDate) {
        console.log(`Modified:      ${new Date(result.article.modifiedDate).toLocaleDateString()}`);
      }

      if (result.article.category) {
        console.log(`Category:      ${result.article.category}`);
      }

      if (result.article.tags && result.article.tags.length > 0) {
        console.log(`Tags:          ${result.article.tags.join(', ')}`);
      }

      if (result.article.wordCount) {
        console.log(`Word Count:    ${result.article.wordCount.toLocaleString()}`);
      }

      if (result.article.readingTimeMinutes) {
        console.log(`Reading Time:  ${result.article.readingTimeMinutes} min`);
      }

      console.log('-'.repeat(60));

      // Display content preview
      console.log('\nContent Preview:');
      console.log('-'.repeat(60));
      const preview = result.article.mainContent || result.content.text;
      const lines = preview.split('\n').slice(0, 10);
      console.log(lines.join('\n'));
      if (preview.split('\n').length > 10) {
        console.log('...');
      }
      console.log('-'.repeat(60));

      // Display extraction strategy
      console.log(`\nStrategy:      ${result.meta.strategy}`);
      console.log(`Confidence:    ${Math.round(result.meta.confidence * 100)}%`);
      console.log(`Time:          ${result.meta.timing.total}ms`);

    } else {
      console.log('\n✗ Not detected as article');
      console.log('This appears to be a general web page, not an article.');
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

// Example usage
async function main() {
  const exampleUrls = [
    'https://news.ycombinator.com/item?id=1',  // Not an article (discussion page)
    'https://dev.to',                          // Not an article (homepage)
    // Add real article URLs when testing:
    // 'https://example.com/blog/article-title',
  ];

  console.log('Article Extraction Example');
  console.log('Demonstrates enhanced article detection (ART-001)\n');

  for (const url of exampleUrls) {
    await extractArticle(url);
  }

  console.log('\n\nExample complete!');
  console.log('\nNext steps:');
  console.log('1. Try with real article URLs from Medium, Dev.to, or blog sites');
  console.log('2. Compare article vs non-article detection accuracy');
  console.log('3. Check metadata extraction completeness');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { extractArticle };
