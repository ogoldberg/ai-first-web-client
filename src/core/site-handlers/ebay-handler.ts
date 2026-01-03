/**
 * eBay Site Handler
 *
 * Extracts product data from eBay listings using multiple strategies:
 * 1. JSON-LD structured data (preferred)
 * 2. HTML parsing with known selectors
 * 3. Embedded JSON data blobs
 *
 * Supports all eBay international domains (.com, .co.uk, .de, etc.)
 *
 * @see https://oxylabs.io/blog/ebay-data-scraping-guide
 * @see https://scrapfly.io/blog/posts/how-to-scrape-ebay
 */

import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';
import { logger } from '../../utils/logger.js';
import { extractStructuredData, type ProductData } from '../structured-data-extractor.js';
import { getString, getNumber, getFirst } from '../traverse-obj.js';
import * as cheerio from 'cheerio';

const log = logger.intelligence;

type EbayUrlType = 'listing' | 'search' | 'seller' | 'unknown';

interface ParsedEbayUrl {
  type: EbayUrlType;
  itemId?: string;
  searchQuery?: string;
  sellerId?: string;
  domain?: string;
}

interface EbayProduct {
  itemId: string;
  title: string;
  price?: number;
  currency?: string;
  originalPrice?: number;
  condition?: string;
  seller?: {
    name: string;
    feedbackScore?: number;
    feedbackPercent?: number;
  };
  shipping?: {
    cost?: number;
    type?: string;
    location?: string;
  };
  images?: string[];
  description?: string;
  itemSpecifics?: Record<string, string>;
  bids?: number;
  watchers?: number;
  quantitySold?: number;
  quantityAvailable?: number;
  endTime?: string;
  listingType?: 'auction' | 'buy_now' | 'best_offer';
  returns?: string;
}

export class EbayHandler extends BaseSiteHandler {
  readonly name = 'eBay';
  readonly strategy = 'api:ebay' as const;

  // eBay international domains
  private static readonly DOMAINS = [
    'ebay.com',
    'ebay.co.uk',
    'ebay.de',
    'ebay.fr',
    'ebay.it',
    'ebay.es',
    'ebay.ca',
    'ebay.com.au',
    'ebay.at',
    'ebay.be',
    'ebay.ch',
    'ebay.ie',
    'ebay.nl',
    'ebay.pl',
    'ebay.com.sg',
    'ebay.com.hk',
    'ebay.co.jp',
  ];

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    return EbayHandler.DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname === `www.${domain}`
    );
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const parsed = this.parseEbayUrl(url);

    if (parsed.type === 'unknown') {
      return null;
    }

    try {
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
        log.debug(`eBay request returned ${response.status}`);
        return null;
      }

      const html = await response.text();

      switch (parsed.type) {
        case 'listing':
          return await this.extractListing(url, html, parsed.itemId!);
        case 'search':
          return await this.extractSearch(url, html, parsed.searchQuery!);
        default:
          return null;
      }
    } catch (error) {
      log.debug(`eBay extraction failed: ${error}`);
      return null;
    }
  }

  private parseEbayUrl(url: string): ParsedEbayUrl {
    const parsed = this.parseUrl(url);
    if (!parsed) return { type: 'unknown' };

    const domain = EbayHandler.DOMAINS.find(
      (d) => parsed.hostname === d || parsed.hostname === `www.${d}`
    );
    const path = parsed.pathname;

    // Listing page: /itm/TITLE/ITEM_ID or /itm/ITEM_ID
    const itemMatch = path.match(/\/itm\/(?:[^\/]+\/)?(\d+)/);
    if (itemMatch) {
      return { type: 'listing', itemId: itemMatch[1], domain };
    }

    // Search results: /sch/i.html?_nkw=query
    if (path.includes('/sch/')) {
      const query = parsed.searchParams.get('_nkw') || '';
      return { type: 'search', searchQuery: query, domain };
    }

    // Seller store: /usr/SELLER_ID
    const sellerMatch = path.match(/\/usr\/([^\/]+)/);
    if (sellerMatch) {
      return { type: 'seller', sellerId: sellerMatch[1], domain };
    }

    return { type: 'unknown', domain };
  }

  private async extractListing(
    url: string,
    html: string,
    itemId: string
  ): Promise<SiteHandlerResult | null> {
    let product: EbayProduct | null = null;

    // Try structured data first (JSON-LD)
    product = this.extractFromStructuredData(html, itemId);

    // Fallback to HTML parsing
    if (!product) {
      product = this.extractFromHtml(html, itemId);
    }

    if (!product) {
      return null;
    }

    const formatted = this.formatProduct(product);

    if (formatted.text.length < 50) {
      return null;
    }

    log.info('eBay listing extraction successful', {
      itemId,
      hasPrice: product.price !== undefined,
      hasSeller: !!product.seller,
    });

    return this.createResult(url, url, {
      title: formatted.title,
      text: formatted.text,
      markdown: formatted.markdown,
      structured: product as unknown as Record<string, unknown>,
    });
  }

  private extractFromStructuredData(html: string, itemId: string): EbayProduct | null {
    try {
      const structured = extractStructuredData(html);

      if (structured.product) {
        const p = structured.product;
        return {
          itemId,
          title: p.name || 'Unknown Item',
          price: p.price,
          currency: p.priceCurrency,
          condition: p.condition,
          description: p.description,
          images: Array.isArray(p.image) ? p.image : p.image ? [p.image] : undefined,
        };
      }
    } catch (error) {
      log.debug('Failed to extract eBay structured data', { error: String(error) });
    }

    return null;
  }

  private extractFromHtml(html: string, itemId: string): EbayProduct | null {
    try {
      const $ = cheerio.load(html);

      // Title
      const title =
        $('h1.x-item-title__mainTitle span').text().trim() ||
        $('h1#itemTitle').text().replace('Details about', '').trim() ||
        $('[data-testid="x-item-title"] span').text().trim();

      if (!title) {
        return null;
      }

      // Price
      const priceText =
        $('.x-price-primary span').first().text().trim() ||
        $('#prcIsum').text().trim() ||
        $('[data-testid="x-price-primary"]').text().trim();
      const { price, currency } = this.parsePrice(priceText);

      // Original price (if discounted)
      const originalPriceText = $('.x-price-approx__price--original').text().trim();
      const originalPrice = this.parsePrice(originalPriceText).price;

      // Condition
      const condition =
        $('.x-item-condition-text span').first().text().trim() ||
        $('#vi-itm-cond').text().trim();

      // Seller info
      const sellerName =
        $('.x-sellercard-atf__info__about-seller a').text().trim() ||
        $('a.mbg-id').text().trim();
      const feedbackText = $('.x-sellercard-atf__data-item span').first().text().trim();
      const feedbackMatch = feedbackText.match(/([\d.]+)%\s*positive/i);

      const seller = sellerName
        ? {
            name: sellerName,
            feedbackPercent: feedbackMatch ? parseFloat(feedbackMatch[1]) : undefined,
          }
        : undefined;

      // Shipping
      const shippingText =
        $('.ux-labels-values--shipping .ux-textspans').text().trim() ||
        $('#fshippingCost').text().trim();
      const shippingCost = shippingText.toLowerCase().includes('free') ? 0 : undefined;
      const shippingLocation = $('.ux-labels-values--itemLocation .ux-textspans--SECONDARY')
        .text()
        .trim();

      const shipping =
        shippingCost !== undefined || shippingLocation
          ? { cost: shippingCost, location: shippingLocation }
          : undefined;

      // Images
      const images: string[] = [];
      $('img.ux-image-magnify__image, img[data-testid="ux-image-magnify"]').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !images.includes(src)) {
          images.push(src.replace(/s-l\d+/, 's-l1600')); // Get high-res version
        }
      });

      // Item specifics
      const itemSpecifics: Record<string, string> = {};
      $('.ux-labels-values-list .ux-labels-values').each((_, el) => {
        const label = $(el).find('.ux-labels-values__labels').text().trim().replace(':', '');
        const value = $(el).find('.ux-labels-values__values').text().trim();
        if (label && value) {
          itemSpecifics[label] = value;
        }
      });

      // Auction-specific
      const bidsText = $('#vi-VR-bid-lnk').text().trim();
      const bids = bidsText ? parseInt(bidsText.replace(/\D/g, ''), 10) : undefined;

      const watchersText = $('.vi-notify-us-cnt').text().trim();
      const watchers = watchersText ? parseInt(watchersText.replace(/\D/g, ''), 10) : undefined;

      // Listing type
      let listingType: 'auction' | 'buy_now' | 'best_offer' = 'buy_now';
      if ($('#prcIsum_bidPrice').length > 0 || bids !== undefined) {
        listingType = 'auction';
      } else if ($('#boBtn_btn').length > 0) {
        listingType = 'best_offer';
      }

      // Returns
      const returns = $('.ux-labels-values--returns .ux-textspans').first().text().trim();

      return {
        itemId,
        title,
        price,
        currency,
        originalPrice,
        condition,
        seller,
        shipping,
        images: images.length > 0 ? images : undefined,
        itemSpecifics: Object.keys(itemSpecifics).length > 0 ? itemSpecifics : undefined,
        bids,
        watchers,
        listingType,
        returns: returns || undefined,
      };
    } catch (error) {
      log.debug('Failed to parse eBay HTML', { error: String(error) });
      return null;
    }
  }

  private parsePrice(priceText: string): { price?: number; currency?: string } {
    if (!priceText) return {};

    const currencySymbols: Record<string, string> = {
      $: 'USD',
      '£': 'GBP',
      '€': 'EUR',
      '¥': 'JPY',
      C$: 'CAD',
      AU$: 'AUD',
    };

    for (const [symbol, currency] of Object.entries(currencySymbols)) {
      if (priceText.includes(symbol)) {
        const numMatch = priceText.match(/[\d,]+\.?\d*/);
        if (numMatch) {
          const price = parseFloat(numMatch[0].replace(/,/g, ''));
          if (!isNaN(price)) {
            return { price, currency };
          }
        }
      }
    }

    // Try extracting just the number
    const numMatch = priceText.match(/[\d,]+\.?\d*/);
    if (numMatch) {
      const price = parseFloat(numMatch[0].replace(/,/g, ''));
      if (!isNaN(price)) {
        return { price, currency: 'USD' };
      }
    }

    return {};
  }

  private formatProduct(product: EbayProduct): {
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
      if (product.originalPrice && product.originalPrice > product.price) {
        const savings = product.originalPrice - product.price;
        const savingsPercent = Math.round((savings / product.originalPrice) * 100);
        lines.push(
          `Price: ${priceStr} (was ${product.currency || '$'}${product.originalPrice.toFixed(2)}, save ${savingsPercent}%)`
        );
      } else {
        lines.push(`Price: ${priceStr}`);
      }
    }

    if (product.listingType === 'auction' && product.bids !== undefined) {
      lines.push(`Bids: ${product.bids}`);
    }

    if (product.condition) {
      lines.push(`Condition: ${product.condition}`);
    }

    if (product.seller) {
      let sellerInfo = `Seller: ${product.seller.name}`;
      if (product.seller.feedbackPercent) {
        sellerInfo += ` (${product.seller.feedbackPercent}% positive)`;
      }
      lines.push(sellerInfo);
    }

    if (product.shipping) {
      const shippingStr =
        product.shipping.cost === 0
          ? 'Free Shipping'
          : product.shipping.cost !== undefined
            ? `$${product.shipping.cost.toFixed(2)} shipping`
            : 'Shipping available';
      lines.push(shippingStr);
      if (product.shipping.location) {
        lines.push(`Ships from: ${product.shipping.location}`);
      }
    }

    if (product.returns) {
      lines.push(`Returns: ${product.returns}`);
    }

    lines.push(`Item #: ${product.itemId}`);

    if (product.itemSpecifics) {
      lines.push('');
      lines.push('Item Specifics:');
      for (const [key, value] of Object.entries(product.itemSpecifics).slice(0, 10)) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    // Markdown format
    markdownLines.push(`# ${product.title}`);
    markdownLines.push('');

    if (product.price !== undefined) {
      const priceStr = `${product.currency || '$'}${product.price.toFixed(2)}`;
      if (product.originalPrice && product.originalPrice > product.price) {
        const savingsPercent = Math.round(
          ((product.originalPrice - product.price) / product.originalPrice) * 100
        );
        markdownLines.push(
          `**Price:** ${priceStr} ~~${product.currency || '$'}${product.originalPrice.toFixed(2)}~~ (${savingsPercent}% off)`
        );
      } else {
        markdownLines.push(`**Price:** ${priceStr}`);
      }
    }

    if (product.listingType === 'auction') {
      markdownLines.push(`**Type:** Auction${product.bids !== undefined ? ` (${product.bids} bids)` : ''}`);
    }

    if (product.condition) {
      markdownLines.push(`**Condition:** ${product.condition}`);
    }

    if (product.seller) {
      let sellerInfo = `**Seller:** ${product.seller.name}`;
      if (product.seller.feedbackPercent) {
        sellerInfo += ` (${product.seller.feedbackPercent}% positive feedback)`;
      }
      markdownLines.push(sellerInfo);
    }

    markdownLines.push(`**Item #:** \`${product.itemId}\``);
    markdownLines.push('');

    if (product.itemSpecifics && Object.keys(product.itemSpecifics).length > 0) {
      markdownLines.push('## Item Specifics');
      markdownLines.push('| Property | Value |');
      markdownLines.push('|----------|-------|');
      for (const [key, value] of Object.entries(product.itemSpecifics).slice(0, 15)) {
        markdownLines.push(`| ${key} | ${value} |`);
      }
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

  private async extractSearch(
    url: string,
    html: string,
    query: string
  ): Promise<SiteHandlerResult | null> {
    const $ = cheerio.load(html);
    const products: Array<{
      itemId: string;
      title: string;
      price?: number;
      shipping?: string;
      condition?: string;
    }> = [];

    // Try both old and new eBay layouts
    const selectors = ['.s-item', '.s-card'];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const $el = $(el);

        // Skip promotional items
        if ($el.find('.s-item__sep').length > 0) return;

        const itemLink = $el.find('a.s-item__link, a[data-testid="item-title"]').attr('href');
        const itemIdMatch = itemLink?.match(/\/itm\/(?:[^\/]+\/)?(\d+)/);
        if (!itemIdMatch) return;

        const title =
          $el.find('.s-item__title, [data-testid="item-title"] span').text().trim() ||
          $el.find('h3').text().trim();

        if (!title || title.toLowerCase().includes('shop on ebay')) return;

        const priceText = $el.find('.s-item__price, [data-testid="item-price"]').text().trim();
        const { price } = this.parsePrice(priceText);

        const shipping = $el.find('.s-item__shipping, [data-testid="item-shipping"]').text().trim();
        const condition = $el.find('.s-item__subtitle, .SECONDARY_INFO').text().trim();

        products.push({
          itemId: itemIdMatch[1],
          title,
          price,
          shipping: shipping || undefined,
          condition: condition || undefined,
        });
      });

      if (products.length > 0) break;
    }

    if (products.length === 0) {
      return null;
    }

    const lines: string[] = [];
    const markdownLines: string[] = [];

    lines.push(`eBay Search: "${query}"`);
    lines.push('='.repeat(40));
    lines.push(`Found ${products.length} listings`);
    lines.push('');

    markdownLines.push(`# eBay Search: "${query}"`);
    markdownLines.push('');
    markdownLines.push(`**Found:** ${products.length} listings`);
    markdownLines.push('');
    markdownLines.push('| Item | Price | Condition |');
    markdownLines.push('|------|-------|-----------|');

    for (const p of products.slice(0, 25)) {
      const priceStr = p.price !== undefined ? `$${p.price.toFixed(2)}` : '-';

      lines.push(`- ${p.title}`);
      lines.push(`  Item #${p.itemId} | ${priceStr}${p.condition ? ` | ${p.condition}` : ''}`);
      lines.push('');

      markdownLines.push(
        `| ${p.title.substring(0, 50)}... | ${priceStr} | ${p.condition || '-'} |`
      );
    }

    return this.createResult(url, url, {
      title: `eBay Search: "${query}"`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
      structured: { query, products, count: products.length },
    });
  }
}

// Export singleton instance
export const ebayHandler = new EbayHandler();
