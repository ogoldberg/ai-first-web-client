/**
 * Authentication Flow Examples for Unbrowser Connect
 *
 * This file demonstrates how to handle authenticated content:
 * - Using popup mode for login-required pages
 * - Configuring auth prompts
 * - Handling user cancellation
 * - Managing authenticated sessions
 *
 * Run with: npx tsx examples/auth-flow.ts
 */

import { createConnect, type FetchResult, type FetchError } from '@unbrowser/connect';

// =============================================================================
// Configuration with UI Components
// =============================================================================

const connect = createConnect({
  appId: 'auth-example-app',
  apiKey: process.env.UNBROWSER_API_KEY || 'ub_test_demo',
  debug: true,

  // Enable built-in UI for better user experience
  ui: {
    showProgress: true,
    showErrors: true,
    errorDuration: 5000,
  },

  // Custom theme to match your brand
  theme: {
    primaryColor: '#2563eb',
    backgroundColor: '#ffffff',
    textColor: '#1e293b',
    borderRadius: '8px',
    fontFamily: '"Inter", system-ui, sans-serif',
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

function isSuccess(result: FetchResult | FetchError): result is FetchResult {
  return result.success === true;
}

function formatError(result: FetchError): string {
  return `${result.error.code}: ${result.error.message}`;
}

// =============================================================================
// Example 1: Basic Popup Authentication
// =============================================================================

/**
 * Fetches content that requires user login.
 * Opens a popup where the user can authenticate.
 */
async function example1_basicPopupAuth(): Promise<void> {
  console.log('\n=== Example 1: Basic Popup Authentication ===\n');
  console.log('This will open a popup for the user to log in...');

  const result = await connect.fetch({
    url: 'https://old.reddit.com/r/programming',
    mode: 'popup', // Opens in visible popup window
    extract: {
      markdown: true,
      selectors: {
        posts: '.thing .title a',
        username: '.user', // Will show if logged in
      },
    },
    onProgress: (progress) => {
      console.log(`Progress: ${progress.stage} - ${progress.message}`);
    },
  });

  if (isSuccess(result)) {
    console.log('\nContent fetched successfully!');
    console.log('Posts found:', Array.isArray(result.content.selectors?.posts)
      ? result.content.selectors.posts.length
      : 0);
  } else {
    console.error('Failed:', formatError(result));
  }
}

// =============================================================================
// Example 2: Custom Auth Prompt
// =============================================================================

/**
 * Shows a custom auth prompt before opening the popup.
 * Gives users context about why they need to sign in.
 */
async function example2_customAuthPrompt(): Promise<void> {
  console.log('\n=== Example 2: Custom Auth Prompt ===\n');

  const result = await connect.fetch({
    url: 'https://github.com/notifications',
    mode: 'popup',
    requiresAuth: true, // Explicitly mark as requiring auth

    // Custom auth prompt configuration
    ui: {
      authPrompt: {
        title: 'GitHub Login Required',
        message: 'To fetch your notifications, please sign in to your GitHub account. A popup window will open for you to authenticate securely.',
        buttonText: 'Sign In to GitHub',
        cancelText: 'Maybe Later',
        showCancel: true,
      },
    },

    extract: {
      selectors: {
        notifications: '.notification-list-item',
        unreadCount: '.notification-indicator',
      },
    },

    onProgress: (progress) => {
      if (progress.stage === 'waiting_auth') {
        console.log('Waiting for user to complete GitHub login...');
      } else {
        console.log(`${progress.stage}: ${progress.percent}%`);
      }
    },
  });

  if (isSuccess(result)) {
    console.log('\nGitHub notifications fetched!');
  } else {
    if (result.error.code === 'USER_CANCELLED') {
      console.log('\nUser chose not to sign in - that is OK!');
    } else {
      console.error('Failed:', formatError(result));
    }
  }
}

// =============================================================================
// Example 3: Handling User Cancellation Gracefully
// =============================================================================

/**
 * Demonstrates proper handling when user cancels authentication.
 */
async function example3_handleCancellation(): Promise<void> {
  console.log('\n=== Example 3: Handling User Cancellation ===\n');

  const result = await connect.fetch({
    url: 'https://linkedin.com/feed',
    mode: 'popup',
    ui: {
      authPrompt: {
        title: 'LinkedIn Sign In',
        message: 'Sign in to view your LinkedIn feed.',
        showCancel: true,
      },
    },
    extract: {
      markdown: true,
    },
  });

  if (isSuccess(result)) {
    console.log('Feed content retrieved!');
    return;
  }

  // Handle specific error cases
  switch (result.error.code) {
    case 'USER_CANCELLED':
      console.log('User cancelled - showing fallback content or message');
      // In a real app, you might:
      // - Show a message explaining what they are missing
      // - Offer to try again later
      // - Show public/preview content instead
      break;

    case 'POPUP_BLOCKED':
      console.log('Popup was blocked by browser');
      console.log('Suggestion: Ask user to allow popups for your domain');
      break;

    case 'POPUP_CLOSED':
      console.log('User closed the popup before completing login');
      console.log('Suggestion: Offer to try again');
      break;

    case 'TIMEOUT':
      console.log('Request timed out');
      console.log('Suggestion: User may still be logging in - offer retry');
      break;

    default:
      console.error('Unexpected error:', formatError(result));
  }
}

// =============================================================================
// Example 4: Background Mode with Auth Fallback
// =============================================================================

/**
 * Tries background mode first, falls back to popup if auth is needed.
 * This is the recommended pattern for mixed content.
 */
async function example4_backgroundWithAuthFallback(): Promise<void> {
  console.log('\n=== Example 4: Background with Auth Fallback ===\n');

  // First, try background mode (fastest, invisible)
  console.log('Attempting background fetch...');

  let result = await connect.fetch({
    url: 'https://twitter.com/home',
    mode: 'background',
    extract: {
      markdown: true,
      selectors: {
        tweets: '[data-testid="tweet"]',
      },
    },
  });

  // Check if we got a login page or redirect
  if (isSuccess(result)) {
    const content = result.content.text || result.content.markdown || '';
    const isLoginPage = content.toLowerCase().includes('sign in') ||
                        content.toLowerCase().includes('log in');

    if (isLoginPage) {
      console.log('Got login page - need to authenticate');

      // Retry with popup mode
      result = await connect.fetch({
        url: 'https://twitter.com/home',
        mode: 'popup',
        ui: {
          authPrompt: {
            title: 'Sign in to Twitter',
            message: 'Please sign in to view your timeline.',
          },
        },
        extract: {
          markdown: true,
          selectors: {
            tweets: '[data-testid="tweet"]',
          },
        },
      });
    }
  }

  // Also handle iframe blocked scenario
  if (!result.success && result.error.code === 'IFRAME_BLOCKED') {
    console.log('Iframe blocked, escalating to popup...');
    // Note: Connect does this automatically, but you can handle it explicitly
  }

  if (isSuccess(result)) {
    console.log('Successfully fetched authenticated content!');
  } else {
    console.error('Failed:', formatError(result));
  }
}

// =============================================================================
// Example 5: Multi-Site Authentication
// =============================================================================

/**
 * Fetches from multiple sites that may require different auth.
 */
async function example5_multiSiteAuth(): Promise<void> {
  console.log('\n=== Example 5: Multi-Site Authentication ===\n');

  const sites = [
    {
      name: 'GitHub',
      url: 'https://github.com/notifications',
      authPrompt: {
        title: 'GitHub Sign In',
        message: 'Sign in to GitHub to view notifications.',
      },
    },
    {
      name: 'Reddit',
      url: 'https://old.reddit.com/message/inbox',
      authPrompt: {
        title: 'Reddit Sign In',
        message: 'Sign in to Reddit to view messages.',
      },
    },
    {
      name: 'Twitter',
      url: 'https://twitter.com/notifications',
      authPrompt: {
        title: 'Twitter Sign In',
        message: 'Sign in to Twitter to view notifications.',
      },
    },
  ];

  const results: Array<{ name: string; success: boolean; error?: string }> = [];

  for (const site of sites) {
    console.log(`\nFetching ${site.name}...`);

    const result = await connect.fetch({
      url: site.url,
      mode: 'popup',
      ui: {
        authPrompt: site.authPrompt,
      },
      extract: {
        markdown: true,
      },
      timeout: 60000, // Longer timeout for auth flows
    });

    if (isSuccess(result)) {
      results.push({ name: site.name, success: true });
      console.log(`  ${site.name}: Success!`);
    } else {
      results.push({
        name: site.name,
        success: false,
        error: result.error.code,
      });
      console.log(`  ${site.name}: Failed (${result.error.code})`);
    }
  }

  console.log('\n--- Summary ---');
  const successful = results.filter(r => r.success).length;
  console.log(`Completed: ${successful}/${sites.length} sites`);
}

// =============================================================================
// Example 6: OAuth-Style Integration Pattern
// =============================================================================

/**
 * Demonstrates a typical OAuth-style integration where you:
 * 1. Check if user is already authenticated
 * 2. If not, prompt for auth
 * 3. Fetch and cache authenticated content
 */
async function example6_oauthStyleIntegration(): Promise<void> {
  console.log('\n=== Example 6: OAuth-Style Integration ===\n');

  interface UserSession {
    authenticated: boolean;
    lastFetch?: string;
  }

  // Simulated session state (in real app, use localStorage or state management)
  const session: UserSession = { authenticated: false };

  async function fetchWithSession(url: string): Promise<FetchResult | null> {
    // First, try to fetch to see if already authenticated
    const testResult = await connect.fetch({
      url,
      mode: 'background',
      timeout: 10000,
      extract: { text: true },
    });

    if (isSuccess(testResult)) {
      // Check if we got actual content vs login page
      const hasContent = testResult.content.text &&
                         testResult.content.text.length > 500 &&
                         !testResult.content.text.toLowerCase().includes('sign in');

      if (hasContent) {
        console.log('Already authenticated - using cached session');
        session.authenticated = true;
        return testResult;
      }
    }

    // Need to authenticate
    console.log('Authentication required...');

    const authResult = await connect.fetch({
      url,
      mode: 'popup',
      ui: {
        authPrompt: {
          title: 'Sign In Required',
          message: 'Please sign in to continue. Your session will be remembered.',
          buttonText: 'Sign In',
        },
      },
      extract: {
        text: true,
        markdown: true,
      },
    });

    if (isSuccess(authResult)) {
      session.authenticated = true;
      session.lastFetch = new Date().toISOString();
      console.log('Authentication successful!');
      return authResult;
    }

    console.log('Authentication failed or cancelled');
    return null;
  }

  // Use the pattern
  const content = await fetchWithSession('https://example.com/protected');

  if (content) {
    console.log('Got protected content:', content.content.title);
    console.log('Session state:', session);
  }
}

// =============================================================================
// Run All Examples
// =============================================================================

async function main(): Promise<void> {
  console.log('Unbrowser Connect - Authentication Flow Examples');
  console.log('================================================');
  console.log('Note: These examples may open popup windows.');
  console.log('');

  try {
    await connect.init();

    // Run examples - in a real app, you would run these based on user actions
    await example1_basicPopupAuth();
    await example2_customAuthPrompt();
    await example3_handleCancellation();
    await example4_backgroundWithAuthFallback();
    // Skip multi-site in automated runs: await example5_multiSiteAuth();
    await example6_oauthStyleIntegration();

    console.log('\n================================================');
    console.log('Authentication examples completed!');
  } catch (error) {
    console.error('Unexpected error:', error);
  } finally {
    connect.destroy();
  }
}

main();
