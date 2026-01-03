/**
 * Pattern Templates Library
 *
 * Reusable patterns that can be detected and applied across many sites.
 * When the system detects signals matching a template, it can immediately
 * use that template's extraction strategy rather than learning from scratch.
 */

import type { PatternTemplate, HandlerTemplate } from './types.js';

/**
 * All known pattern templates
 */
export const PATTERN_TEMPLATES: Record<HandlerTemplate, PatternTemplate> = {
  'shopify-like': {
    id: 'shopify-like',
    name: 'Shopify-like Store',
    description: 'E-commerce stores using Shopify or similar /products.json API pattern',
    signals: [
      { type: 'html-marker', pattern: 'cdn.shopify.com', weight: 0.9, required: false },
      { type: 'html-marker', pattern: 'Shopify.theme', weight: 0.9, required: false },
      { type: 'html-marker', pattern: 'ShopifyAnalytics', weight: 0.8, required: false },
      { type: 'api-endpoint', pattern: '/products.json', weight: 0.7, required: false },
      { type: 'api-endpoint', pattern: '/collections.json', weight: 0.6, required: false },
      { type: 'url-pattern', pattern: '/products/', weight: 0.3, required: false },
      { type: 'url-pattern', pattern: '/collections/', weight: 0.3, required: false },
      { type: 'meta-tag', pattern: 'shopify-checkout', weight: 0.5, required: false },
    ],
    extraction: {
      primary: {
        type: 'api',
        config: {
          endpoint: '/products/{handle}.json',
          jsonPaths: {
            title: '$.product.title',
            description: '$.product.body_html',
            price: '$.product.variants[0].price',
            image: '$.product.images[0].src',
            vendor: '$.product.vendor',
          },
        },
      },
      fallbacks: [
        {
          type: 'json-ld',
          config: {
            jsonPaths: {
              title: '$.name',
              description: '$.description',
              price: '$.offers.price',
            },
          },
        },
      ],
    },
    defaultConfig: {
      apiBase: '',
      rateLimit: 2,
    },
    knownSites: ['myshopify.com', 'shopify.com'],
  },

  'woocommerce-like': {
    id: 'woocommerce-like',
    name: 'WooCommerce Store',
    description: 'WordPress sites using WooCommerce with Store API',
    signals: [
      { type: 'api-endpoint', pattern: '/wp-json/wc/store/v1/', weight: 0.95, required: false },
      { type: 'html-marker', pattern: 'woocommerce', weight: 0.6, required: false },
      { type: 'html-marker', pattern: 'wc-blocks', weight: 0.7, required: false },
      { type: 'script-src', pattern: 'woocommerce', weight: 0.5, required: false },
      { type: 'url-pattern', pattern: '/product/', weight: 0.3, required: false },
      { type: 'url-pattern', pattern: '/product-category/', weight: 0.4, required: false },
    ],
    extraction: {
      primary: {
        type: 'api',
        config: {
          endpoint: '/wp-json/wc/store/v1/products?slug={slug}',
          jsonPaths: {
            title: '$[0].name',
            description: '$[0].description',
            price: '$[0].prices.price',
            image: '$[0].images[0].src',
          },
        },
      },
      fallbacks: [
        {
          type: 'json-ld',
          config: {},
        },
        {
          type: 'html-parse',
          config: {
            selectors: {
              title: '.product_title',
              price: '.price .amount',
              description: '.woocommerce-product-details__short-description',
            },
          },
        },
      ],
    },
    defaultConfig: {
      apiBase: '/wp-json/wc/store/v1',
    },
  },

  'rest-api': {
    id: 'rest-api',
    name: 'REST API',
    description: 'Sites with discoverable REST API endpoints',
    signals: [
      { type: 'api-endpoint', pattern: '/api/v', weight: 0.6, required: false },
      { type: 'api-endpoint', pattern: '/api/', weight: 0.4, required: false },
      { type: 'header', pattern: 'application/json', weight: 0.3, required: false },
    ],
    extraction: {
      primary: {
        type: 'api',
        config: {
          // Will be filled in dynamically based on discovery
        },
      },
      fallbacks: [
        { type: 'json-ld', config: {} },
        { type: 'html-parse', config: {} },
      ],
    },
    defaultConfig: {},
  },

  'graphql': {
    id: 'graphql',
    name: 'GraphQL API',
    description: 'Sites using GraphQL for data fetching',
    signals: [
      { type: 'api-endpoint', pattern: '/graphql', weight: 0.9, required: false },
      { type: 'api-endpoint', pattern: '/gql', weight: 0.7, required: false },
      { type: 'html-marker', pattern: '__APOLLO_STATE__', weight: 0.8, required: false },
      { type: 'html-marker', pattern: 'relay-', weight: 0.5, required: false },
    ],
    extraction: {
      primary: {
        type: 'api',
        config: {
          endpoint: '/graphql',
        },
      },
      fallbacks: [
        {
          type: 'framework-data',
          config: {
            frameworkKey: '__APOLLO_STATE__',
          },
        },
      ],
    },
    defaultConfig: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  },

  'nextjs-ssr': {
    id: 'nextjs-ssr',
    name: 'Next.js SSR',
    description: 'Next.js sites with server-side rendered data',
    signals: [
      { type: 'html-marker', pattern: '__NEXT_DATA__', weight: 0.95, required: true },
      { type: 'html-marker', pattern: '_next/static', weight: 0.6, required: false },
      { type: 'meta-tag', pattern: 'next-head-count', weight: 0.7, required: false },
    ],
    extraction: {
      primary: {
        type: 'framework-data',
        config: {
          frameworkKey: '__NEXT_DATA__',
          jsonPaths: {
            props: '$.props.pageProps',
          },
        },
      },
      fallbacks: [
        { type: 'json-ld', config: {} },
        { type: 'html-parse', config: {} },
      ],
    },
    defaultConfig: {},
    knownSites: ['vercel.app'],
  },

  'spa-json': {
    id: 'spa-json',
    name: 'SPA with Embedded JSON',
    description: 'Single-page apps with JSON data embedded in script tags',
    signals: [
      { type: 'html-marker', pattern: 'window.__INITIAL_STATE__', weight: 0.7, required: false },
      { type: 'html-marker', pattern: 'window.__PRELOADED_STATE__', weight: 0.7, required: false },
      { type: 'html-marker', pattern: 'window.__DATA__', weight: 0.6, required: false },
      { type: 'html-marker', pattern: '__NUXT__', weight: 0.8, required: false },
      { type: 'html-marker', pattern: '__GATSBY', weight: 0.8, required: false },
    ],
    extraction: {
      primary: {
        type: 'framework-data',
        config: {
          // Will detect which framework key is present
        },
      },
      fallbacks: [
        { type: 'json-ld', config: {} },
        { type: 'html-parse', config: {} },
      ],
    },
    defaultConfig: {},
  },

  'structured-data': {
    id: 'structured-data',
    name: 'Structured Data Heavy',
    description: 'Sites with rich JSON-LD, microdata, or OpenGraph',
    signals: [
      { type: 'html-marker', pattern: 'application/ld+json', weight: 0.8, required: false },
      { type: 'html-marker', pattern: 'itemscope', weight: 0.5, required: false },
      { type: 'meta-tag', pattern: 'og:', weight: 0.4, required: false },
    ],
    extraction: {
      primary: {
        type: 'json-ld',
        config: {},
      },
      fallbacks: [
        { type: 'microdata', config: {} },
        { type: 'opengraph', config: {} },
      ],
    },
    defaultConfig: {},
  },

  'html-scrape': {
    id: 'html-scrape',
    name: 'HTML Scraping',
    description: 'Sites requiring traditional HTML parsing',
    signals: [
      // This is the fallback - no specific signals
    ],
    extraction: {
      primary: {
        type: 'html-parse',
        config: {
          selectors: {
            title: 'h1, .title, [class*="title"]',
            content: 'article, main, .content, #content',
            price: '.price, [class*="price"]',
            description: '.description, [class*="description"]',
          },
        },
      },
      fallbacks: [],
    },
    defaultConfig: {},
  },

  'custom': {
    id: 'custom',
    name: 'Custom Learned',
    description: 'Fully learned from observation, no base template',
    signals: [],
    extraction: {
      primary: {
        type: 'html-parse',
        config: {},
      },
      fallbacks: [],
    },
    defaultConfig: {},
  },
};

/**
 * Detect which template best matches the given HTML/signals
 */
export function detectTemplate(
  html: string,
  url: string,
  headers?: Record<string, string>
): { template: HandlerTemplate; confidence: number; signals: string[] } {
  const results: Array<{ template: HandlerTemplate; score: number; matched: string[] }> = [];

  for (const [templateId, template] of Object.entries(PATTERN_TEMPLATES)) {
    let score = 0;
    let maxPossibleScore = 0;
    const matched: string[] = [];
    let hasRequiredSignal = true;

    for (const signal of template.signals) {
      maxPossibleScore += signal.weight;

      const isMatch = checkSignal(signal, html, url, headers);
      if (isMatch) {
        score += signal.weight;
        matched.push(`${signal.type}:${signal.pattern}`);
      } else if (signal.required) {
        hasRequiredSignal = false;
      }
    }

    // Skip if missing required signal
    if (!hasRequiredSignal) continue;

    // Normalize score
    const normalizedScore = maxPossibleScore > 0 ? score / maxPossibleScore : 0;

    if (normalizedScore > 0.1) {
      results.push({
        template: templateId as HandlerTemplate,
        score: normalizedScore,
        matched,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  if (results.length > 0) {
    return {
      template: results[0].template,
      confidence: results[0].score,
      signals: results[0].matched,
    };
  }

  // Default to custom/html-scrape
  return {
    template: 'html-scrape',
    confidence: 0.1,
    signals: [],
  };
}

/**
 * Check if a signal matches
 */
function checkSignal(
  signal: PatternTemplate['signals'][0],
  html: string,
  url: string,
  headers?: Record<string, string>
): boolean {
  switch (signal.type) {
    case 'html-marker':
      return html.includes(signal.pattern);

    case 'api-endpoint':
      // Check if the pattern exists in HTML (as a link/fetch URL)
      return html.includes(signal.pattern);

    case 'header':
      if (!headers) return false;
      return Object.values(headers).some(v =>
        v.toLowerCase().includes(signal.pattern.toLowerCase())
      );

    case 'meta-tag':
      return html.includes(`<meta`) && html.includes(signal.pattern);

    case 'script-src':
      return html.includes(`<script`) && html.includes(signal.pattern);

    case 'url-pattern':
      return url.includes(signal.pattern);

    default:
      return false;
  }
}

/**
 * Get extraction config for a template
 */
export function getTemplateConfig(template: HandlerTemplate): PatternTemplate {
  return PATTERN_TEMPLATES[template] || PATTERN_TEMPLATES['custom'];
}

/**
 * Merge template defaults with site-specific overrides
 */
export function mergeTemplateWithQuirks(
  template: PatternTemplate,
  quirks: Partial<{
    selectorOverrides: Record<string, string>;
    headers: Record<string, string>;
    apiBase: string;
  }>
): PatternTemplate['extraction'] {
  const extraction = { ...template.extraction };

  // Apply selector overrides
  if (quirks.selectorOverrides && extraction.primary.config.selectors) {
    extraction.primary.config.selectors = {
      ...extraction.primary.config.selectors,
      ...quirks.selectorOverrides,
    };
  }

  return extraction;
}
