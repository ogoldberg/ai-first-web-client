/**
 * Structured Data Extractor
 *
 * Comprehensive extraction of structured metadata from HTML pages.
 * Inspired by Python's extruct library, supports multiple formats:
 *
 * - JSON-LD (Google's preferred format)
 * - Microdata (schema.org HTML5 attributes)
 * - OpenGraph (Facebook meta tags)
 * - Twitter Cards (Twitter meta tags)
 * - Dublin Core (Document metadata)
 * - RDFa Lite (Resource Description Framework)
 *
 * @see https://github.com/scrapinghub/extruct
 * @see https://schema.org/
 * @see https://ogp.me/
 */

import * as cheerio from 'cheerio';
import { traverseObj, getString, getArray, getFirst } from './traverse-obj.js';

/**
 * Extracted structured data result
 */
export interface StructuredDataResult {
  /** JSON-LD structured data */
  jsonLd: JsonLdItem[];
  /** Microdata items */
  microdata: MicrodataItem[];
  /** OpenGraph metadata */
  openGraph: OpenGraphData;
  /** Twitter Card metadata */
  twitterCard: TwitterCardData;
  /** Dublin Core metadata */
  dublinCore: DublinCoreData;
  /** RDFa Lite items */
  rdfa: RdfaItem[];
  /** Combined/normalized product data (if applicable) */
  product?: ProductData;
  /** Combined/normalized article data (if applicable) */
  article?: ArticleData;
  /** Combined/normalized organization data (if applicable) */
  organization?: OrganizationData;
  /** Raw meta tags */
  meta: Record<string, string>;
}

export interface JsonLdItem {
  '@context'?: string;
  '@type': string;
  [key: string]: unknown;
}

export interface MicrodataItem {
  type: string;
  properties: Record<string, unknown>;
}

export interface OpenGraphData {
  title?: string;
  type?: string;
  url?: string;
  image?: string | string[];
  description?: string;
  siteName?: string;
  locale?: string;
  [key: string]: unknown;
}

export interface TwitterCardData {
  card?: string;
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  image?: string;
  [key: string]: unknown;
}

export interface DublinCoreData {
  title?: string;
  creator?: string;
  subject?: string;
  description?: string;
  publisher?: string;
  contributor?: string;
  date?: string;
  type?: string;
  format?: string;
  identifier?: string;
  source?: string;
  language?: string;
  relation?: string;
  coverage?: string;
  rights?: string;
}

export interface RdfaItem {
  typeof: string;
  properties: Record<string, unknown>;
}

/**
 * Normalized product data from any structured data source
 */
export interface ProductData {
  name?: string;
  description?: string;
  brand?: string;
  sku?: string;
  gtin?: string;
  mpn?: string;
  price?: number;
  priceCurrency?: string;
  availability?: string;
  condition?: string;
  image?: string | string[];
  url?: string;
  rating?: {
    value: number;
    count: number;
    best?: number;
  };
  reviews?: Array<{
    author?: string;
    rating?: number;
    text?: string;
    date?: string;
  }>;
  category?: string;
  offers?: Array<{
    price: number;
    currency: string;
    seller?: string;
    availability?: string;
  }>;
}

/**
 * Normalized article data from any structured data source
 */
export interface ArticleData {
  headline?: string;
  description?: string;
  author?: string | string[];
  datePublished?: string;
  dateModified?: string;
  publisher?: string;
  image?: string | string[];
  wordCount?: number;
  articleBody?: string;
  section?: string;
  keywords?: string[];
}

/**
 * Normalized organization data
 */
export interface OrganizationData {
  name?: string;
  url?: string;
  logo?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  sameAs?: string[];
}

/**
 * Extract all structured data from HTML
 */
export function extractStructuredData(html: string, baseUrl?: string): StructuredDataResult {
  const $ = cheerio.load(html);

  const jsonLd = extractJsonLd($);
  const microdata = extractMicrodata($);
  const openGraph = extractOpenGraph($);
  const twitterCard = extractTwitterCard($);
  const dublinCore = extractDublinCore($);
  const rdfa = extractRdfa($);
  const meta = extractAllMeta($);

  const result: StructuredDataResult = {
    jsonLd,
    microdata,
    openGraph,
    twitterCard,
    dublinCore,
    rdfa,
    meta,
  };

  // Try to extract normalized product data
  const product = extractNormalizedProduct(result);
  if (product) {
    result.product = product;
  }

  // Try to extract normalized article data
  const article = extractNormalizedArticle(result);
  if (article) {
    result.article = article;
  }

  // Try to extract normalized organization data
  const organization = extractNormalizedOrganization(result);
  if (organization) {
    result.organization = organization;
  }

  return result;
}

/**
 * Extract JSON-LD from script tags
 */
function extractJsonLd($: cheerio.CheerioAPI): JsonLdItem[] {
  const items: JsonLdItem[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;

      const data = JSON.parse(content);

      // Handle @graph arrays
      if (data['@graph'] && Array.isArray(data['@graph'])) {
        for (const item of data['@graph']) {
          if (item['@type']) {
            items.push(item as JsonLdItem);
          }
        }
      } else if (Array.isArray(data)) {
        // Handle arrays of items
        for (const item of data) {
          if (item['@type']) {
            items.push(item as JsonLdItem);
          }
        }
      } else if (data['@type']) {
        items.push(data as JsonLdItem);
      }
    } catch {
      // Invalid JSON, skip
    }
  });

  return items;
}

/**
 * Extract Microdata (schema.org HTML5 attributes)
 */
function extractMicrodata($: cheerio.CheerioAPI): MicrodataItem[] {
  const items: MicrodataItem[] = [];

  // Find all itemscope elements
  $('[itemscope]').each((_, el) => {
    const $el = $(el);

    // Skip nested itemscopes (they'll be processed as properties of their parent)
    if ($el.parents('[itemscope]').length > 0) {
      return;
    }

    const item = extractMicrodataItem($, $el);
    if (item) {
      items.push(item);
    }
  });

  return items;
}

/**
 * Extract a single microdata item
 */
function extractMicrodataItem(
  $: cheerio.CheerioAPI,
  $el: ReturnType<cheerio.CheerioAPI>
): MicrodataItem | null {
  const itemtype = $el.attr('itemtype');
  if (!itemtype) return null;

  // Extract type from URL (e.g., "https://schema.org/Product" -> "Product")
  const type = itemtype.split('/').pop() || itemtype;
  const properties: Record<string, unknown> = {};

  // Find all itemprop elements within this itemscope
  $el.find('[itemprop]').each((_, propEl) => {
    const $prop = $(propEl);

    // Skip if this property belongs to a nested itemscope
    const closestScope = $prop.closest('[itemscope]');
    if (!closestScope.is($el)) {
      return;
    }

    const propName = $prop.attr('itemprop');
    if (!propName) return;

    let value: unknown;

    // Check if this is a nested item
    if ($prop.is('[itemscope]')) {
      value = extractMicrodataItem($, $prop);
    } else {
      // Get value based on element type
      const tagName = $prop.prop('tagName')?.toLowerCase();

      switch (tagName) {
        case 'meta':
          value = $prop.attr('content');
          break;
        case 'a':
        case 'link':
          value = $prop.attr('href');
          break;
        case 'img':
        case 'audio':
        case 'video':
        case 'source':
          value = $prop.attr('src');
          break;
        case 'time':
          value = $prop.attr('datetime') || $prop.text().trim();
          break;
        case 'data':
          value = $prop.attr('value');
          break;
        default:
          value = $prop.text().trim();
      }
    }

    // Handle multiple values for same property
    if (properties[propName] !== undefined) {
      if (Array.isArray(properties[propName])) {
        (properties[propName] as unknown[]).push(value);
      } else {
        properties[propName] = [properties[propName], value];
      }
    } else {
      properties[propName] = value;
    }
  });

  return { type, properties };
}

/**
 * Extract OpenGraph metadata
 */
function extractOpenGraph($: cheerio.CheerioAPI): OpenGraphData {
  const data: OpenGraphData = {};
  const images: string[] = [];

  $('meta[property^="og:"]').each((_, el) => {
    const $el = $(el);
    const property = $el.attr('property')?.replace('og:', '');
    const content = $el.attr('content');

    if (!property || !content) return;

    // Handle multiple images
    if (property === 'image' || property === 'image:url') {
      images.push(content);
    } else {
      // Convert property name: og:image:width -> imageWidth, og:site_name -> siteName
      const key = property
        .replace(/:(.)/g, (_: string, c: string) => c.toUpperCase())
        .replace(/_(.)/g, (_: string, c: string) => c.toUpperCase());
      data[key] = content;
    }
  });

  if (images.length > 0) {
    data.image = images.length === 1 ? images[0] : images;
  }

  return data;
}

/**
 * Extract Twitter Card metadata
 */
function extractTwitterCard($: cheerio.CheerioAPI): TwitterCardData {
  const data: TwitterCardData = {};

  $('meta[name^="twitter:"]').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name')?.replace('twitter:', '');
    const content = $el.attr('content');

    if (!name || !content) return;
    data[name] = content;
  });

  return data;
}

/**
 * Extract Dublin Core metadata
 */
function extractDublinCore($: cheerio.CheerioAPI): DublinCoreData {
  const data: DublinCoreData = {};

  // DC uses various naming conventions
  const selectors = [
    'meta[name^="dc."]',
    'meta[name^="DC."]',
    'meta[name^="dcterms."]',
    'meta[name^="DCTERMS."]',
    'link[rel="schema.DC"]',
  ];

  $(selectors.join(', ')).each((_, el) => {
    const $el = $(el);
    const name = ($el.attr('name') || $el.attr('rel'))?.toLowerCase();
    const content = $el.attr('content') || $el.attr('href');

    if (!name || !content) return;

    // Extract the property name (dc.title -> title)
    const prop = name.split('.').pop() as keyof DublinCoreData;
    if (prop && prop in getDefaultDublinCore()) {
      data[prop] = content;
    }
  });

  return data;
}

function getDefaultDublinCore(): DublinCoreData {
  return {
    title: undefined,
    creator: undefined,
    subject: undefined,
    description: undefined,
    publisher: undefined,
    contributor: undefined,
    date: undefined,
    type: undefined,
    format: undefined,
    identifier: undefined,
    source: undefined,
    language: undefined,
    relation: undefined,
    coverage: undefined,
    rights: undefined,
  };
}

/**
 * Extract RDFa Lite attributes
 */
function extractRdfa($: cheerio.CheerioAPI): RdfaItem[] {
  const items: RdfaItem[] = [];

  // Find elements with typeof attribute (RDFa type definition)
  $('[typeof]').each((_, el) => {
    const $el = $(el);
    const type = $el.attr('typeof');
    if (!type) return;

    const properties: Record<string, unknown> = {};

    // Find property attributes within this element
    $el.find('[property]').each((_, propEl) => {
      const $prop = $(propEl);

      // Skip if belongs to nested typeof
      const closestTypeof = $prop.closest('[typeof]');
      if (!closestTypeof.is($el)) return;

      const propName = $prop.attr('property');
      if (!propName) return;

      // Get value
      let value =
        $prop.attr('content') ||
        $prop.attr('href') ||
        $prop.attr('src') ||
        $prop.text().trim();

      properties[propName] = value;
    });

    items.push({ typeof: type, properties });
  });

  return items;
}

/**
 * Extract all meta tags
 */
function extractAllMeta($: cheerio.CheerioAPI): Record<string, string> {
  const meta: Record<string, string> = {};

  $('meta[name], meta[property]').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name') || $el.attr('property');
    const content = $el.attr('content');

    if (name && content) {
      meta[name] = content;
    }
  });

  return meta;
}

/**
 * Extract normalized product data from all sources
 */
function extractNormalizedProduct(data: StructuredDataResult): ProductData | undefined {
  // Try JSON-LD Product first
  const jsonLdProduct = data.jsonLd.find(
    (item) =>
      item['@type'] === 'Product' ||
      (Array.isArray(item['@type']) && item['@type'].includes('Product'))
  );

  if (jsonLdProduct) {
    return normalizeProductFromJsonLd(jsonLdProduct);
  }

  // Try Microdata Product
  const microdataProduct = data.microdata.find((item) => item.type === 'Product');
  if (microdataProduct) {
    return normalizeProductFromMicrodata(microdataProduct);
  }

  // Try to construct from OpenGraph + meta
  if (data.openGraph.type === 'product' || data.meta['product:price:amount']) {
    return normalizeProductFromMeta(data);
  }

  return undefined;
}

function normalizeProductFromJsonLd(item: JsonLdItem): ProductData {
  const product: ProductData = {};

  product.name = getString(item, ['name']);
  product.description = getString(item, ['description']);
  product.sku = getString(item, ['sku']);
  product.gtin = getString(item, ['gtin'], ['gtin13'], ['gtin12'], ['gtin8']);
  product.mpn = getString(item, ['mpn']);
  product.url = getString(item, ['url']);
  product.category = getString(item, ['category']);

  // Brand
  const brand = getFirst(item, ['brand']);
  if (typeof brand === 'string') {
    product.brand = brand;
  } else if (brand && typeof brand === 'object') {
    product.brand = getString(brand, ['name']);
  }

  // Image
  const image = getFirst(item, ['image']);
  if (typeof image === 'string') {
    product.image = image;
  } else if (Array.isArray(image)) {
    product.image = image.map((img) => (typeof img === 'string' ? img : getString(img, ['url']) || '')).filter(Boolean);
  } else if (image && typeof image === 'object') {
    product.image = getString(image, ['url']);
  }

  // Offers
  const offers = getFirst(item, ['offers']);
  if (offers) {
    const offersList = Array.isArray(offers) ? offers : [offers];
    product.offers = offersList.map((offer) => ({
      price: parseFloat(getString(offer, ['price']) || '0'),
      currency: getString(offer, ['priceCurrency']) || 'USD',
      availability: getString(offer, ['availability']),
      seller: getString(offer, ['seller', 'name']),
    }));

    // Set main price from first offer
    if (product.offers.length > 0) {
      product.price = product.offers[0].price;
      product.priceCurrency = product.offers[0].currency;
      product.availability = product.offers[0].availability;
    }
  }

  // Rating
  const rating = getFirst(item, ['aggregateRating']);
  if (rating && typeof rating === 'object') {
    product.rating = {
      value: parseFloat(getString(rating, ['ratingValue']) || '0'),
      count: parseInt(getString(rating, ['reviewCount'], ['ratingCount']) || '0', 10),
      best: parseFloat(getString(rating, ['bestRating']) || '5'),
    };
  }

  // Reviews
  const reviews = getArray(item, ['review']);
  if (reviews && reviews.length > 0) {
    product.reviews = reviews.slice(0, 10).map((review) => ({
      author: getString(review, ['author', 'name'], ['author']),
      rating: parseFloat(getString(review, ['reviewRating', 'ratingValue']) || '0'),
      text: getString(review, ['reviewBody'], ['description']),
      date: getString(review, ['datePublished']),
    }));
  }

  return product;
}

function normalizeProductFromMicrodata(item: MicrodataItem): ProductData {
  const { properties } = item;
  const product: ProductData = {};

  product.name = getString(properties, ['name']);
  product.description = getString(properties, ['description']);
  product.sku = getString(properties, ['sku']);
  product.brand = getString(properties, ['brand']);
  product.image = getString(properties, ['image']);

  // Get price from offers
  const offers = properties.offers;
  if (offers && typeof offers === 'object') {
    const offerProps = (offers as MicrodataItem).properties || offers;
    product.price = parseFloat(getString(offerProps, ['price']) || '0');
    product.priceCurrency = getString(offerProps, ['priceCurrency']);
    product.availability = getString(offerProps, ['availability']);
  }

  return product;
}

function normalizeProductFromMeta(data: StructuredDataResult): ProductData {
  const product: ProductData = {};

  product.name = data.openGraph.title || data.meta['product:name'];
  product.description = data.openGraph.description;
  product.image = data.openGraph.image;
  product.url = data.openGraph.url;

  if (data.meta['product:price:amount']) {
    product.price = parseFloat(data.meta['product:price:amount']);
    product.priceCurrency = data.meta['product:price:currency'];
  }

  if (data.meta['product:availability']) {
    product.availability = data.meta['product:availability'];
  }

  if (data.meta['product:brand']) {
    product.brand = data.meta['product:brand'];
  }

  return product;
}

/**
 * Extract normalized article data from all sources
 */
function extractNormalizedArticle(data: StructuredDataResult): ArticleData | undefined {
  // Try JSON-LD Article
  const articleTypes = ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'ScholarlyArticle'];
  const jsonLdArticle = data.jsonLd.find(
    (item) =>
      articleTypes.includes(item['@type'] as string) ||
      (Array.isArray(item['@type']) && item['@type'].some((t) => articleTypes.includes(t)))
  );

  if (jsonLdArticle) {
    return normalizeArticleFromJsonLd(jsonLdArticle);
  }

  // Try Microdata Article
  const microdataArticle = data.microdata.find((item) => articleTypes.includes(item.type));
  if (microdataArticle) {
    return normalizeArticleFromMicrodata(microdataArticle);
  }

  // Try OpenGraph article
  if (data.openGraph.type === 'article') {
    return normalizeArticleFromMeta(data);
  }

  return undefined;
}

function normalizeArticleFromJsonLd(item: JsonLdItem): ArticleData {
  const article: ArticleData = {};

  article.headline = getString(item, ['headline'], ['name']);
  article.description = getString(item, ['description']);
  article.datePublished = getString(item, ['datePublished']);
  article.dateModified = getString(item, ['dateModified']);
  article.articleBody = getString(item, ['articleBody']);
  article.wordCount = parseInt(getString(item, ['wordCount']) || '0', 10) || undefined;
  article.section = getString(item, ['articleSection']);

  // Author
  const author = getFirst(item, ['author']);
  if (typeof author === 'string') {
    article.author = author;
  } else if (Array.isArray(author)) {
    article.author = author.map((a) => (typeof a === 'string' ? a : getString(a, ['name']) || '')).filter(Boolean);
  } else if (author && typeof author === 'object') {
    article.author = getString(author, ['name']);
  }

  // Publisher
  const publisher = getFirst(item, ['publisher']);
  if (typeof publisher === 'string') {
    article.publisher = publisher;
  } else if (publisher && typeof publisher === 'object') {
    article.publisher = getString(publisher, ['name']);
  }

  // Image
  const image = getFirst(item, ['image']);
  if (typeof image === 'string') {
    article.image = image;
  } else if (Array.isArray(image)) {
    article.image = image.map((img) => (typeof img === 'string' ? img : getString(img, ['url']) || '')).filter(Boolean);
  } else if (image && typeof image === 'object') {
    article.image = getString(image, ['url']);
  }

  // Keywords
  const keywords = getFirst(item, ['keywords']);
  if (typeof keywords === 'string') {
    article.keywords = keywords.split(',').map((k) => k.trim());
  } else if (Array.isArray(keywords)) {
    article.keywords = keywords;
  }

  return article;
}

function normalizeArticleFromMicrodata(item: MicrodataItem): ArticleData {
  const { properties } = item;
  const article: ArticleData = {};

  article.headline = getString(properties, ['headline'], ['name']);
  article.description = getString(properties, ['description']);
  article.datePublished = getString(properties, ['datePublished']);
  article.dateModified = getString(properties, ['dateModified']);
  article.author = getString(properties, ['author']);

  return article;
}

function normalizeArticleFromMeta(data: StructuredDataResult): ArticleData {
  const article: ArticleData = {};

  article.headline = data.openGraph.title;
  article.description = data.openGraph.description;
  article.image = data.openGraph.image;

  if (data.meta['article:author']) {
    article.author = data.meta['article:author'];
  }
  if (data.meta['article:published_time']) {
    article.datePublished = data.meta['article:published_time'];
  }
  if (data.meta['article:modified_time']) {
    article.dateModified = data.meta['article:modified_time'];
  }
  if (data.meta['article:section']) {
    article.section = data.meta['article:section'];
  }
  if (data.meta['article:tag']) {
    article.keywords = [data.meta['article:tag']];
  }

  return article;
}

/**
 * Extract normalized organization data
 */
function extractNormalizedOrganization(data: StructuredDataResult): OrganizationData | undefined {
  const orgTypes = ['Organization', 'Corporation', 'LocalBusiness', 'Store', 'Restaurant'];
  const jsonLdOrg = data.jsonLd.find(
    (item) =>
      orgTypes.includes(item['@type'] as string) ||
      (Array.isArray(item['@type']) && item['@type'].some((t) => orgTypes.includes(t)))
  );

  if (jsonLdOrg) {
    return {
      name: getString(jsonLdOrg, ['name']),
      url: getString(jsonLdOrg, ['url']),
      logo: getString(jsonLdOrg, ['logo', 'url'], ['logo']),
      description: getString(jsonLdOrg, ['description']),
      phone: getString(jsonLdOrg, ['telephone']),
      email: getString(jsonLdOrg, ['email']),
      sameAs: getArray<string>(jsonLdOrg, ['sameAs']),
    };
  }

  return undefined;
}

/**
 * Check if page has any structured data
 */
export function hasStructuredData(html: string): boolean {
  return (
    html.includes('application/ld+json') ||
    html.includes('itemscope') ||
    html.includes('property="og:') ||
    html.includes('name="twitter:') ||
    html.includes('name="dc.') ||
    html.includes('typeof=')
  );
}

/**
 * Quick check for product structured data
 */
export function hasProductData(html: string): boolean {
  const patterns = [
    '"@type"\\s*:\\s*"Product"',
    'itemtype="[^"]*Product"',
    'property="product:',
    'og:type"\\s+content="product"',
  ];

  return patterns.some((pattern) => new RegExp(pattern, 'i').test(html));
}

/**
 * Quick check for article structured data
 */
export function hasArticleData(html: string): boolean {
  const patterns = [
    '"@type"\\s*:\\s*"(Article|NewsArticle|BlogPosting)"',
    'itemtype="[^"]*Article"',
    'og:type"\\s+content="article"',
    'property="article:',
  ];

  return patterns.some((pattern) => new RegExp(pattern, 'i').test(html));
}

export default extractStructuredData;
