/**
 * UI Customization Examples for Unbrowser Connect
 *
 * This file demonstrates all UI customization options:
 * - Theme customization (colors, fonts, borders)
 * - Progress overlay configuration
 * - Auth modal customization
 * - Error toast settings
 * - Per-fetch UI overrides
 * - Custom containers
 *
 * Run with: npx tsx examples/ui-customization.ts
 */

import { createConnect, type ConnectConfig, type FetchOptions } from '@unbrowser/connect';

// =============================================================================
// Example 1: Default Theme (No Customization)
// =============================================================================

/**
 * Default theme values used when no customization is provided:
 * - primaryColor: '#6366f1' (indigo)
 * - backgroundColor: '#ffffff' (white)
 * - textColor: '#1f2937' (dark gray)
 * - borderRadius: '8px'
 * - fontFamily: system fonts
 */
function example1_defaultTheme(): void {
  console.log('\n=== Example 1: Default Theme ===\n');

  const connect = createConnect({
    appId: 'default-theme-app',
    apiKey: 'ub_test_demo',
    ui: {
      showProgress: true,
      showErrors: true,
    },
    // No theme specified - uses defaults
  });

  console.log('Using default theme:');
  console.log('  Primary: #6366f1 (indigo)');
  console.log('  Background: #ffffff (white)');
  console.log('  Text: #1f2937 (dark gray)');
  console.log('  Border Radius: 8px');
  console.log('  Font: System fonts');

  connect.destroy();
}

// =============================================================================
// Example 2: Brand Colors
// =============================================================================

/**
 * Customize to match your brand identity.
 */
function example2_brandColors(): void {
  console.log('\n=== Example 2: Brand Colors ===\n');

  // Example: Blue brand theme
  const blueThemeConfig: ConnectConfig = {
    appId: 'blue-brand-app',
    apiKey: 'ub_test_demo',
    theme: {
      primaryColor: '#0066cc',      // Brand blue
      backgroundColor: '#f0f7ff',   // Light blue background
      textColor: '#003366',         // Dark blue text
      borderRadius: '4px',          // Sharper corners
    },
    ui: {
      showProgress: true,
      showErrors: true,
    },
  };

  // Example: Green brand theme
  const greenThemeConfig: ConnectConfig = {
    appId: 'green-brand-app',
    apiKey: 'ub_test_demo',
    theme: {
      primaryColor: '#059669',      // Emerald
      backgroundColor: '#ecfdf5',   // Light green
      textColor: '#064e3b',         // Dark green
      borderRadius: '12px',         // Rounded
    },
    ui: {
      showProgress: true,
      showErrors: true,
    },
  };

  // Example: Orange/Warm brand theme
  const warmThemeConfig: ConnectConfig = {
    appId: 'warm-brand-app',
    apiKey: 'ub_test_demo',
    theme: {
      primaryColor: '#ea580c',      // Orange
      backgroundColor: '#fff7ed',   // Light orange
      textColor: '#7c2d12',         // Dark orange
      borderRadius: '16px',         // Very rounded
    },
    ui: {
      showProgress: true,
      showErrors: true,
    },
  };

  console.log('Blue theme:', blueThemeConfig.theme);
  console.log('Green theme:', greenThemeConfig.theme);
  console.log('Warm theme:', warmThemeConfig.theme);
}

// =============================================================================
// Example 3: Dark Mode Theme
// =============================================================================

/**
 * Dark mode configuration for apps with dark UI.
 */
function example3_darkMode(): void {
  console.log('\n=== Example 3: Dark Mode Theme ===\n');

  const darkModeConfig: ConnectConfig = {
    appId: 'dark-mode-app',
    apiKey: 'ub_test_demo',
    theme: {
      primaryColor: '#818cf8',      // Lighter indigo for contrast
      backgroundColor: '#1f2937',   // Dark gray background
      textColor: '#f9fafb',         // Light text
      borderRadius: '8px',
      fontFamily: '"Inter", system-ui, sans-serif',
    },
    ui: {
      showProgress: true,
      showErrors: true,
    },
  };

  console.log('Dark mode theme:', darkModeConfig.theme);

  // In a real app, you might toggle based on user preference:
  // const theme = document.documentElement.classList.contains('dark')
  //   ? darkTheme
  //   : lightTheme;
}

// =============================================================================
// Example 4: Custom Font Stack
// =============================================================================

/**
 * Using custom fonts to match your app's typography.
 */
function example4_customFonts(): void {
  console.log('\n=== Example 4: Custom Fonts ===\n');

  // Modern sans-serif
  const modernConfig: ConnectConfig = {
    appId: 'modern-app',
    apiKey: 'ub_test_demo',
    theme: {
      fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif',
    },
  };

  // Classic serif
  const classicConfig: ConnectConfig = {
    appId: 'classic-app',
    apiKey: 'ub_test_demo',
    theme: {
      fontFamily: '"Georgia", "Times New Roman", serif',
    },
  };

  // Monospace (developer tools)
  const devConfig: ConnectConfig = {
    appId: 'dev-app',
    apiKey: 'ub_test_demo',
    theme: {
      fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
    },
  };

  console.log('Modern (Sans):', modernConfig.theme?.fontFamily);
  console.log('Classic (Serif):', classicConfig.theme?.fontFamily);
  console.log('Developer (Mono):', devConfig.theme?.fontFamily);
}

// =============================================================================
// Example 5: Error Toast Duration
// =============================================================================

/**
 * Customize how long error toasts are displayed.
 */
function example5_errorDuration(): void {
  console.log('\n=== Example 5: Error Toast Duration ===\n');

  // Quick dismissal (3 seconds)
  const quickConfig: ConnectConfig = {
    appId: 'quick-errors-app',
    apiKey: 'ub_test_demo',
    ui: {
      showErrors: true,
      errorDuration: 3000,  // 3 seconds
    },
  };

  // Default (5 seconds)
  const defaultConfig: ConnectConfig = {
    appId: 'default-errors-app',
    apiKey: 'ub_test_demo',
    ui: {
      showErrors: true,
      errorDuration: 5000,  // 5 seconds (default)
    },
  };

  // Longer display (10 seconds) - for important errors
  const longConfig: ConnectConfig = {
    appId: 'long-errors-app',
    apiKey: 'ub_test_demo',
    ui: {
      showErrors: true,
      errorDuration: 10000,  // 10 seconds
    },
  };

  console.log('Quick (3s):', quickConfig.ui?.errorDuration);
  console.log('Default (5s):', defaultConfig.ui?.errorDuration);
  console.log('Long (10s):', longConfig.ui?.errorDuration);
}

// =============================================================================
// Example 6: Custom Container
// =============================================================================

/**
 * Mount UI components in a specific container instead of document.body.
 *
 * Use cases:
 * - Scoped modals within a specific section
 * - Multiple Connect instances with separate UI areas
 * - Shadow DOM compatibility
 */
function example6_customContainer(): void {
  console.log('\n=== Example 6: Custom Container ===\n');

  // In a browser environment:
  // const container = document.getElementById('unbrowser-ui-container');
  // const container = document.querySelector('.my-modal-zone');
  // const container = myComponentRef.current;

  // Simulated for Node.js example
  const container = null as unknown as HTMLElement;

  const config: ConnectConfig = {
    appId: 'custom-container-app',
    apiKey: 'ub_test_demo',
    ui: {
      showProgress: true,
      showErrors: true,
      container: container,  // UI mounts here instead of body
    },
  };

  console.log('HTML structure:');
  console.log(`
  <div id="app">
    <header>...</header>
    <main>...</main>

    <!-- UI components mount here -->
    <div id="unbrowser-ui-container"></div>
  </div>
  `);

  console.log('Config:', { container: 'document.getElementById("unbrowser-ui-container")' });
}

// =============================================================================
// Example 7: Per-Fetch UI Overrides
// =============================================================================

/**
 * Override global UI settings for specific fetch operations.
 */
async function example7_perFetchOverrides(): Promise<void> {
  console.log('\n=== Example 7: Per-Fetch UI Overrides ===\n');

  const connect = createConnect({
    appId: 'override-app',
    apiKey: 'ub_test_demo',
    ui: {
      showProgress: true,  // Globally enabled
      showErrors: true,
    },
    theme: {
      primaryColor: '#6366f1',
    },
  });

  await connect.init();

  // Fetch 1: Use global settings (progress shown)
  const options1: FetchOptions = {
    url: 'https://example.com',
    extract: { text: true },
    // No ui override - uses global showProgress: true
  };

  // Fetch 2: Disable progress for this fetch only
  const options2: FetchOptions = {
    url: 'https://example.com/silent',
    extract: { text: true },
    ui: {
      showProgress: false,  // Override: no progress for this fetch
    },
  };

  // Fetch 3: Use different container for this fetch
  const options3: FetchOptions = {
    url: 'https://example.com/modal-section',
    extract: { text: true },
    ui: {
      showProgress: true,
      container: null as unknown as HTMLElement, // Different container
    },
  };

  console.log('Fetch 1 - Uses global progress:', !options1.ui);
  console.log('Fetch 2 - Progress disabled:', options2.ui?.showProgress === false);
  console.log('Fetch 3 - Custom container:', !!options3.ui?.container);

  connect.destroy();
}

// =============================================================================
// Example 8: Auth Modal Customization
// =============================================================================

/**
 * Customize the authentication prompt modal.
 */
async function example8_authModalCustomization(): Promise<void> {
  console.log('\n=== Example 8: Auth Modal Customization ===\n');

  const connect = createConnect({
    appId: 'auth-modal-app',
    apiKey: 'ub_test_demo',
    ui: {
      showProgress: true,
    },
  });

  await connect.init();

  // Default auth prompt
  const defaultAuthOptions: FetchOptions = {
    url: 'https://protected-site.com',
    mode: 'popup',
    ui: {
      authPrompt: {
        // Uses all defaults
      },
    },
  };

  // Fully customized auth prompt
  const customAuthOptions: FetchOptions = {
    url: 'https://github.com/notifications',
    mode: 'popup',
    ui: {
      authPrompt: {
        title: 'GitHub Authentication',
        message: 'Sign in to your GitHub account to view your notifications. Your credentials are entered directly on GitHub - we never see your password.',
        buttonText: 'Open GitHub Login',
        cancelText: 'Not Now',
        showCancel: true,
      },
    },
  };

  // Minimal auth prompt (no cancel option)
  const minimalAuthOptions: FetchOptions = {
    url: 'https://required-login-site.com',
    mode: 'popup',
    ui: {
      authPrompt: {
        title: 'Login Required',
        message: 'Please sign in to continue.',
        buttonText: 'Continue',
        showCancel: false,  // User must proceed or close
      },
    },
  };

  console.log('Default auth prompt:');
  console.log('  Title: "Sign In Required"');
  console.log('  Button: "Continue"');
  console.log('');
  console.log('Custom auth prompt:', customAuthOptions.ui?.authPrompt);
  console.log('');
  console.log('Minimal auth prompt:', minimalAuthOptions.ui?.authPrompt);

  connect.destroy();
}

// =============================================================================
// Example 9: Combining All Options
// =============================================================================

/**
 * Complete configuration example with all options.
 */
function example9_completeConfiguration(): void {
  console.log('\n=== Example 9: Complete Configuration ===\n');

  const completeConfig: ConnectConfig = {
    // Required
    appId: 'complete-app',
    apiKey: 'ub_live_xxxxx',

    // Optional: API configuration
    apiUrl: 'https://api.unbrowser.ai',  // Default
    debug: false,                         // Disable console logging

    // Theme: Full customization
    theme: {
      primaryColor: '#2563eb',            // Blue-600
      backgroundColor: '#ffffff',          // White
      textColor: '#111827',                // Gray-900
      borderRadius: '6px',                 // Slightly rounded
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },

    // UI: Global settings
    ui: {
      showProgress: true,                  // Show progress overlay
      showErrors: true,                    // Show error toasts
      errorDuration: 5000,                 // 5 second toast duration
      container: undefined,                // Uses document.body
    },

    // Callbacks
    onReady: () => {
      console.log('SDK initialized successfully');
    },
    onError: (error) => {
      console.error('SDK error:', error.code, error.message);
      // Send to error tracking
    },
  };

  console.log('Complete configuration:');
  console.log(JSON.stringify(completeConfig, (key, value) => {
    if (typeof value === 'function') return '[Function]';
    return value;
  }, 2));
}

// =============================================================================
// Example 10: Dynamic Theme Switching
// =============================================================================

/**
 * Pattern for switching themes at runtime (e.g., dark mode toggle).
 */
function example10_dynamicThemeSwitching(): void {
  console.log('\n=== Example 10: Dynamic Theme Switching ===\n');

  // Theme definitions
  const lightTheme = {
    primaryColor: '#6366f1',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
  };

  const darkTheme = {
    primaryColor: '#818cf8',
    backgroundColor: '#1f2937',
    textColor: '#f9fafb',
  };

  // In a React app:
  console.log(`
  function App() {
    const [isDark, setIsDark] = useState(false);
    const connectRef = useRef(null);

    // Recreate Connect when theme changes
    useEffect(() => {
      // Destroy old instance
      connectRef.current?.destroy();

      // Create with new theme
      connectRef.current = createConnect({
        appId: 'themed-app',
        apiKey: 'ub_live_xxx',
        theme: isDark ? darkTheme : lightTheme,
        ui: { showProgress: true, showErrors: true },
      });

      connectRef.current.init();

      return () => connectRef.current?.destroy();
    }, [isDark]);

    return (
      <button onClick={() => setIsDark(!isDark)}>
        Toggle {isDark ? 'Light' : 'Dark'} Mode
      </button>
    );
  }
  `);

  console.log('Light theme:', lightTheme);
  console.log('Dark theme:', darkTheme);
}

// =============================================================================
// Example 11: CSS Custom Properties Integration
// =============================================================================

/**
 * Using CSS custom properties (variables) for theme consistency.
 */
function example11_cssCustomProperties(): void {
  console.log('\n=== Example 11: CSS Custom Properties ===\n');

  console.log('Define CSS variables in your app:');
  console.log(`
  :root {
    --color-primary: #6366f1;
    --color-background: #ffffff;
    --color-text: #1f2937;
    --radius-default: 8px;
    --font-family: 'Inter', sans-serif;
  }

  .dark {
    --color-primary: #818cf8;
    --color-background: #1f2937;
    --color-text: #f9fafb;
  }
  `);

  console.log('Read CSS variables in JavaScript:');
  console.log(`
  const styles = getComputedStyle(document.documentElement);

  const connect = createConnect({
    appId: 'css-vars-app',
    apiKey: 'ub_live_xxx',
    theme: {
      primaryColor: styles.getPropertyValue('--color-primary').trim(),
      backgroundColor: styles.getPropertyValue('--color-background').trim(),
      textColor: styles.getPropertyValue('--color-text').trim(),
      borderRadius: styles.getPropertyValue('--radius-default').trim(),
      fontFamily: styles.getPropertyValue('--font-family').trim(),
    },
  });
  `);
}

// =============================================================================
// Run All Examples
// =============================================================================

async function main(): Promise<void> {
  console.log('Unbrowser Connect - UI Customization Examples');
  console.log('=============================================');

  example1_defaultTheme();
  example2_brandColors();
  example3_darkMode();
  example4_customFonts();
  example5_errorDuration();
  example6_customContainer();
  await example7_perFetchOverrides();
  await example8_authModalCustomization();
  example9_completeConfiguration();
  example10_dynamicThemeSwitching();
  example11_cssCustomProperties();

  console.log('\n=============================================');
  console.log('UI customization examples completed!');
}

main();
