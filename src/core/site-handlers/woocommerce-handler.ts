/**
 * WooCommerce Handler
 *
 * Extracts product data from WooCommerce-powered WordPress stores.
 * Uses the WooCommerce Store API which provides unauthenticated public access.
 *
 * API Reference:
 * - Store API: /wp-json/wc/store/v1/products (public, no auth required)
 * - Single product: /wp-json/wc/store/v1/products/<id>
 *
 * URL Patterns:
 * - /product/<slug>
 * - /shop/ (product listing)
 * - /product-category/<category>/
 * - /?product=<slug>
 *
 * Detection Methods:
 * - Check for WooCommerce REST API endpoint
 * - Look for wc-blocks script in HTML
 * - Check for WooCommerce meta tags
 */

import { BaseSiteHandler, type SiteHandlerResult, type FetchFunction, type SiteHandlerOptions } from './types.js';
import { traverseObj, getString, getNumber, getArray } from '../traverse-obj.js';

/**
 * WooCommerce Store API product response
 */
interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description: string;
  short_description: string;
  sku: string;
  prices: {
    price: string;
    regular_price: string;
    sale_price: string;
    currency_code: string;
    currency_symbol: string;
    currency_prefix: string;
    currency_suffix: string;
  };
  price_html: string;
  average_rating: string;
  review_count: number;
  images: Array<{
    id: number;
    src: string;
    thumbnail: string;
    srcset: string;
    sizes: string;
    name: string;
    alt: string;
  }>;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    link: string;
  }>;
  tags: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  attributes: Array<{
    id: number;
    name: string;
    taxonomy: string;
    has_variations: boolean;
    terms: Array<{
      id: number;
      name: string;
      slug: string;
    }>;
  }>;
  variations: Array<{
    id: number;
    attributes: Array<{
      name: string;
      value: string;
    }>;
  }>;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  is_purchasable: boolean;
  is_in_stock: boolean;
  is_on_sale: boolean;
  low_stock_remaining: number | null;
  sold_individually: boolean;
  add_to_cart: {
    text: string;
    description: string;
    url: string;
  };
}

/**
 * Normalized WooCommerce product data
 */
interface NormalizedWooProduct {
  id: number;
  name: string;
  slug: string;
  url: string;
  description: string;
  shortDescription: string;
  sku: string;
  price: {
    current: number;
    regular: number;
    sale?: number;
    currency: string;
    currencySymbol: string;
    formatted: string;
  };
  rating: number;
  reviewCount: number;
  images: Array<{
    url: string;
    alt: string;
    thumbnail?: string;
  }>;
  categories: string[];
  tags: string[];
  attributes: Array<{
    name: string;
    values: string[];
  }>;
  stockStatus: 'in_stock' | 'out_of_stock' | 'on_backorder';
  isOnSale: boolean;
  isPurchasable: boolean;
}

export class WooCommerceHandler extends BaseSiteHandler {
  name = 'woocommerce';
  strategy = 'api:woocommerce' as const;

  /**
   * Check if URL might be a WooCommerce store
   * We can't know for sure without probing the API
   */
  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();

      // Common WooCommerce URL patterns
      if (path.includes('/product/') ||
          path.includes('/product-category/') ||
          path === '/shop' ||
          path === '/shop/' ||
          parsed.searchParams.has('product')) {
        return true;
      }

      // Check for wp-json in path (API calls)
      if (path.includes('/wp-json/wc/')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Extract product data from WooCommerce store
   */
  async extract(
    url: string,
    fetchFn: FetchFunction,
    _options: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();

      // Determine the base URL for API calls
      const baseUrl = `${parsed.protocol}//${parsed.host}`;

      // First, verify this is a WooCommerce site by checking the API
      const isWooCommerce = await this.verifyWooCommerce(baseUrl, fetchFn);
      if (!isWooCommerce) {
        return null;
      }

      // Determine what type of page we're on
      if (path.includes('/product/')) {
        // Single product page
        const slug = this.extractProductSlug(path);
        if (slug) {
          return this.extractProductBySlug(baseUrl, slug, url, fetchFn);
        }
      } else if (path === '/shop' || path === '/shop/' || path.includes('/product-category/')) {
        // Product listing page
        return this.extractProductList(baseUrl, url, fetchFn);
      } else if (parsed.searchParams.has('product')) {
        // Product via query param
        const slug = parsed.searchParams.get('product');
        if (slug) {
          return this.extractProductBySlug(baseUrl, slug, url, fetchFn);
        }
      }

      // Fallback: try to extract product list
      return this.extractProductList(baseUrl, url, fetchFn);
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify this is a WooCommerce site by checking the Store API
   */
  private async verifyWooCommerce(baseUrl: string, fetchFn: FetchFunction): Promise<boolean> {
    try {
      const apiUrl = `${baseUrl}/wp-json/wc/store/v1`;
      const response = await fetchFn(apiUrl, {
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        // WooCommerce Store API returns namespace info
        return data && (data.namespace === 'wc/store/v1' || data.routes);
      }

      // Also check for older API format
      const legacyUrl = `${baseUrl}/wp-json/wc/v3`;
      const legacyResponse = await fetchFn(legacyUrl, {
        headers: { 'Accept': 'application/json' },
      });

      return legacyResponse.status !== 404;
    } catch {
      return false;
    }
  }

  /**
   * Extract product slug from URL path
   */
  private extractProductSlug(path: string): string | null {
    // Match /product/<slug>/ or /product/<slug>
    const match = path.match(/\/product\/([^\/]+)\/?$/);
    return match ? match[1] : null;
  }

  /**
   * Extract a single product by slug
   */
  private async extractProductBySlug(
    baseUrl: string,
    slug: string,
    originalUrl: string,
    fetchFn: FetchFunction
  ): Promise<SiteHandlerResult | null> {
    try {
      // WooCommerce Store API supports slug parameter
      const apiUrl = `${baseUrl}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`;
      const response = await fetchFn(apiUrl, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) {
        return null;
      }

      const product = products[0] as WooCommerceProduct;
      const normalized = this.normalizeProduct(product);

      return this.buildProductResult(normalized, originalUrl);
    } catch {
      return null;
    }
  }

  /**
   * Extract product list
   */
  private async extractProductList(
    baseUrl: string,
    originalUrl: string,
    fetchFn: FetchFunction
  ): Promise<SiteHandlerResult | null> {
    try {
      const apiUrl = `${baseUrl}/wp-json/wc/store/v1/products?per_page=50`;
      const response = await fetchFn(apiUrl, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) {
        return null;
      }

      const normalized = products.map((p: WooCommerceProduct) => this.normalizeProduct(p));

      return this.buildProductListResult(normalized, originalUrl);
    } catch {
      return null;
    }
  }

  /**
   * Normalize WooCommerce product to our standard format
   */
  private normalizeProduct(product: WooCommerceProduct): NormalizedWooProduct {
    const prices = product.prices || {};
    const currentPrice = parseFloat(prices.price || '0') / 100; // WooCommerce prices are in cents
    const regularPrice = parseFloat(prices.regular_price || prices.price || '0') / 100;
    const salePrice = prices.sale_price ? parseFloat(prices.sale_price) / 100 : undefined;

    const stockStatusMap: Record<string, 'in_stock' | 'out_of_stock' | 'on_backorder'> = {
      'instock': 'in_stock',
      'outofstock': 'out_of_stock',
      'onbackorder': 'on_backorder',
    };

    return {
      id: product.id,
      name: product.name || '',
      slug: product.slug || '',
      url: product.permalink || '',
      description: this.stripHtml(product.description || ''),
      shortDescription: this.stripHtml(product.short_description || ''),
      sku: product.sku || '',
      price: {
        current: currentPrice,
        regular: regularPrice,
        sale: salePrice,
        currency: prices.currency_code || 'USD',
        currencySymbol: prices.currency_symbol || '$',
        formatted: this.formatPrice(currentPrice, prices.currency_symbol || '$', prices.currency_prefix, prices.currency_suffix),
      },
      rating: parseFloat(product.average_rating || '0'),
      reviewCount: product.review_count || 0,
      images: (product.images || []).map(img => ({
        url: img.src,
        alt: img.alt || img.name || '',
        thumbnail: img.thumbnail,
      })),
      categories: (product.categories || []).map(c => c.name),
      tags: (product.tags || []).map(t => t.name),
      attributes: (product.attributes || []).map(attr => ({
        name: attr.name,
        values: (attr.terms || []).map(t => t.name),
      })),
      stockStatus: stockStatusMap[product.stock_status] || 'in_stock',
      isOnSale: product.is_on_sale || false,
      isPurchasable: product.is_purchasable !== false,
    };
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Format price with currency
   */
  private formatPrice(
    amount: number,
    symbol: string,
    prefix?: string,
    suffix?: string
  ): string {
    const formatted = amount.toFixed(2);
    if (prefix) {
      return `${prefix}${formatted}${suffix || ''}`;
    }
    return `${symbol}${formatted}`;
  }

  /**
   * Build result for single product
   */
  private buildProductResult(
    product: NormalizedWooProduct,
    originalUrl: string
  ): SiteHandlerResult {
    const lines: string[] = [
      `# ${product.name}`,
      '',
    ];

    if (product.isOnSale && product.price.sale !== undefined) {
      lines.push(`**Price:** ~~${product.price.currencySymbol}${product.price.regular.toFixed(2)}~~ ${product.price.formatted} (On Sale)`);
    } else {
      lines.push(`**Price:** ${product.price.formatted}`);
    }

    if (product.rating > 0) {
      lines.push(`**Rating:** ${product.rating.toFixed(1)}/5 (${product.reviewCount} reviews)`);
    }

    lines.push(`**Stock:** ${product.stockStatus.replace(/_/g, ' ')}`);

    if (product.sku) {
      lines.push(`**SKU:** ${product.sku}`);
    }

    if (product.categories.length > 0) {
      lines.push(`**Categories:** ${product.categories.join(', ')}`);
    }

    if (product.shortDescription) {
      lines.push('', '## Description', '', product.shortDescription);
    }

    if (product.description && product.description !== product.shortDescription) {
      lines.push('', '## Full Description', '', product.description);
    }

    if (product.attributes.length > 0) {
      lines.push('', '## Attributes');
      for (const attr of product.attributes) {
        lines.push(`- **${attr.name}:** ${attr.values.join(', ')}`);
      }
    }

    if (product.tags.length > 0) {
      lines.push('', `**Tags:** ${product.tags.join(', ')}`);
    }

    const markdown = lines.join('\n');

    return {
      content: {
        title: product.name,
        text: this.markdownToText(markdown),
        markdown,
        structured: {
          '@type': 'Product',
          name: product.name,
          sku: product.sku,
          description: product.description || product.shortDescription,
          image: product.images[0]?.url,
          offers: {
            '@type': 'Offer',
            price: product.price.current,
            priceCurrency: product.price.currency,
            availability: product.stockStatus === 'in_stock'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
          aggregateRating: product.rating > 0 ? {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          } : undefined,
        },
      },
      meta: {
        url: originalUrl,
        finalUrl: product.url || originalUrl,
        strategy: 'api:woocommerce',
        confidence: 'high',
      },
      warnings: [],
    };
  }

  /**
   * Build result for product list
   */
  private buildProductListResult(
    products: NormalizedWooProduct[],
    originalUrl: string
  ): SiteHandlerResult {
    const lines: string[] = [
      `# WooCommerce Products`,
      '',
      `Found ${products.length} products`,
      '',
    ];

    for (const product of products) {
      lines.push(`## ${product.name}`);
      lines.push(`**Price:** ${product.price.formatted}`);
      if (product.rating > 0) {
        lines.push(`**Rating:** ${product.rating.toFixed(1)}/5`);
      }
      if (product.shortDescription) {
        lines.push('', product.shortDescription);
      }
      lines.push(`[View Product](${product.url})`, '');
    }

    const markdown = lines.join('\n');

    return {
      content: {
        title: `WooCommerce Products (${products.length} items)`,
        text: this.markdownToText(markdown),
        markdown,
        structured: {
          '@type': 'ItemList',
          numberOfItems: products.length,
          itemListElement: products.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'Product',
              name: p.name,
              url: p.url,
              offers: {
                '@type': 'Offer',
                price: p.price.current,
                priceCurrency: p.price.currency,
              },
            },
          })),
        },
      },
      meta: {
        url: originalUrl,
        finalUrl: originalUrl,
        strategy: 'api:woocommerce',
        confidence: 'high',
      },
      warnings: [],
    };
  }

  /**
   * Convert markdown to plain text
   */
  private markdownToText(markdown: string): string {
    return markdown
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^-\s*/gm, '• ')
      .trim();
  }
}

// Export singleton instance
export const woocommerceHandler = new WooCommerceHandler();
