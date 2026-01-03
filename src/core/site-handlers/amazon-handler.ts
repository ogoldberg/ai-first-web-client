/**
 * Amazon Site Handler
 *
 * Extracts product data from Amazon product pages.
 * Uses multiple extraction methods:
 * 1. JSON-LD structured data (preferred)
 * 2. HTML parsing with known selectors
 * 3. State data from embedded scripts
 *
 * Note: Amazon has aggressive bot detection. This handler works best with
 * the stealth fetch module for TLS fingerprint impersonation.
 *
 * @see https://github.com/omkarcloud/amazon-scraper
 */

import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';
import { logger } from '../../utils/logger.js';
import { extractStructuredData, type ProductData } from '../structured-data-extractor.js';
import { traverseObj, getString, getNumber, getArray } from '../traverse-obj.js';
import * as cheerio from 'cheerio';

const log = logger.intelligence;

type AmazonUrlType = 'product' | 'search' | 'category' | 'reviews' | 'unknown';

interface ParsedAmazonUrl {
  type: AmazonUrlType;
  asin?: string;
  searchQuery?: string;
  marketplace?: string;
}

/**
 * Amazon product data extracted from the page
 */
interface AmazonProduct {
  asin: string;
  title: string;
  price?: number;
  currency?: string;
  listPrice?: number;
  rating?: number;
  reviewCount?: number;
  availability?: string;
  brand?: string;
  category?: string;
  features?: string[];
  description?: string;
  images?: string[];
  isPrime?: boolean;
  seller?: string;
  fulfillment?: string;
}

export class AmazonHandler extends BaseSiteHandler {
  readonly name = 'Amazon';
  readonly strategy = 'api:amazon' as const;

  // Amazon marketplaces
  private static readonly MARKETPLACES = [
    'amazon.com',
    'amazon.co.uk',
    'amazon.de',
    'amazon.fr',
    'amazon.it',
    'amazon.es',
    'amazon.ca',
    'amazon.co.jp',
    'amazon.in',
    'amazon.com.br',
    'amazon.com.mx',
    'amazon.com.au',
    'amazon.nl',
    'amazon.se',
    'amazon.pl',
    'amazon.sg',
    'amazon.ae',
    'amazon.sa',
  ];

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    return AmazonHandler.MARKETPLACES.some(
      (marketplace) =>
        parsed.hostname === marketplace || parsed.hostname === `www.${marketplace}`
    );
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const parsed = this.parseAmazonUrl(url);

    if (parsed.type === 'unknown') {
      return null;
    }

    try {
      // Fetch the HTML page
      const response = await fetch(url, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        log.debug(`Amazon request returned ${response.status}`);
        return null;
      }

      const html = await response.text();

      // Check for CAPTCHA
      if (this.hasCaptcha(html)) {
        log.debug('Amazon CAPTCHA detected');
        return null;
      }

      switch (parsed.type) {
        case 'product':
          return await this.extractProduct(url, html, parsed.asin!);
        case 'search':
          return await this.extractSearch(url, html, parsed.searchQuery!);
        default:
          return null;
      }
    } catch (error) {
      log.debug(`Amazon extraction failed: ${error}`);
      return null;
    }
  }

  /**
   * Parse Amazon URL
   */
  private parseAmazonUrl(url: string): ParsedAmazonUrl {
    const parsed = this.parseUrl(url);
    if (!parsed) return { type: 'unknown' };

    const marketplace = AmazonHandler.MARKETPLACES.find(
      (m) => parsed.hostname === m || parsed.hostname === `www.${m}`
    );

    const path = parsed.pathname;

    // Product page: /dp/ASIN or /gp/product/ASIN or /PRODUCT-NAME/dp/ASIN
    const asinMatch = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (asinMatch) {
      return { type: 'product', asin: asinMatch[1], marketplace };
    }

    // Also handle product URLs like /PRODUCT-NAME/dp/ASIN/...
    const productMatch = path.match(/\/dp\/([A-Z0-9]{10})/i);
    if (productMatch) {
      return { type: 'product', asin: productMatch[1], marketplace };
    }

    // Search results: /s?k=query
    const searchQuery = parsed.searchParams.get('k');
    if (path.startsWith('/s') && searchQuery) {
      return { type: 'search', searchQuery, marketplace };
    }

    // Reviews: /product-reviews/ASIN
    const reviewMatch = path.match(/\/product-reviews\/([A-Z0-9]{10})/i);
    if (reviewMatch) {
      return { type: 'reviews', asin: reviewMatch[1], marketplace };
    }

    return { type: 'unknown', marketplace };
  }

  /**
   * Check if page has CAPTCHA
   */
  private hasCaptcha(html: string): boolean {
    const captchaMarkers = [
      'captcha',
      'validateCaptcha',
      'robot check',
      "we need to verify that you're not a robot",
      'Type the characters you see in this image',
    ];

    const htmlLower = html.toLowerCase();
    return captchaMarkers.some((marker) => htmlLower.includes(marker.toLowerCase()));
  }

  /**
   * Extract product data
   */
  private async extractProduct(
    url: string,
    html: string,
    asin: string
  ): Promise<SiteHandlerResult | null> {
    // Try multiple extraction methods
    let product: AmazonProduct | null = null;

    // 1. Try structured data (JSON-LD) first
    product = this.extractFromStructuredData(html, asin);

    // 2. If that fails, try HTML parsing
    if (!product) {
      product = this.extractFromHtml(html, asin);
    }

    if (!product) {
      return null;
    }

    const formatted = this.formatProduct(product);

    if (formatted.text.length < 50) {
      return null;
    }

    log.info('Amazon product extraction successful', {
      asin,
      hasPrice: product.price !== undefined,
      hasRating: product.rating !== undefined,
    });

    return this.createResult(url, url, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: product as unknown as Record<string, unknown>,
    });
  }

  /**
   * Extract product from JSON-LD structured data
   */
  private extractFromStructuredData(html: string, asin: string): AmazonProduct | null {
    try {
      const structured = extractStructuredData(html);

      if (structured.product) {
        const p = structured.product;
        return {
          asin,
          title: p.name || 'Unknown Product',
          price: p.price,
          currency: p.priceCurrency,
          rating: p.rating?.value,
          reviewCount: p.rating?.count,
          availability: p.availability,
          brand: p.brand,
          category: p.category,
          description: p.description,
          images: Array.isArray(p.image) ? p.image : p.image ? [p.image] : undefined,
        };
      }
    } catch (error) {
      log.debug('Failed to extract Amazon structured data', { error: String(error) });
    }

    return null;
  }

  /**
   * Extract product from HTML using known selectors
   */
  private extractFromHtml(html: string, asin: string): AmazonProduct | null {
    try {
      const $ = cheerio.load(html);

      // Title
      const title =
        $('#productTitle').text().trim() ||
        $('#title span').first().text().trim() ||
        $('h1.a-size-large').first().text().trim();

      if (!title) {
        return null;
      }

      // Price - try multiple selectors
      const priceSelectors = [
        '.a-price .a-offscreen',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '#priceblock_saleprice',
        '.apexPriceToPay .a-offscreen',
        '#corePrice_feature_div .a-offscreen',
        '.priceToPay .a-offscreen',
      ];

      let price: number | undefined;
      let currency: string | undefined;

      for (const selector of priceSelectors) {
        const priceText = $(selector).first().text().trim();
        if (priceText) {
          const parsed = this.parsePrice(priceText);
          if (parsed) {
            price = parsed.price;
            currency = parsed.currency;
            break;
          }
        }
      }

      // List price (strike-through price)
      const listPriceText = $('.a-text-price .a-offscreen').first().text().trim();
      const listPrice = listPriceText ? this.parsePrice(listPriceText)?.price : undefined;

      // Rating
      const ratingText = $('#acrPopover').attr('title') || $('span.a-icon-alt').first().text();
      const rating = this.parseRating(ratingText);

      // Review count
      const reviewText = $('#acrCustomerReviewText').text().trim();
      const reviewCount = this.parseReviewCount(reviewText);

      // Availability
      const availability =
        $('#availability span').first().text().trim() ||
        $('#availability_feature_div .a-size-medium').first().text().trim();

      // Brand
      const brand =
        $('#bylineInfo').text().trim().replace(/^(Visit the |Brand: )/, '') ||
        $('a#bylineInfo').text().trim();

      // Features (bullet points)
      const features: string[] = [];
      $('#feature-bullets li span.a-list-item').each((_, el) => {
        const text = $(el).text().trim();
        if (text && !text.includes('Make sure this fits')) {
          features.push(text);
        }
      });

      // Description
      const description =
        $('#productDescription p').text().trim() ||
        $('#productDescription_feature_div').text().trim();

      // Main image
      const images: string[] = [];
      const mainImage = $('#landingImage').attr('data-old-hires') || $('#landingImage').attr('src');
      if (mainImage) {
        images.push(mainImage);
      }

      // Additional images
      $('#altImages img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !src.includes('play-button')) {
          // Get high-res version
          const highRes = src.replace(/\._[A-Z0-9_]+_\./, '.');
          if (!images.includes(highRes)) {
            images.push(highRes);
          }
        }
      });

      // Prime badge
      const isPrime = html.includes('a-icon-prime') || html.includes('Prime FREE Delivery');

      // Seller
      const seller =
        $('#sellerProfileTriggerId').text().trim() ||
        $('#merchant-info a').first().text().trim();

      // Category
      const category = $('#wayfinding-breadcrumbs_feature_div a').last().text().trim();

      return {
        asin,
        title,
        price,
        currency,
        listPrice,
        rating,
        reviewCount,
        availability,
        brand,
        category,
        features: features.length > 0 ? features : undefined,
        description,
        images: images.length > 0 ? images : undefined,
        isPrime,
        seller: seller || undefined,
      };
    } catch (error) {
      log.debug('Failed to parse Amazon HTML', { error: String(error) });
      return null;
    }
  }

  /**
   * Parse price string
   */
  private parsePrice(priceText: string): { price: number; currency: string } | null {
    // Remove whitespace
    const text = priceText.trim();

    // Match common price formats
    const currencySymbols: Record<string, string> = {
      $: 'USD',
      '£': 'GBP',
      '€': 'EUR',
      '¥': 'JPY',
      '₹': 'INR',
      C$: 'CAD',
      A$: 'AUD',
      R$: 'BRL',
    };

    for (const [symbol, currency] of Object.entries(currencySymbols)) {
      if (text.includes(symbol)) {
        const numMatch = text.match(/[\d,]+\.?\d*/);
        if (numMatch) {
          const price = parseFloat(numMatch[0].replace(/,/g, ''));
          if (!isNaN(price)) {
            return { price, currency };
          }
        }
      }
    }

    // Try generic number extraction
    const numMatch = text.match(/[\d,]+\.?\d*/);
    if (numMatch) {
      const price = parseFloat(numMatch[0].replace(/,/g, ''));
      if (!isNaN(price)) {
        return { price, currency: 'USD' };
      }
    }

    return null;
  }

  /**
   * Parse rating text
   */
  private parseRating(ratingText: string): number | undefined {
    if (!ratingText) return undefined;

    const match = ratingText.match(/(\d+\.?\d*)\s*out of\s*(\d+)/);
    if (match) {
      return parseFloat(match[1]);
    }

    const simpleMatch = ratingText.match(/(\d+\.?\d*)/);
    if (simpleMatch) {
      return parseFloat(simpleMatch[1]);
    }

    return undefined;
  }

  /**
   * Parse review count text
   */
  private parseReviewCount(text: string): number | undefined {
    if (!text) return undefined;

    const match = text.match(/([\d,]+)/);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''), 10);
    }

    return undefined;
  }

  /**
   * Format product for output
   */
  private formatProduct(product: AmazonProduct): {
    title: string;
    text: string;
    markdown: string;
  } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(product.title);
    lines.push('='.repeat(Math.min(product.title.length, 60)));
    lines.push('');

    if (product.price !== undefined) {
      const priceStr = `${product.currency || '$'}${product.price.toFixed(2)}`;
      if (product.listPrice && product.listPrice > product.price) {
        const savings = product.listPrice - product.price;
        const savingsPercent = Math.round((savings / product.listPrice) * 100);
        lines.push(
          `Price: ${priceStr} (was ${product.currency || '$'}${product.listPrice.toFixed(2)}, save ${savingsPercent}%)`
        );
      } else {
        lines.push(`Price: ${priceStr}`);
      }
    }

    if (product.rating !== undefined) {
      const stars = '★'.repeat(Math.round(product.rating)) + '☆'.repeat(5 - Math.round(product.rating));
      const reviewStr = product.reviewCount
        ? ` (${this.formatNumber(product.reviewCount)} reviews)`
        : '';
      lines.push(`Rating: ${product.rating}/5 ${stars}${reviewStr}`);
    }

    if (product.availability) {
      lines.push(`Availability: ${product.availability}`);
    }

    if (product.isPrime) {
      lines.push('Prime: Yes');
    }

    if (product.brand) {
      lines.push(`Brand: ${product.brand}`);
    }

    if (product.category) {
      lines.push(`Category: ${product.category}`);
    }

    if (product.seller) {
      lines.push(`Sold by: ${product.seller}`);
    }

    lines.push(`ASIN: ${product.asin}`);

    if (product.features && product.features.length > 0) {
      lines.push('');
      lines.push('Features:');
      for (const feature of product.features.slice(0, 10)) {
        lines.push(`  • ${feature}`);
      }
    }

    if (product.description) {
      lines.push('');
      lines.push('Description:');
      lines.push(product.description);
    }

    // Markdown format
    markdownLines.push(`# ${product.title}`);
    markdownLines.push('');

    if (product.price !== undefined) {
      const priceStr = `${product.currency || '$'}${product.price.toFixed(2)}`;
      if (product.listPrice && product.listPrice > product.price) {
        const savings = product.listPrice - product.price;
        const savingsPercent = Math.round((savings / product.listPrice) * 100);
        markdownLines.push(
          `**Price:** ${priceStr} ~~${product.currency || '$'}${product.listPrice.toFixed(2)}~~ (${savingsPercent}% off)`
        );
      } else {
        markdownLines.push(`**Price:** ${priceStr}`);
      }
    }

    if (product.rating !== undefined) {
      const reviewStr = product.reviewCount
        ? ` (${this.formatNumber(product.reviewCount)} reviews)`
        : '';
      markdownLines.push(`**Rating:** ${product.rating}/5 stars${reviewStr}`);
    }

    if (product.availability) {
      markdownLines.push(`**Availability:** ${product.availability}`);
    }

    if (product.isPrime) {
      markdownLines.push('**Prime:** ✓ Prime eligible');
    }

    if (product.brand) {
      markdownLines.push(`**Brand:** ${product.brand}`);
    }

    markdownLines.push(`**ASIN:** \`${product.asin}\``);
    markdownLines.push('');

    if (product.features && product.features.length > 0) {
      markdownLines.push('## Features');
      for (const feature of product.features.slice(0, 10)) {
        markdownLines.push(`- ${feature}`);
      }
      markdownLines.push('');
    }

    if (product.description) {
      markdownLines.push('## Description');
      markdownLines.push(product.description);
      markdownLines.push('');
    }

    if (product.images && product.images.length > 0) {
      markdownLines.push('## Images');
      for (const img of product.images.slice(0, 3)) {
        markdownLines.push(`![Product Image](${img})`);
      }
    }

    return {
      title: product.title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Extract search results
   */
  private async extractSearch(
    url: string,
    html: string,
    query: string
  ): Promise<SiteHandlerResult | null> {
    const $ = cheerio.load(html);
    const products: Array<{
      asin: string;
      title: string;
      price?: number;
      rating?: number;
      reviewCount?: number;
      isPrime?: boolean;
    }> = [];

    // Find search result items
    $('[data-asin]').each((_, el) => {
      const $el = $(el);
      const asin = $el.attr('data-asin');

      if (!asin || asin.length !== 10) return;

      const title =
        $el.find('h2 a span').text().trim() || $el.find('.a-text-normal').first().text().trim();

      if (!title) return;

      const priceText = $el.find('.a-price .a-offscreen').first().text().trim();
      const price = priceText ? this.parsePrice(priceText)?.price : undefined;

      const ratingText = $el.find('.a-icon-star-small span.a-icon-alt').text();
      const rating = this.parseRating(ratingText);

      const reviewText = $el.find('[aria-label*="reviews"]').attr('aria-label') || '';
      const reviewCount = this.parseReviewCount(reviewText);

      const isPrime = $el.find('.a-icon-prime').length > 0;

      products.push({ asin, title, price, rating, reviewCount, isPrime });
    });

    if (products.length === 0) {
      return null;
    }

    const lines: string[] = [];
    const markdownLines: string[] = [];

    lines.push(`Search Results for: "${query}"`);
    lines.push('='.repeat(40));
    lines.push(`Found ${products.length} products`);
    lines.push('');

    markdownLines.push(`# Amazon Search: "${query}"`);
    markdownLines.push('');
    markdownLines.push(`**Found:** ${products.length} products`);
    markdownLines.push('');
    markdownLines.push('| Product | Price | Rating |');
    markdownLines.push('|---------|-------|--------|');

    for (const p of products.slice(0, 20)) {
      const priceStr = p.price !== undefined ? `$${p.price.toFixed(2)}` : '-';
      const ratingStr = p.rating !== undefined ? `${p.rating}/5` : '-';

      lines.push(`- ${p.title}`);
      lines.push(`  ASIN: ${p.asin} | Price: ${priceStr} | Rating: ${ratingStr}`);
      lines.push('');

      markdownLines.push(
        `| ${p.title.substring(0, 50)}... | ${priceStr} | ${ratingStr} |`
      );
    }

    return this.createResult(url, url, {
      title: `Amazon Search: "${query}"`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
      structured: { query, products, count: products.length },
    });
  }
}

// Export singleton instance
export const amazonHandler = new AmazonHandler();
