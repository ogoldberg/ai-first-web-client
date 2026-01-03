/**
 * Shopify Site Handler
 *
 * Extracts product and collection data from Shopify stores using their
 * standard JSON API endpoints (/products.json, /collections.json).
 *
 * Works on any Shopify-powered store, which includes thousands of e-commerce sites.
 *
 * @see https://github.com/lagenar/shopify-scraper
 * @see https://shopify.dev/docs/api
 */

import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';
import { logger } from '../../utils/logger.js';
import { traverseObj, getString, getNumber, getArray } from '../traverse-obj.js';

const log = logger.intelligence;

/**
 * Shopify Product interface
 */
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string;
  tags?: string[];
  variants?: ShopifyVariant[];
  images?: ShopifyImage[];
  options?: ShopifyOption[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price?: string;
  sku?: string;
  available?: boolean;
  inventory_quantity?: number;
}

interface ShopifyImage {
  id: number;
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

interface ShopifyOption {
  id: number;
  name: string;
  values: string[];
}

interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  description?: string;
  body_html?: string;
  published_at?: string;
  updated_at?: string;
  image?: ShopifyImage;
}

type ShopifyUrlType = 'product' | 'collection' | 'products-list' | 'collections-list' | 'homepage' | 'unknown';

interface ParsedShopifyUrl {
  type: ShopifyUrlType;
  handle?: string;
  page?: number;
}

export class ShopifyHandler extends BaseSiteHandler {
  readonly name = 'Shopify';
  readonly strategy = 'api:shopify' as const;

  /**
   * Detect if URL is a Shopify store
   *
   * We can't just check the domain - need to check for Shopify markers.
   * This is done by the caller before extract() is called.
   */
  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    // Check for common Shopify patterns
    const shopifyDomains = [
      'myshopify.com',
      'shopify.com',
    ];

    // Direct Shopify domains
    if (shopifyDomains.some((d) => parsed.hostname.endsWith(d))) {
      return true;
    }

    // Check URL patterns that indicate Shopify
    const path = parsed.pathname.toLowerCase();
    if (
      path.includes('/products/') ||
      path.includes('/collections/') ||
      path === '/products.json' ||
      path === '/collections.json'
    ) {
      // These patterns alone don't confirm Shopify
      // but combined with other signals they're strong indicators
      return true;
    }

    return false;
  }

  /**
   * Check if a site is powered by Shopify by examining the HTML
   */
  static isShopifySite(html: string): boolean {
    const shopifyMarkers = [
      'cdn.shopify.com',
      'Shopify.theme',
      'window.ShopifyAnalytics',
      'Shopify.routes',
      '"shopify"',
      '/cart.js',
      'shopify-section',
    ];

    return shopifyMarkers.some((marker) => html.includes(marker));
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const parsed = this.parseShopifyUrl(url);

    try {
      switch (parsed.type) {
        case 'product':
          return await this.extractProduct(url, parsed.handle!, fetch, opts);

        case 'collection':
          return await this.extractCollection(url, parsed.handle!, fetch, opts);

        case 'products-list':
          return await this.extractProductsList(url, parsed.page, fetch, opts);

        case 'collections-list':
          return await this.extractCollectionsList(url, fetch, opts);

        case 'homepage':
          // Try to get featured products from homepage
          return await this.extractProductsList(url, 1, fetch, opts);

        default:
          return null;
      }
    } catch (error) {
      log.debug(`Shopify extraction failed: ${error}`);
      return null;
    }
  }

  /**
   * Parse Shopify URL to determine type
   */
  private parseShopifyUrl(url: string): ParsedShopifyUrl {
    const parsed = this.parseUrl(url);
    if (!parsed) return { type: 'unknown' };

    const path = parsed.pathname.toLowerCase();
    const parts = path.split('/').filter(Boolean);

    // /products/product-handle
    if (parts[0] === 'products' && parts.length >= 2) {
      if (parts[1].endsWith('.json')) {
        return { type: 'products-list' };
      }
      return { type: 'product', handle: parts[1] };
    }

    // /products or /products.json
    if (parts[0] === 'products' || path === '/products.json') {
      const page = parseInt(parsed.searchParams.get('page') || '1', 10);
      return { type: 'products-list', page };
    }

    // /collections/collection-handle
    if (parts[0] === 'collections' && parts.length >= 2) {
      if (parts[1].endsWith('.json')) {
        return { type: 'collections-list' };
      }
      // /collections/all/products
      if (parts[1] === 'all' && parts[2] === 'products') {
        return { type: 'products-list' };
      }
      return { type: 'collection', handle: parts[1] };
    }

    // /collections or /collections.json
    if (parts[0] === 'collections' || path === '/collections.json') {
      return { type: 'collections-list' };
    }

    // Homepage - try to extract products
    if (path === '/' || path === '') {
      return { type: 'homepage' };
    }

    return { type: 'unknown' };
  }

  /**
   * Extract a single product
   */
  private async extractProduct(
    originalUrl: string,
    handle: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const baseUrl = this.getBaseUrl(originalUrl);
    const apiUrl = `${baseUrl}/products/${handle}.json`;

    log.debug(`Fetching Shopify product: ${apiUrl}`);

    const response = await fetch(apiUrl, opts);
    if (!response.ok) {
      log.debug(`Shopify product API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const productResult = traverseObj<ShopifyProduct>(data, ['product']);
    const product = Array.isArray(productResult) ? productResult[0] : productResult;

    if (!product) {
      return null;
    }

    const formatted = this.formatProduct(product);

    return this.createResult(originalUrl, apiUrl, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: { product },
    });
  }

  /**
   * Extract a collection
   */
  private async extractCollection(
    originalUrl: string,
    handle: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const baseUrl = this.getBaseUrl(originalUrl);

    // First get collection info
    const collectionUrl = `${baseUrl}/collections/${handle}.json`;
    const productsUrl = `${baseUrl}/collections/${handle}/products.json`;

    log.debug(`Fetching Shopify collection: ${collectionUrl}`);

    // Fetch both in parallel
    const [collectionRes, productsRes] = await Promise.all([
      fetch(collectionUrl, opts).catch(() => null),
      fetch(productsUrl, opts).catch(() => null),
    ]);

    let collection: ShopifyCollection | undefined;
    let products: ShopifyProduct[] = [];

    if (collectionRes?.ok) {
      const data = await collectionRes.json();
      const result = traverseObj<ShopifyCollection>(data, ['collection']);
      collection = Array.isArray(result) ? result[0] : result;
    }

    if (productsRes?.ok) {
      const data = await productsRes.json();
      products = getArray<ShopifyProduct>(data, ['products']) || [];
    }

    if (!collection && products.length === 0) {
      return null;
    }

    const formatted = this.formatCollection(collection, products);

    return this.createResult(originalUrl, collectionUrl, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: { collection, products },
    });
  }

  /**
   * Extract products list
   */
  private async extractProductsList(
    originalUrl: string,
    page: number = 1,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const baseUrl = this.getBaseUrl(originalUrl);
    const apiUrl = `${baseUrl}/products.json?page=${page}&limit=50`;

    log.debug(`Fetching Shopify products list: ${apiUrl}`);

    const response = await fetch(apiUrl, opts);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const products = getArray<ShopifyProduct>(data, ['products']) || [];

    if (products.length === 0) {
      return null;
    }

    const formatted = this.formatProductsList(products, page);

    return this.createResult(originalUrl, apiUrl, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: { products, page, total: products.length },
    });
  }

  /**
   * Extract collections list
   */
  private async extractCollectionsList(
    originalUrl: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const baseUrl = this.getBaseUrl(originalUrl);
    const apiUrl = `${baseUrl}/collections.json`;

    log.debug(`Fetching Shopify collections list: ${apiUrl}`);

    const response = await fetch(apiUrl, opts);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const collections = getArray<ShopifyCollection>(data, ['collections']) || [];

    if (collections.length === 0) {
      return null;
    }

    const formatted = this.formatCollectionsList(collections);

    return this.createResult(originalUrl, apiUrl, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: { collections },
    });
  }

  /**
   * Get base URL from any store URL
   */
  private getBaseUrl(url: string): string {
    const parsed = this.parseUrl(url);
    if (!parsed) return url;
    return `${parsed.protocol}//${parsed.hostname}`;
  }

  /**
   * Format a single product
   */
  private formatProduct(product: ShopifyProduct): {
    title: string;
    text: string;
    markdown: string;
  } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    const title = product.title || 'Untitled Product';
    const description = this.stripHtml(product.body_html || '');
    const vendor = product.vendor || '';
    const productType = product.product_type || '';
    const tags = product.tags || [];

    // Get price range from variants
    const prices = (product.variants || [])
      .map((v) => parseFloat(v.price))
      .filter((p) => !isNaN(p));
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

    const priceStr =
      minPrice !== null
        ? minPrice === maxPrice
          ? `$${minPrice.toFixed(2)}`
          : `$${minPrice.toFixed(2)} - $${maxPrice!.toFixed(2)}`
        : 'Price not available';

    // Check availability
    const available = (product.variants || []).some((v) => v.available !== false);

    // Text format
    lines.push(title);
    lines.push('='.repeat(title.length));
    lines.push('');
    lines.push(`Price: ${priceStr}`);
    lines.push(`Available: ${available ? 'Yes' : 'No'}`);
    if (vendor) lines.push(`Brand: ${vendor}`);
    if (productType) lines.push(`Category: ${productType}`);
    if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`);
    lines.push('');
    if (description) lines.push(description);

    // Variants
    if (product.variants && product.variants.length > 1) {
      lines.push('');
      lines.push('Variants:');
      for (const variant of product.variants.slice(0, 10)) {
        const variantPrice = variant.price ? `$${parseFloat(variant.price).toFixed(2)}` : '';
        const variantAvail = variant.available !== false ? '✓' : '✗';
        lines.push(`  - ${variant.title}: ${variantPrice} ${variantAvail}`);
      }
      if (product.variants.length > 10) {
        lines.push(`  ... and ${product.variants.length - 10} more variants`);
      }
    }

    // Options
    if (product.options && product.options.length > 0) {
      lines.push('');
      lines.push('Options:');
      for (const option of product.options) {
        lines.push(`  ${option.name}: ${option.values.join(', ')}`);
      }
    }

    // Markdown format
    markdownLines.push(`# ${title}`);
    markdownLines.push('');
    markdownLines.push(`**Price:** ${priceStr}`);
    markdownLines.push(`**Available:** ${available ? 'Yes' : 'No'}`);
    if (vendor) markdownLines.push(`**Brand:** ${vendor}`);
    if (productType) markdownLines.push(`**Category:** ${productType}`);
    if (tags.length > 0) markdownLines.push(`**Tags:** ${tags.map((t) => `\`${t}\``).join(' ')}`);
    markdownLines.push('');
    if (description) markdownLines.push(description);

    // Images
    if (product.images && product.images.length > 0) {
      markdownLines.push('');
      markdownLines.push('## Images');
      for (const img of product.images.slice(0, 5)) {
        const alt = img.alt || title;
        markdownLines.push(`![${alt}](${img.src})`);
      }
    }

    // Variants table
    if (product.variants && product.variants.length > 1) {
      markdownLines.push('');
      markdownLines.push('## Variants');
      markdownLines.push('| Variant | Price | Available |');
      markdownLines.push('|---------|-------|-----------|');
      for (const variant of product.variants.slice(0, 10)) {
        const variantPrice = variant.price ? `$${parseFloat(variant.price).toFixed(2)}` : '-';
        const variantAvail = variant.available !== false ? '✓' : '✗';
        markdownLines.push(`| ${variant.title} | ${variantPrice} | ${variantAvail} |`);
      }
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format a collection with its products
   */
  private formatCollection(
    collection: ShopifyCollection | undefined,
    products: ShopifyProduct[]
  ): { title: string; text: string; markdown: string } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    const title = collection?.title || 'Product Collection';
    const description = this.stripHtml(collection?.body_html || collection?.description || '');

    // Text format
    lines.push(title);
    lines.push('='.repeat(title.length));
    if (description) {
      lines.push('');
      lines.push(description);
    }
    lines.push('');
    lines.push(`Products: ${products.length}`);
    lines.push('');

    for (const product of products) {
      const prices = (product.variants || [])
        .map((v) => parseFloat(v.price))
        .filter((p) => !isNaN(p));
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;
      const priceStr = minPrice !== null ? `$${minPrice.toFixed(2)}` : '';

      lines.push(`- ${product.title} ${priceStr}`);
    }

    // Markdown format
    markdownLines.push(`# ${title}`);
    if (description) {
      markdownLines.push('');
      markdownLines.push(description);
    }
    markdownLines.push('');
    markdownLines.push(`**Total Products:** ${products.length}`);
    markdownLines.push('');
    markdownLines.push('## Products');
    markdownLines.push('| Product | Price | Available |');
    markdownLines.push('|---------|-------|-----------|');

    for (const product of products.slice(0, 50)) {
      const prices = (product.variants || [])
        .map((v) => parseFloat(v.price))
        .filter((p) => !isNaN(p));
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;
      const priceStr = minPrice !== null ? `$${minPrice.toFixed(2)}` : '-';
      const available = (product.variants || []).some((v) => v.available !== false);

      markdownLines.push(`| ${product.title} | ${priceStr} | ${available ? '✓' : '✗'} |`);
    }

    if (products.length > 50) {
      markdownLines.push(`| ... and ${products.length - 50} more products | | |`);
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format products list
   */
  private formatProductsList(
    products: ShopifyProduct[],
    page: number
  ): { title: string; text: string; markdown: string } {
    const title = `Products (Page ${page})`;
    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(title);
    lines.push('='.repeat(title.length));
    lines.push('');
    lines.push(`Showing ${products.length} products`);
    lines.push('');

    for (const product of products) {
      const prices = (product.variants || [])
        .map((v) => parseFloat(v.price))
        .filter((p) => !isNaN(p));
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;
      const priceStr = minPrice !== null ? `$${minPrice.toFixed(2)}` : '';

      lines.push(`- ${product.title} ${priceStr}`);
    }

    // Markdown format
    markdownLines.push(`# ${title}`);
    markdownLines.push('');
    markdownLines.push(`**Showing:** ${products.length} products`);
    markdownLines.push('');
    markdownLines.push('| Product | Price | Type |');
    markdownLines.push('|---------|-------|------|');

    for (const product of products) {
      const prices = (product.variants || [])
        .map((v) => parseFloat(v.price))
        .filter((p) => !isNaN(p));
      const minPrice = prices.length > 0 ? Math.min(...prices) : null;
      const priceStr = minPrice !== null ? `$${minPrice.toFixed(2)}` : '-';

      markdownLines.push(`| ${product.title} | ${priceStr} | ${product.product_type || '-'} |`);
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format collections list
   */
  private formatCollectionsList(collections: ShopifyCollection[]): {
    title: string;
    text: string;
    markdown: string;
  } {
    const title = 'Collections';
    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(title);
    lines.push('='.repeat(title.length));
    lines.push('');
    lines.push(`Total collections: ${collections.length}`);
    lines.push('');

    for (const collection of collections) {
      lines.push(`- ${collection.title}`);
      if (collection.description) {
        lines.push(`  ${collection.description.substring(0, 100)}...`);
      }
    }

    // Markdown format
    markdownLines.push(`# ${title}`);
    markdownLines.push('');
    markdownLines.push(`**Total:** ${collections.length} collections`);
    markdownLines.push('');

    for (const collection of collections) {
      markdownLines.push(`## ${collection.title}`);
      if (collection.description) {
        markdownLines.push(collection.description);
      }
      markdownLines.push('');
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Strip HTML tags from a string
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Export singleton instance
export const shopifyHandler = new ShopifyHandler();
