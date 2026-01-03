/**
 * Move Ahead Integration Example
 *
 * This example shows how Move Ahead (or similar B2B SaaS applications)
 * would integrate Unbrowser Connect to fetch content through users' browsers.
 *
 * Use Case: Fetching visa requirements from government portals and
 * community experiences from Reddit, all without hitting bot detection.
 */

import { createConnect, type FetchResult, type FetchError } from '@unbrowser/connect';

// Initialize Unbrowser Connect
const connect = createConnect({
  appId: 'move-ahead-prod',
  apiKey: process.env.UNBROWSER_CONNECT_KEY || 'ub_live_example',
  debug: true,
  onReady: () => {
    console.log('Unbrowser Connect is ready');
  },
  onError: (error) => {
    console.error('Connect error:', error);
  },
});

/**
 * Fetch visa requirements from a government portal
 * These typically don't require auth and can use background mode
 */
async function fetchVisaRequirements(countryCode: string): Promise<string | null> {
  // Example: UK government visa page
  const url = `https://www.gov.uk/check-uk-visa/y/${countryCode}`;

  const result = await connect.fetch({
    url,
    mode: 'background', // Hidden iframe - invisible to user
    timeout: 15000,
    extract: {
      text: true,
      markdown: true,
      selectors: {
        title: 'h1',
        requirements: '.govuk-body',
        steps: '.govuk-list--number li',
      },
      usePatterns: true, // Use Unbrowser's learned patterns
    },
    onProgress: (progress) => {
      console.log(`Visa fetch: ${progress.stage} - ${progress.percent}%`);
    },
  });

  if (!result.success) {
    console.error('Failed to fetch visa info:', (result as FetchError).error);
    return null;
  }

  const fetchResult = result as FetchResult;
  return fetchResult.content.markdown || fetchResult.content.text || null;
}

/**
 * Fetch Reddit discussions about relocation experiences
 * This may require auth if user wants to see personalized content
 */
async function fetchRedditExperiences(
  subreddit: string,
  searchQuery: string
): Promise<Array<{ title: string; content: string; url: string }>> {
  const searchUrl = `https://old.reddit.com/r/${subreddit}/search?q=${encodeURIComponent(searchQuery)}&restrict_sr=on&sort=relevance&t=all`;

  const result = await connect.fetch({
    url: searchUrl,
    mode: 'popup', // User sees it, can log in if needed
    requiresAuth: false, // Can view without login
    timeout: 30000,
    authPrompt: 'Please log in to Reddit if you want personalized results',
    extract: {
      selectors: {
        posts: '.thing .title a',
        scores: '.thing .score',
        comments: '.thing .comments',
      },
      usePatterns: true,
    },
    onProgress: (progress) => {
      console.log(`Reddit fetch: ${progress.stage} - ${progress.message}`);
    },
  });

  if (!result.success) {
    console.error('Failed to fetch Reddit:', (result as FetchError).error);
    return [];
  }

  const fetchResult = result as FetchResult;
  const posts = fetchResult.content.selectors?.posts;

  if (!posts || !Array.isArray(posts)) {
    return [];
  }

  return posts.map((title, i) => ({
    title: title as string,
    content: '', // Would need to fetch individual post for full content
    url: `https://reddit.com${title}`, // Simplified - real impl would extract URL
  }));
}

/**
 * Combined workflow: Get both official info and community experiences
 */
async function getRelocationInfo(destination: string, origin: string) {
  console.log(`Fetching relocation info: ${origin} -> ${destination}`);

  // Initialize Connect
  await connect.init();

  // Fetch in parallel
  const [visaInfo, experiences] = await Promise.all([
    fetchVisaRequirements(origin.toLowerCase()),
    fetchRedditExperiences('IWantOut', `${origin} to ${destination}`),
  ]);

  return {
    destination,
    origin,
    officialRequirements: visaInfo,
    communityExperiences: experiences.slice(0, 5), // Top 5
    fetchedAt: new Date().toISOString(),
  };
}

// Example usage
async function main() {
  try {
    const info = await getRelocationInfo('Germany', 'USA');
    console.log('Relocation Info:', JSON.stringify(info, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    connect.destroy();
  }
}

// Run if this is the main module
main();

/**
 * React Hook Example (for frontend integration)
 */
export function useUnbrowserConnect() {
  // In a real React app, this would be a proper hook
  // that manages the connect instance lifecycle

  return {
    fetchVisaRequirements,
    fetchRedditExperiences,
    getRelocationInfo,
  };
}
