import { describe, it, expect } from 'vitest';
import {
  extractStructuredData,
  hasStructuredData,
  hasProductData,
  hasArticleData,
} from '../../src/core/structured-data-extractor.js';

describe('structured-data-extractor', () => {
  describe('extractStructuredData', () => {
    describe('JSON-LD extraction', () => {
      it('should extract Product JSON-LD', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Test Product",
              "description": "A test product description",
              "sku": "TEST123",
              "brand": { "@type": "Brand", "name": "TestBrand" },
              "offers": {
                "@type": "Offer",
                "price": "29.99",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock"
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.5",
                "reviewCount": "100"
              }
            }
            </script>
          </head>
          <body><h1>Test Product</h1></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.jsonLd).toHaveLength(1);
        expect(result.jsonLd[0]['@type']).toBe('Product');
        expect(result.jsonLd[0].name).toBe('Test Product');

        expect(result.product).toBeDefined();
        expect(result.product?.name).toBe('Test Product');
        expect(result.product?.sku).toBe('TEST123');
        expect(result.product?.brand).toBe('TestBrand');
        expect(result.product?.price).toBe(29.99);
        expect(result.product?.priceCurrency).toBe('USD');
        expect(result.product?.rating?.value).toBe(4.5);
        expect(result.product?.rating?.count).toBe(100);
      });

      it('should extract Article JSON-LD', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "headline": "Test Article Headline",
              "description": "Article description",
              "author": { "@type": "Person", "name": "John Doe" },
              "datePublished": "2024-01-15",
              "publisher": { "@type": "Organization", "name": "Test Publisher" }
            }
            </script>
          </head>
          <body><article>Content</article></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.jsonLd).toHaveLength(1);
        expect(result.jsonLd[0]['@type']).toBe('Article');

        expect(result.article).toBeDefined();
        expect(result.article?.headline).toBe('Test Article Headline');
        expect(result.article?.author).toBe('John Doe');
        expect(result.article?.datePublished).toBe('2024-01-15');
        expect(result.article?.publisher).toBe('Test Publisher');
      });

      it('should handle @graph arrays in JSON-LD', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                { "@type": "WebPage", "name": "Page Name" },
                { "@type": "Organization", "name": "Org Name" },
                { "@type": "Product", "name": "Product Name" }
              ]
            }
            </script>
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.jsonLd).toHaveLength(3);
        expect(result.jsonLd.some((item) => item['@type'] === 'Product')).toBe(true);
        expect(result.product?.name).toBe('Product Name');
      });

      it('should handle multiple JSON-LD scripts', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script type="application/ld+json">
            { "@type": "Organization", "name": "Company" }
            </script>
            <script type="application/ld+json">
            { "@type": "Product", "name": "Widget" }
            </script>
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.jsonLd).toHaveLength(2);
        expect(result.organization?.name).toBe('Company');
        expect(result.product?.name).toBe('Widget');
      });
    });

    describe('Microdata extraction', () => {
      it('should extract Product microdata', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <body>
            <div itemscope itemtype="https://schema.org/Product">
              <span itemprop="name">Microdata Product</span>
              <span itemprop="description">Product description</span>
              <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
                <meta itemprop="price" content="49.99">
                <meta itemprop="priceCurrency" content="EUR">
              </div>
            </div>
          </body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.microdata).toHaveLength(1);
        expect(result.microdata[0].type).toBe('Product');
        expect(result.microdata[0].properties.name).toBe('Microdata Product');
      });

      it('should handle meta tag values', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <body>
            <div itemscope itemtype="https://schema.org/Product">
              <meta itemprop="sku" content="SKU123">
              <meta itemprop="gtin" content="1234567890123">
            </div>
          </body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.microdata[0].properties.sku).toBe('SKU123');
        expect(result.microdata[0].properties.gtin).toBe('1234567890123');
      });

      it('should extract values from links and images', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <body>
            <div itemscope itemtype="https://schema.org/Product">
              <a itemprop="url" href="https://example.com/product">Link</a>
              <img itemprop="image" src="https://example.com/image.jpg">
            </div>
          </body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.microdata[0].properties.url).toBe('https://example.com/product');
        expect(result.microdata[0].properties.image).toBe('https://example.com/image.jpg');
      });
    });

    describe('OpenGraph extraction', () => {
      it('should extract OpenGraph metadata', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG Description">
            <meta property="og:type" content="product">
            <meta property="og:url" content="https://example.com/page">
            <meta property="og:image" content="https://example.com/image.jpg">
            <meta property="og:site_name" content="Example Site">
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.openGraph.title).toBe('OG Title');
        expect(result.openGraph.description).toBe('OG Description');
        expect(result.openGraph.type).toBe('product');
        expect(result.openGraph.url).toBe('https://example.com/page');
        expect(result.openGraph.image).toBe('https://example.com/image.jpg');
        expect(result.openGraph.siteName).toBe('Example Site');
      });

      it('should handle multiple OG images', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta property="og:image" content="https://example.com/image1.jpg">
            <meta property="og:image" content="https://example.com/image2.jpg">
            <meta property="og:image" content="https://example.com/image3.jpg">
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(Array.isArray(result.openGraph.image)).toBe(true);
        expect(result.openGraph.image).toHaveLength(3);
      });
    });

    describe('Twitter Card extraction', () => {
      it('should extract Twitter Card metadata', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:site" content="@example">
            <meta name="twitter:title" content="Twitter Title">
            <meta name="twitter:description" content="Twitter Description">
            <meta name="twitter:image" content="https://example.com/twitter.jpg">
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.twitterCard.card).toBe('summary_large_image');
        expect(result.twitterCard.site).toBe('@example');
        expect(result.twitterCard.title).toBe('Twitter Title');
        expect(result.twitterCard.description).toBe('Twitter Description');
        expect(result.twitterCard.image).toBe('https://example.com/twitter.jpg');
      });
    });

    describe('Dublin Core extraction', () => {
      it('should extract Dublin Core metadata', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="dc.title" content="DC Title">
            <meta name="dc.creator" content="DC Author">
            <meta name="dc.date" content="2024-01-15">
            <meta name="dc.description" content="DC Description">
            <meta name="dc.publisher" content="DC Publisher">
            <meta name="dc.language" content="en">
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.dublinCore.title).toBe('DC Title');
        expect(result.dublinCore.creator).toBe('DC Author');
        expect(result.dublinCore.date).toBe('2024-01-15');
        expect(result.dublinCore.description).toBe('DC Description');
        expect(result.dublinCore.publisher).toBe('DC Publisher');
        expect(result.dublinCore.language).toBe('en');
      });

      it('should handle uppercase DC metadata', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="DC.Title" content="Uppercase Title">
            <meta name="DCTERMS.creator" content="Uppercase Author">
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.dublinCore.title).toBe('Uppercase Title');
      });
    });

    describe('RDFa Lite extraction', () => {
      it('should extract RDFa Lite data', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <body>
            <div typeof="Product">
              <span property="name">RDFa Product</span>
              <span property="description">RDFa description</span>
            </div>
          </body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.rdfa).toHaveLength(1);
        expect(result.rdfa[0].typeof).toBe('Product');
        expect(result.rdfa[0].properties.name).toBe('RDFa Product');
      });
    });

    describe('normalized data extraction', () => {
      it('should normalize product data from JSON-LD', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script type="application/ld+json">
            {
              "@type": "Product",
              "name": "Normalized Product",
              "brand": "BrandName",
              "offers": {
                "price": "99.99",
                "priceCurrency": "USD"
              }
            }
            </script>
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.product).toBeDefined();
        expect(result.product?.name).toBe('Normalized Product');
        expect(result.product?.brand).toBe('BrandName');
        expect(result.product?.price).toBe(99.99);
        expect(result.product?.priceCurrency).toBe('USD');
      });

      it('should normalize article data from JSON-LD', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script type="application/ld+json">
            {
              "@type": "NewsArticle",
              "headline": "Breaking News",
              "author": "Reporter Name",
              "datePublished": "2024-01-15T10:00:00Z"
            }
            </script>
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.article).toBeDefined();
        expect(result.article?.headline).toBe('Breaking News');
        expect(result.article?.author).toBe('Reporter Name');
      });

      it('should normalize organization data', () => {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <script type="application/ld+json">
            {
              "@type": "Organization",
              "name": "Example Corp",
              "url": "https://example.com",
              "logo": { "url": "https://example.com/logo.png" },
              "telephone": "+1-555-1234"
            }
            </script>
          </head>
          <body></body>
          </html>
        `;

        const result = extractStructuredData(html);

        expect(result.organization).toBeDefined();
        expect(result.organization?.name).toBe('Example Corp');
        expect(result.organization?.url).toBe('https://example.com');
        expect(result.organization?.logo).toBe('https://example.com/logo.png');
        expect(result.organization?.phone).toBe('+1-555-1234');
      });
    });
  });

  describe('hasStructuredData', () => {
    it('should detect JSON-LD', () => {
      const html = '<script type="application/ld+json">{"@type":"Product"}</script>';
      expect(hasStructuredData(html)).toBe(true);
    });

    it('should detect microdata', () => {
      const html = '<div itemscope itemtype="https://schema.org/Product"></div>';
      expect(hasStructuredData(html)).toBe(true);
    });

    it('should detect OpenGraph', () => {
      const html = '<meta property="og:title" content="Test">';
      expect(hasStructuredData(html)).toBe(true);
    });

    it('should detect Twitter Cards', () => {
      const html = '<meta name="twitter:title" content="Test">';
      expect(hasStructuredData(html)).toBe(true);
    });

    it('should detect Dublin Core', () => {
      const html = '<meta name="dc.title" content="Test">';
      expect(hasStructuredData(html)).toBe(true);
    });

    it('should return false for plain HTML', () => {
      const html = '<html><body><h1>Hello World</h1></body></html>';
      expect(hasStructuredData(html)).toBe(false);
    });
  });

  describe('hasProductData', () => {
    it('should detect Product JSON-LD', () => {
      const html = '<script type="application/ld+json">{"@type":"Product"}</script>';
      expect(hasProductData(html)).toBe(true);
    });

    it('should detect Product microdata', () => {
      const html = '<div itemtype="https://schema.org/Product"></div>';
      expect(hasProductData(html)).toBe(true);
    });

    it('should return false for non-product pages', () => {
      const html = '<script type="application/ld+json">{"@type":"Article"}</script>';
      expect(hasProductData(html)).toBe(false);
    });
  });

  describe('hasArticleData', () => {
    it('should detect Article JSON-LD', () => {
      const html = '<script type="application/ld+json">{"@type":"Article"}</script>';
      expect(hasArticleData(html)).toBe(true);
    });

    it('should detect NewsArticle', () => {
      const html = '<script type="application/ld+json">{"@type":"NewsArticle"}</script>';
      expect(hasArticleData(html)).toBe(true);
    });

    it('should detect BlogPosting', () => {
      const html = '<script type="application/ld+json">{"@type":"BlogPosting"}</script>';
      expect(hasArticleData(html)).toBe(true);
    });

    it('should return false for non-article pages', () => {
      const html = '<script type="application/ld+json">{"@type":"Product"}</script>';
      expect(hasArticleData(html)).toBe(false);
    });
  });
});
