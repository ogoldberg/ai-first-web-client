import { describe, it, expect } from 'vitest';
import {
  traverseObj,
  getFirst,
  getAll,
  getString,
  getNumber,
  getBoolean,
  getArray,
  getObject,
  hasPath,
  extractFields,
  get,
  setPath,
  TRAVERSE_ALL,
  TRAVERSE_FIRST,
} from '../../src/core/traverse-obj.js';

describe('traverse-obj', () => {
  describe('traverseObj', () => {
    it('should traverse simple nested objects', () => {
      const obj = { a: { b: { c: 'value' } } };
      expect(traverseObj(obj, ['a', 'b', 'c'])).toBe('value');
    });

    it('should traverse arrays with numeric indices', () => {
      const obj = { items: ['first', 'second', 'third'] };
      expect(traverseObj(obj, ['items', 0])).toBe('first');
      expect(traverseObj(obj, ['items', 1])).toBe('second');
    });

    it('should handle negative array indices', () => {
      const obj = { items: ['first', 'second', 'third'] };
      expect(traverseObj(obj, ['items', -1])).toBe('third');
      expect(traverseObj(obj, ['items', -2])).toBe('second');
    });

    it('should return undefined for missing paths', () => {
      const obj = { a: { b: 'value' } };
      expect(traverseObj(obj, ['a', 'c', 'd'])).toBeUndefined();
    });

    it('should try multiple paths and return first match', () => {
      const obj = { name: 'Test' };
      expect(traverseObj(obj, ['title'], ['name'], ['headline'])).toBe('Test');
    });

    it('should use default value when path not found', () => {
      const obj = { a: 'value' };
      expect(traverseObj(obj, ['missing'], { default: 'default' })).toBe('default');
    });

    it('should filter by expected type', () => {
      const obj = { num: 42, str: 'hello' };
      expect(traverseObj(obj, ['num'], { expectedType: 'number' })).toBe(42);
      expect(traverseObj(obj, ['str'], { expectedType: 'number' })).toBeUndefined();
    });

    it('should handle TRAVERSE_ALL symbol', () => {
      const obj = { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };
      const result = traverseObj(obj, ['items', TRAVERSE_ALL, 'name'], { getAll: true });
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should handle TRAVERSE_FIRST symbol', () => {
      const obj = { items: [{ name: 'first' }, { name: 'second' }] };
      expect(traverseObj(obj, ['items', TRAVERSE_FIRST, 'name'])).toBe('first');
    });

    it('should handle regex keys', () => {
      const obj = {
        item_1: 'a',
        item_2: 'b',
        other: 'c',
      };
      const result = traverseObj(obj, [/^item_\d+$/], { getAll: true });
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).not.toContain('c');
    });

    it('should handle function keys (predicates)', () => {
      const obj = {
        items: [
          { type: 'fruit', name: 'apple' },
          { type: 'vegetable', name: 'carrot' },
          { type: 'fruit', name: 'banana' },
        ],
      };
      const isFruit = (item: unknown) =>
        typeof item === 'object' && item !== null && (item as any).type === 'fruit';

      const result = traverseObj(obj, ['items', isFruit, 'name'], { getAll: true });
      expect(result).toEqual(['apple', 'banana']);
    });

    it('should handle case-insensitive key matching', () => {
      const obj = { Title: 'Test', NAME: 'Value' };
      expect(traverseObj(obj, ['title'], { caseSensitive: false })).toBe('Test');
      expect(traverseObj(obj, ['name'], { caseSensitive: false })).toBe('Value');
    });
  });

  describe('getFirst', () => {
    it('should get first matching value from multiple paths', () => {
      const obj = { headline: 'News Title' };
      expect(getFirst(obj, ['title'], ['name'], ['headline'])).toBe('News Title');
    });

    it('should return undefined when no path matches', () => {
      const obj = { other: 'value' };
      expect(getFirst(obj, ['title'], ['name'])).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should get all matching values', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(getAll(obj, ['items', TRAVERSE_ALL])).toEqual(['a', 'b', 'c']);
    });
  });

  describe('getString', () => {
    it('should return string values', () => {
      const obj = { name: 'Test', count: 42 };
      expect(getString(obj, ['name'])).toBe('Test');
    });

    it('should return undefined for non-strings', () => {
      const obj = { count: 42 };
      expect(getString(obj, ['count'])).toBeUndefined();
    });
  });

  describe('getNumber', () => {
    it('should return number values', () => {
      const obj = { count: 42, price: 19.99 };
      expect(getNumber(obj, ['count'])).toBe(42);
      expect(getNumber(obj, ['price'])).toBe(19.99);
    });

    it('should return undefined for non-numbers', () => {
      const obj = { name: 'Test' };
      expect(getNumber(obj, ['name'])).toBeUndefined();
    });

    it('should return undefined for NaN', () => {
      const obj = { invalid: NaN };
      expect(getNumber(obj, ['invalid'])).toBeUndefined();
    });
  });

  describe('getBoolean', () => {
    it('should return boolean values', () => {
      const obj = { active: true, disabled: false };
      expect(getBoolean(obj, ['active'])).toBe(true);
      expect(getBoolean(obj, ['disabled'])).toBe(false);
    });

    it('should return undefined for non-booleans', () => {
      const obj = { value: 1 };
      expect(getBoolean(obj, ['value'])).toBeUndefined();
    });
  });

  describe('getArray', () => {
    it('should return array values', () => {
      const obj = { items: [1, 2, 3] };
      expect(getArray(obj, ['items'])).toEqual([1, 2, 3]);
    });

    it('should return undefined for non-arrays', () => {
      const obj = { items: 'not an array' };
      expect(getArray(obj, ['items'])).toBeUndefined();
    });
  });

  describe('getObject', () => {
    it('should return object values', () => {
      const obj = { config: { setting: 'value' } };
      expect(getObject(obj, ['config'])).toEqual({ setting: 'value' });
    });

    it('should return undefined for arrays', () => {
      const obj = { items: [1, 2, 3] };
      expect(getObject(obj, ['items'])).toBeUndefined();
    });
  });

  describe('hasPath', () => {
    it('should return true for existing paths', () => {
      const obj = { a: { b: 'value' } };
      expect(hasPath(obj, ['a', 'b'])).toBe(true);
    });

    it('should return false for missing paths', () => {
      const obj = { a: 'value' };
      expect(hasPath(obj, ['a', 'b', 'c'])).toBe(false);
    });
  });

  describe('extractFields', () => {
    it('should extract multiple fields at once', () => {
      const obj = {
        data: {
          info: { name: 'Product' },
          pricing: { cost: 99.99 },
          meta: { category: 'Electronics' },
        },
      };

      const result = extractFields(obj, {
        name: [['data', 'info', 'name']],
        price: [['data', 'pricing', 'cost']],
        type: [['data', 'meta', 'category'], ['data', 'type']],
      });

      expect(result.name).toBe('Product');
      expect(result.price).toBe(99.99);
      expect(result.type).toBe('Electronics');
    });
  });

  describe('get (dot notation)', () => {
    it('should handle dot notation paths', () => {
      const obj = { response: { items: [{ title: 'First' }] } };
      expect(get(obj, 'response.items.0.title')).toBe('First');
    });

    it('should handle bracket notation', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(get(obj, 'items[1]')).toBe('b');
    });

    it('should return default value for missing paths', () => {
      const obj = { a: 'value' };
      expect(get(obj, 'missing.path', 'default')).toBe('default');
    });
  });

  describe('setPath', () => {
    it('should set nested values immutably', () => {
      const obj = { a: { b: { c: 'old' } } };
      const result = setPath(obj, ['a', 'b', 'c'], 'new');

      expect(result.a.b.c).toBe('new');
      expect(obj.a.b.c).toBe('old'); // Original unchanged
    });

    it('should set array values immutably', () => {
      const obj = { items: ['a', 'b', 'c'] };
      const result = setPath(obj, ['items', 1], 'x');

      expect(result.items[1]).toBe('x');
      expect(obj.items[1]).toBe('b'); // Original unchanged
    });
  });

  describe('real-world examples', () => {
    it('should extract YouTube video data', () => {
      const ytData = {
        videoDetails: {
          videoId: 'abc123',
          title: 'Video Title',
          author: 'Channel Name',
          viewCount: '1000000',
        },
        playerConfig: {
          audioConfig: { loudnessDb: -5.5 },
        },
      };

      expect(getString(ytData, ['videoDetails', 'title'])).toBe('Video Title');
      expect(getString(ytData, ['videoDetails', 'videoId'])).toBe('abc123');
    });

    it('should extract Amazon product data', () => {
      const amazonData = {
        product: {
          title: 'Product Name',
          offers: [
            { price: '29.99', currency: 'USD' },
            { price: '24.99', currency: 'USD', condition: 'used' },
          ],
          aggregateRating: {
            ratingValue: 4.5,
            reviewCount: 1234,
          },
        },
      };

      expect(getString(amazonData, ['product', 'title'])).toBe('Product Name');
      expect(getString(amazonData, ['product', 'offers', 0, 'price'])).toBe('29.99');
      expect(getNumber(amazonData, ['product', 'aggregateRating', 'ratingValue'])).toBe(4.5);
    });

    it('should handle Next.js page data', () => {
      const nextData = {
        props: {
          pageProps: {
            article: {
              title: 'Article Title',
              body: 'Article content...',
              author: { name: 'Author Name' },
            },
          },
        },
      };

      expect(getString(nextData, ['props', 'pageProps', 'article', 'title'])).toBe('Article Title');
      expect(getString(nextData, ['props', 'pageProps', 'article', 'author', 'name'])).toBe(
        'Author Name'
      );
    });
  });
});
