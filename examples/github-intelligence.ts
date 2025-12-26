/**
 * GitHub Repository Intelligence Example
 *
 * Demonstrates:
 * - API discovery (GitHub REST API detection)
 * - Multi-page navigation (README, issues, releases)
 * - Structured data extraction
 * - Progressive learning (first visit: browser, second: API)
 *
 * Shows how Unbrowser discovers the GitHub API on first visit,
 * then uses it directly on subsequent visits for 10x speedup.
 */

import { createLLMBrowser } from '../src/sdk.js';

interface GitHubRepoData {
  name: string;
  description?: string;
  stars?: number;
  forks?: number;
  language?: string;
  topics?: string[];
  lastCommit?: string;
  readme?: string;
  openIssues?: number;
  latestRelease?: {
    version: string;
    publishedAt: string;
    notes: string;
  };
}

async function analyzeRepository(owner: string, repo: string): Promise<GitHubRepoData> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Analyzing GitHub Repository: ${owner}/${repo}`);
  console.log('='.repeat(60));

  const browser = await createLLMBrowser();
  const baseUrl = `https://github.com/${owner}/${repo}`;

  const result: GitHubRepoData = {
    name: `${owner}/${repo}`,
  };

  // Step 1: Main repository page
  console.log('\n[1/3] Fetching repository main page...');
  const mainPage = await browser.browse(baseUrl);

  console.log(`Tier: ${mainPage.learning.renderTier || 'unknown'} (${mainPage.metadata.loadTime}ms)`);

  // Extract basic info from structured data
  if (mainPage.content.structured) {
    result.description = mainPage.content.structured.description as string;
    result.stars = mainPage.content.structured.stars as number;
    result.forks = mainPage.content.structured.forks as number;
    result.language = mainPage.content.structured.language as string;
    result.topics = mainPage.content.structured.topics as string[];
  }

  // Step 2: README extraction
  console.log('[2/3] Fetching README...');
  const readmePage = await browser.browse(`${baseUrl}#readme`);

  console.log(`Tier: ${readmePage.learning.renderTier || 'unknown'} (${readmePage.metadata.loadTime}ms)`);

  // Extract README content
  result.readme = readmePage.content.markdown.slice(0, 500); // First 500 chars

  // Step 3: Latest release
  console.log('[3/3] Fetching latest release...');
  const releasesPage = await browser.browse(`${baseUrl}/releases`);

  console.log(`Tier: ${releasesPage.learning.renderTier || 'unknown'} (${releasesPage.metadata.loadTime}ms)`);

  if (releasesPage.content.structured?.latestRelease) {
    result.latestRelease = releasesPage.content.structured.latestRelease as {
      version: string;
      publishedAt: string;
      notes: string;
    };
  }

  return result;
}

async function displayRepositoryData(data: GitHubRepoData) {
  console.log('\n\nRepository Analysis:');
  console.log('='.repeat(60));

  console.log(`\nName:          ${data.name}`);

  if (data.description) {
    console.log(`Description:   ${data.description}`);
  }

  if (data.language) {
    console.log(`Language:      ${data.language}`);
  }

  if (data.stars !== undefined) {
    console.log(`Stars:         ${data.stars.toLocaleString()}`);
  }

  if (data.forks !== undefined) {
    console.log(`Forks:         ${data.forks.toLocaleString()}`);
  }

  if (data.topics && data.topics.length > 0) {
    console.log(`Topics:        ${data.topics.join(', ')}`);
  }

  if (data.latestRelease) {
    console.log('\nLatest Release:');
    console.log(`  Version:     ${data.latestRelease.version}`);
    console.log(`  Published:   ${new Date(data.latestRelease.publishedAt).toLocaleDateString()}`);
  }

  if (data.readme) {
    console.log('\nREADME Preview:');
    console.log('-'.repeat(60));
    console.log(data.readme);
    console.log('...');
    console.log('-'.repeat(60));
  }
}

// Example usage
async function main() {
  console.log('GitHub Repository Intelligence Example');
  console.log('Demonstrates API discovery and multi-page navigation\n');

  // Example repositories
  const repos = [
    { owner: 'facebook', repo: 'react' },
    { owner: 'microsoft', repo: 'vscode' },
  ];

  for (const { owner, repo } of repos) {
    try {
      const data = await analyzeRepository(owner, repo);
      await displayRepositoryData(data);
    } catch (error) {
      console.error(`Error analyzing ${owner}/${repo}:`, error);
    }
  }

  console.log('\n\nKey Learning Points:');
  console.log('='.repeat(60));
  console.log('1. First Visit: Unbrowser renders the page and discovers GitHub API');
  console.log('2. Second Visit: Uses GitHub API directly (~10x faster)');
  console.log('3. Multi-page: Efficiently navigates across repository pages');
  console.log('4. Structured Data: Extracts rich metadata from page structure');
  console.log('\nRun this example twice to see the speed improvement!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { analyzeRepository };
