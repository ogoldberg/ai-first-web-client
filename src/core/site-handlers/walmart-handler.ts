/**
 * Walmart Handler
 *
 * Extracts product data from Walmart.com
 * Uses embedded JSON data and structured data from product pages.
 *
 * URL Patterns:
 * - /ip/<title>/<id> - Product page
 * - /search?q=<query> - Search results
 * - /browse/<category> - Category page
 *
 * Data Sources:
 * - __NEXT_DATA__ (Next.js SSR data)
 * - JSON-LD structured data
 * - HTML parsing fallback
 *
 * Note: Walmart has strong anti-bot protection, so this handler
 * may need to be used with stealthFetch for reliable extraction.
 */

import { BaseSiteHandler, type SiteHandlerResult, type FetchFunction, type SiteHandlerOptions } from './types.js';
import { traverseObj, getString, getNumber, getArray, getObject } from '../traverse-obj.js';

/**
 * Normalized Walmart product data
 */
interface WalmartProduct {
  id: string;
  name: string;
  url: string;
  brand?: string;
  description?: string;
  shortDescription?: string;
  price: {
    current: number;
    was?: number;
    currency: string;
    formatted: string;
  };
  rating?: number;
  reviewCount?: number;
  images: string[];
  category?: string;
  availability: 'in_stock' | 'out_of_stock' | 'limited';
  fulfillment?: {
    pickup?: boolean;
    shipping?: boolean;
    delivery?: boolean;
  };
  seller?: string;
  specifications?: Array<{ name: string; value: string }>;
}

export class WalmartHandler extends BaseSiteHandler {
  name = 'walmart';
  strategy = 'api:walmart' as const;

  /**
   * Check if URL is a Walmart URL
   */
  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'www.walmart.com' || parsed.hostname === 'walmart.com';
    } catch {
      return false;
    }
  }

  /**
   * Extract data from Walmart
   */
  async extract(
    url: string,
    fetchFn: FetchFunction,
    _options: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();

      // Fetch the page
      const response = await fetchFn(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();

      // Determine page type
      if (path.startsWith('/ip/')) {
        return this.extractProduct(html, url);
      } else if (path.startsWith('/search') || parsed.searchParams.has('q')) {
        return this.extractSearchResults(html, url);
      } else if (path.startsWith('/browse/')) {
        return this.extractCategoryPage(html, url);
      }

      // Try product extraction as fallback
      return this.extractProduct(html, url);
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract product data from a product page
   */
  private extractProduct(html: string, url: string): SiteHandlerResult | null {
    // Try __NEXT_DATA__ first (most reliable)
    const nextData = this.extractNextData(html);
    if (nextData) {
      const product = this.parseNextDataProduct(nextData);
      if (product) {
        return this.buildProductResult(product, url);
      }
    }

    // Try JSON-LD
    const jsonLd = this.extractJsonLd(html);
    if (jsonLd) {
      const product = this.parseJsonLdProduct(jsonLd);
      if (product) {
        return this.buildProductResult(product, url);
      }
    }

    // HTML fallback
    const product = this.extractProductFromHtml(html, url);
    if (product) {
      return this.buildProductResult(product, url);
    }

    return null;
  }

  /**
   * Extract __NEXT_DATA__ from HTML
   */
  private extractNextData(html: string): Record<string, unknown> | null {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return null;

    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  /**
   * Extract JSON-LD structured data
   */
  private extractJsonLd(html: string): Record<string, unknown> | null {
    const matches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (!matches) return null;

    for (const match of matches) {
      const jsonMatch = match.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!jsonMatch) continue;

      try {
        const data = JSON.parse(jsonMatch[1]);
        // Look for Product schema
        if (data['@type'] === 'Product' || (Array.isArray(data['@graph']) && data['@graph'].some((item: any) => item['@type'] === 'Product'))) {
          return data;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Parse product from Next.js data
   */
  private parseNextDataProduct(nextData: Record<string, unknown>): WalmartProduct | null {
    // Walmart's Next.js structure - product data is typically in props.pageProps
    const productData = traverseObj(nextData, ['props', 'pageProps', 'initialData', 'data', 'product']) ||
                        traverseObj(nextData, ['props', 'pageProps', 'product']) ||
                        traverseObj(nextData, ['props', 'pageProps', 'initialProps', 'product']);

    if (!productData || typeof productData !== 'object') {
      return null;
    }

    const product = productData as Record<string, unknown>;

    const priceInfo = getObject(product, ['priceInfo']) || getObject(product, ['price']) || {};
    const currentPrice = getNumber(priceInfo, ['currentPrice', 'price']) ||
                         getNumber(priceInfo, ['currentPrice']) ||
                         getNumber(product, ['price']) || 0;

    const wasPrice = getNumber(priceInfo, ['wasPrice', 'price']) ||
                     getNumber(priceInfo, ['wasPrice']);

    const images = getArray<string>(product, ['imageInfo', 'allImages']) ||
                   getArray<string>(product, ['images']) ||
                   [];

    const imageUrls = images.map(img => {
      if (typeof img === 'string') return img;
      if (typeof img === 'object' && img !== null) {
        return (img as any).url || (img as any).src || '';
      }
      return '';
    }).filter(Boolean);

    const rating = getNumber(product, ['averageRating']) ||
                   getNumber(product, ['rating', 'averageRating']);
    const reviewCount = getNumber(product, ['numberOfReviews']) ||
                        getNumber(product, ['reviews', 'totalCount']);

    const availability = getString(product, ['availabilityStatus']) ||
                         getString(product, ['availability']);

    return {
      id: getString(product, ['usItemId']) || getString(product, ['id']) || '',
      name: getString(product, ['name']) || getString(product, ['title']) || '',
      url: getString(product, ['canonicalUrl']) || '',
      brand: getString(product, ['brand']) || getString(product, ['brandName']),
      description: getString(product, ['detailedDescription']) ||
                   getString(product, ['description']) ||
                   getString(product, ['shortDescription']),
      shortDescription: getString(product, ['shortDescription']),
      price: {
        current: currentPrice,
        was: wasPrice,
        currency: 'USD',
        formatted: `$${currentPrice.toFixed(2)}`,
      },
      rating,
      reviewCount,
      images: imageUrls,
      category: getString(product, ['category', 'path']) ||
                getString(product, ['categoryPath']),
      availability: this.parseAvailability(availability),
      seller: getString(product, ['sellerName']) ||
              getString(product, ['seller', 'name']),
    };
  }

  /**
   * Parse product from JSON-LD
   */
  private parseJsonLdProduct(jsonLd: Record<string, unknown>): WalmartProduct | null {
    let product = jsonLd;

    // Handle @graph structure
    if (Array.isArray(jsonLd['@graph'])) {
      const found = jsonLd['@graph'].find((item: any) => item['@type'] === 'Product');
      if (!found) return null;
      product = found;
    }

    if (product['@type'] !== 'Product') {
      return null;
    }

    const offers = getObject(product, ['offers']) || {};
    const price = getNumber(offers, ['price']) ||
                  parseFloat(getString(offers, ['price']) || '0');

    const aggregateRating = getObject(product, ['aggregateRating']) || {};

    const images = getArray<string>(product, ['image']) || [];
    const imageUrls = images.length > 0 ? images : (
      typeof product['image'] === 'string' ? [product['image'] as string] : []
    );

    return {
      id: getString(product, ['sku']) || getString(product, ['productID']) || '',
      name: getString(product, ['name']) || '',
      url: getString(product, ['url']) || '',
      brand: getString(product, ['brand', 'name']) || getString(product, ['brand']),
      description: getString(product, ['description']),
      price: {
        current: price,
        currency: getString(offers, ['priceCurrency']) || 'USD',
        formatted: `$${price.toFixed(2)}`,
      },
      rating: getNumber(aggregateRating, ['ratingValue']),
      reviewCount: getNumber(aggregateRating, ['reviewCount']),
      images: imageUrls,
      availability: this.parseSchemaAvailability(getString(offers, ['availability'])),
    };
  }

  /**
   * Extract product from HTML as fallback
   */
  private extractProductFromHtml(html: string, url: string): WalmartProduct | null {
    // Extract product ID from URL
    const idMatch = url.match(/\/ip\/[^\/]+\/(\d+)/);
    const id = idMatch ? idMatch[1] : '';

    // Extract title
    const titleMatch = html.match(/<h1[^>]*class="[^"]*prod-ProductTitle[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const name = titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : '';

    // Extract price
    const priceMatch = html.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : 0;

    // Extract rating
    const ratingMatch = html.match(/(\d+(?:\.\d+)?)\s*out of\s*5\s*stars/i) ||
                        html.match(/rating['":\s]+(\d+(?:\.\d+)?)/i);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

    // Extract review count
    const reviewMatch = html.match(/(\d+(?:,\d+)*)\s*(?:reviews?|ratings?)/i);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(',', '')) : undefined;

    // Extract images
    const imageMatches = html.match(/https:\/\/i5\.walmartimages\.com\/[^"'\s]+/g) || [];
    const images = [...new Set(imageMatches)].slice(0, 10);

    if (!name || price === 0) {
      return null;
    }

    return {
      id,
      name,
      url,
      price: {
        current: price,
        currency: 'USD',
        formatted: `$${price.toFixed(2)}`,
      },
      rating,
      reviewCount,
      images,
      availability: 'in_stock', // Default assumption
    };
  }

  /**
   * Parse Walmart availability status
   */
  private parseAvailability(status?: string): 'in_stock' | 'out_of_stock' | 'limited' {
    if (!status) return 'in_stock';
    const lower = status.toLowerCase();
    if (lower.includes('out') || lower.includes('unavailable')) return 'out_of_stock';
    if (lower.includes('limited') || lower.includes('low')) return 'limited';
    return 'in_stock';
  }

  /**
   * Parse schema.org availability
   */
  private parseSchemaAvailability(status?: string): 'in_stock' | 'out_of_stock' | 'limited' {
    if (!status) return 'in_stock';
    if (status.includes('OutOfStock') || status.includes('Discontinued')) return 'out_of_stock';
    if (status.includes('LimitedAvailability') || status.includes('PreOrder')) return 'limited';
    return 'in_stock';
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  /**
   * Extract search results
   */
  private extractSearchResults(html: string, url: string): SiteHandlerResult | null {
    const nextData = this.extractNextData(html);
    if (!nextData) {
      return null;
    }

    const items = getArray(nextData, ['props', 'pageProps', 'initialData', 'searchResult', 'itemStacks', 0, 'items']) ||
                  getArray(nextData, ['props', 'pageProps', 'searchResult', 'items']) ||
                  [];

    if (items.length === 0) {
      return null;
    }

    const products: WalmartProduct[] = [];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;

      const itemObj = item as Record<string, unknown>;
      const priceInfo = getObject(itemObj, ['priceInfo']) || {};

      products.push({
        id: getString(itemObj, ['usItemId']) || '',
        name: getString(itemObj, ['name']) || '',
        url: getString(itemObj, ['canonicalUrl']) || '',
        brand: getString(itemObj, ['brand']),
        price: {
          current: getNumber(priceInfo, ['currentPrice', 'price']) || 0,
          was: getNumber(priceInfo, ['wasPrice', 'price']),
          currency: 'USD',
          formatted: `$${(getNumber(priceInfo, ['currentPrice', 'price']) || 0).toFixed(2)}`,
        },
        rating: getNumber(itemObj, ['averageRating']),
        reviewCount: getNumber(itemObj, ['numberOfReviews']),
        images: [getString(itemObj, ['image']) || ''].filter(Boolean),
        availability: this.parseAvailability(getString(itemObj, ['availabilityStatus'])),
      });
    }

    return this.buildSearchResult(products, url);
  }

  /**
   * Extract category page
   */
  private extractCategoryPage(html: string, url: string): SiteHandlerResult | null {
    // Category pages use similar structure to search
    return this.extractSearchResults(html, url);
  }

  /**
   * Build result for single product
   */
  private buildProductResult(product: WalmartProduct, originalUrl: string): SiteHandlerResult {
    const lines: string[] = [
      `# ${product.name}`,
      '',
    ];

    if (product.brand) {
      lines.push(`**Brand:** ${product.brand}`);
    }

    if (product.price.was !== undefined && product.price.was > product.price.current) {
      lines.push(`**Price:** ~~$${product.price.was.toFixed(2)}~~ ${product.price.formatted}`);
    } else {
      lines.push(`**Price:** ${product.price.formatted}`);
    }

    if (product.rating !== undefined) {
      lines.push(`**Rating:** ${product.rating.toFixed(1)}/5${product.reviewCount ? ` (${product.reviewCount} reviews)` : ''}`);
    }

    lines.push(`**Availability:** ${product.availability.replace(/_/g, ' ')}`);

    if (product.seller) {
      lines.push(`**Sold by:** ${product.seller}`);
    }

    if (product.description) {
      lines.push('', '## Description', '', product.description);
    }

    if (product.specifications && product.specifications.length > 0) {
      lines.push('', '## Specifications');
      for (const spec of product.specifications) {
        lines.push(`- **${spec.name}:** ${spec.value}`);
      }
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
          sku: product.id,
          brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
          description: product.description,
          image: product.images[0],
          offers: {
            '@type': 'Offer',
            price: product.price.current,
            priceCurrency: product.price.currency,
            availability: product.availability === 'in_stock'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            seller: product.seller ? { '@type': 'Organization', name: product.seller } : undefined,
          },
          aggregateRating: product.rating ? {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.reviewCount || 0,
          } : undefined,
        },
      },
      meta: {
        url: originalUrl,
        finalUrl: product.url || originalUrl,
        strategy: 'api:walmart',
        confidence: 'high',
      },
      warnings: [],
    };
  }

  /**
   * Build result for search/category
   */
  private buildSearchResult(products: WalmartProduct[], url: string): SiteHandlerResult {
    const lines: string[] = [
      `# Walmart Products`,
      '',
      `Found ${products.length} products`,
      '',
    ];

    for (const product of products.slice(0, 20)) {
      lines.push(`## ${product.name}`);
      if (product.brand) {
        lines.push(`**Brand:** ${product.brand}`);
      }
      lines.push(`**Price:** ${product.price.formatted}`);
      if (product.rating !== undefined) {
        lines.push(`**Rating:** ${product.rating.toFixed(1)}/5`);
      }
      lines.push('');
    }

    const markdown = lines.join('\n');

    return {
      content: {
        title: `Walmart Products (${products.length} items)`,
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
              sku: p.id,
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
        url,
        finalUrl: url,
        strategy: 'api:walmart',
        confidence: 'medium',
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
export const walmartHandler = new WalmartHandler();
