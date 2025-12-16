import { describe, it, expect, beforeEach } from 'vitest';
import { ContentExtractor } from '../../src/utils/content-extractor.js';

describe('ContentExtractor', () => {
  let extractor: ContentExtractor;

  beforeEach(() => {
    extractor = new ContentExtractor();
  });

  describe('extract', () => {
    it('should extract title from title tag', () => {
      const html = '<html><head><title>Test Title</title></head><body>Content</body></html>';
      const result = extractor.extract(html, 'https://example.com');
      expect(result.title).toBe('Test Title');
    });

    it('should extract title from h1 if no title tag', () => {
      const html = '<html><body><h1>Main Heading</h1><p>Content</p></body></html>';
      const result = extractor.extract(html, 'https://example.com');
      expect(result.title).toBe('Main Heading');
    });

    it('should extract plain text content', () => {
      const html = '<html><body><p>Hello World</p><p>Second paragraph</p></body></html>';
      const result = extractor.extract(html, 'https://example.com');
      expect(result.text).toContain('Hello World');
      expect(result.text).toContain('Second paragraph');
    });

    it('should convert HTML to markdown', () => {
      const html = '<html><body><h1>Title</h1><p>Paragraph with <strong>bold</strong> text.</p></body></html>';
      const result = extractor.extract(html, 'https://example.com');
      expect(result.markdown).toContain('# Title');
      expect(result.markdown).toContain('**bold**');
    });

    it('should prefer main content container', () => {
      const html = `
        <html>
          <body>
            <nav>Navigation content</nav>
            <main>Main content here</main>
            <footer>Footer content</footer>
          </body>
        </html>
      `;
      const result = extractor.extract(html, 'https://example.com');
      expect(result.text).toContain('Main content');
      // Footer and nav should be removed
      expect(result.text).not.toContain('Footer content');
      expect(result.text).not.toContain('Navigation content');
    });

    it('should remove script and style tags', () => {
      const html = `
        <html>
          <body>
            <script>alert('evil');</script>
            <style>.foo { color: red; }</style>
            <p>Real content</p>
          </body>
        </html>
      `;
      const result = extractor.extract(html, 'https://example.com');
      expect(result.text).not.toContain('alert');
      expect(result.text).not.toContain('color');
      expect(result.text).toContain('Real content');
    });

    it('should handle empty HTML gracefully', () => {
      const html = '<html><body></body></html>';
      const result = extractor.extract(html, 'https://example.com');
      expect(result.title).toBe('');
      expect(result.text).toBe('');
    });
  });

  describe('extractTables', () => {
    it('should extract simple table with headers', () => {
      const html = `
        <table>
          <thead><tr><th>Name</th><th>Age</th></tr></thead>
          <tbody>
            <tr><td>Alice</td><td>30</td></tr>
            <tr><td>Bob</td><td>25</td></tr>
          </tbody>
        </table>
      `;
      const tables = extractor.extractTables(html);
      expect(tables).toHaveLength(1);
      expect(tables[0].headers).toEqual(['Name', 'Age']);
      expect(tables[0].rows).toHaveLength(2);
      expect(tables[0].rows[0]).toEqual(['Alice', '30']);
    });

    it('should extract table caption', () => {
      const html = `
        <table>
          <caption>User List</caption>
          <tr><th>Name</th></tr>
          <tr><td>Alice</td></tr>
        </table>
      `;
      const tables = extractor.extractTables(html);
      expect(tables[0].caption).toBe('User List');
    });

    it('should extract table id', () => {
      const html = `
        <table id="users-table">
          <tr><th>Name</th></tr>
          <tr><td>Alice</td></tr>
        </table>
      `;
      const tables = extractor.extractTables(html);
      expect(tables[0].id).toBe('users-table');
    });

    it('should extract multiple tables', () => {
      const html = `
        <table><tr><th>A</th></tr><tr><td>1</td></tr></table>
        <table><tr><th>B</th></tr><tr><td>2</td></tr></table>
      `;
      const tables = extractor.extractTables(html);
      expect(tables).toHaveLength(2);
    });

    it('should handle table without thead (headers detected from th cells)', () => {
      const html = `
        <table>
          <tr><th>Name</th><th>Value</th></tr>
          <tr><td>Item</td><td>100</td></tr>
        </table>
      `;
      const tables = extractor.extractTables(html);
      // Headers are extracted from th cells in first row
      expect(tables[0].headers).toEqual(['Name', 'Value']);
      // Data row should be extracted
      expect(tables[0].rows.length).toBeGreaterThanOrEqual(1);
      // At least one row should contain 'Item'
      const hasItemRow = tables[0].rows.some(row => row.includes('Item'));
      expect(hasItemRow).toBe(true);
    });
  });

  describe('extractTablesAsJSON', () => {
    it('should convert table to JSON objects', () => {
      const html = `
        <table>
          <thead><tr><th>Name</th><th>Age</th></tr></thead>
          <tbody>
            <tr><td>Alice</td><td>30</td></tr>
            <tr><td>Bob</td><td>25</td></tr>
          </tbody>
        </table>
      `;
      const tables = extractor.extractTablesAsJSON(html);
      expect(tables).toHaveLength(1);
      expect(tables[0].data).toEqual([
        { Name: 'Alice', Age: '30' },
        { Name: 'Bob', Age: '25' },
      ]);
    });

    it('should skip tables without headers', () => {
      const html = `
        <table>
          <tr><td>A</td><td>B</td></tr>
          <tr><td>C</td><td>D</td></tr>
        </table>
      `;
      const tables = extractor.extractTablesAsJSON(html);
      expect(tables).toHaveLength(0);
    });

    it('should include headers in result', () => {
      const html = `
        <table>
          <thead><tr><th>Col1</th><th>Col2</th></tr></thead>
          <tbody><tr><td>A</td><td>B</td></tr></tbody>
        </table>
      `;
      const tables = extractor.extractTablesAsJSON(html);
      expect(tables[0].headers).toEqual(['Col1', 'Col2']);
    });
  });

  describe('findTable', () => {
    const html = `
      <table id="users">
        <caption>User Information</caption>
        <thead><tr><th>Name</th><th>Email</th></tr></thead>
        <tbody><tr><td>Alice</td><td>alice@example.com</td></tr></tbody>
      </table>
      <table id="products">
        <caption>Product List</caption>
        <thead><tr><th>SKU</th><th>Price</th></tr></thead>
        <tbody><tr><td>ABC123</td><td>$10</td></tr></tbody>
      </table>
    `;

    it('should find table by id', () => {
      const table = extractor.findTable(html, { id: 'users' });
      expect(table).toBeDefined();
      expect(table?.headers).toContain('Name');
    });

    it('should find table by caption', () => {
      const table = extractor.findTable(html, { caption: 'Product' });
      expect(table).toBeDefined();
      expect(table?.headers).toContain('SKU');
    });

    it('should find table by header content', () => {
      const table = extractor.findTable(html, { headerContains: 'email' });
      expect(table).toBeDefined();
      expect(table?.id).toBe('users');
    });

    it('should return undefined when table not found', () => {
      const table = extractor.findTable(html, { id: 'nonexistent' });
      expect(table).toBeUndefined();
    });
  });

  describe('extractLinks', () => {
    it('should extract links with text and href', () => {
      const html = '<html><body><a href="https://example.com">Example Link</a></body></html>';
      const links = extractor.extractLinks(html);
      expect(links).toHaveLength(1);
      expect(links[0].href).toBe('https://example.com');
      expect(links[0].text).toBe('Example Link');
    });

    it('should skip anchor links', () => {
      const html = '<html><body><a href="#section">Skip</a><a href="https://example.com">Real</a></body></html>';
      const links = extractor.extractLinks(html);
      expect(links).toHaveLength(1);
      expect(links[0].href).toBe('https://example.com');
    });

    it('should skip javascript: links', () => {
      const html = '<html><body><a href="javascript:void(0)">Click</a></body></html>';
      const links = extractor.extractLinks(html);
      expect(links).toHaveLength(0);
    });

    it('should include context from parent element', () => {
      const html = '<html><body><p>Visit our <a href="https://docs.example.com">documentation</a> for more info.</p></body></html>';
      const links = extractor.extractLinks(html);
      expect(links[0].context).toContain('Visit our');
      expect(links[0].context).toContain('for more info');
    });

    it('should truncate long context', () => {
      const longText = 'A'.repeat(300);
      const html = `<html><body><p>${longText}<a href="https://example.com">Link</a></p></body></html>`;
      const links = extractor.extractLinks(html);
      expect(links[0].context.length).toBeLessThanOrEqual(200);
    });
  });

  describe('extractStructured', () => {
    it('should extract structured data using selectors', () => {
      const html = `
        <html><body>
          <div class="item">
            <h3 class="title">Item 1</h3>
            <span class="price">$10</span>
          </div>
          <div class="item">
            <h3 class="title">Item 2</h3>
            <span class="price">$20</span>
          </div>
        </body></html>
      `;
      const result = extractor.extractStructured(html, {
        title: '.title',
        price: '.price',
      });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Item 1');
      expect(result[0].price).toBe('$10');
      expect(result[1].title).toBe('Item 2');
      expect(result[1].price).toBe('$20');
    });
  });
});
