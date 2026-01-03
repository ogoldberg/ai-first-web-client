/**
 * Traverse Object Utility
 *
 * TypeScript port of yt-dlp's traverse_obj function for safe nested object traversal.
 * Provides defensive extraction that won't crash on missing keys.
 *
 * @see https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/utils/traversal.py
 */

/**
 * Symbol representing "no default value provided"
 */
const NO_DEFAULT = Symbol('NO_DEFAULT');

/**
 * Type for path keys - can be string, number, regex, function, or special symbols
 */
export type PathKey =
  | string
  | number
  | RegExp
  | ((obj: unknown, key: string | number) => boolean)
  | typeof TRAVERSE_ALL
  | typeof TRAVERSE_FIRST
  | typeof TRAVERSE_REQUIRE;

/**
 * Special traversal symbols
 */
export const TRAVERSE_ALL = Symbol('TRAVERSE_ALL'); // Get all values at current level
export const TRAVERSE_FIRST = Symbol('TRAVERSE_FIRST'); // Get first matching value
export const TRAVERSE_REQUIRE = Symbol('TRAVERSE_REQUIRE'); // Throw if not found

/**
 * Path specification - array of keys to traverse
 */
export type TraversePath = PathKey[];

/**
 * Options for traverse_obj
 */
export interface TraverseOptions<T> {
  /** Default value if path not found */
  default?: T;
  /** Expected type - filter results to this type */
  expectedType?: 'string' | 'number' | 'boolean' | 'object' | 'array' | ((val: unknown) => val is T);
  /** Whether to get all matching values (default: true for arrays) */
  getAll?: boolean;
  /** Case-insensitive key matching (default: true) */
  caseSensitive?: boolean;
  /** Allow traversing into strings (default: false) */
  traverseString?: boolean;
}

/**
 * Safely traverse nested objects and arrays
 *
 * Unlike direct property access, this won't throw on missing keys.
 * Supports multiple paths (tries each until one succeeds).
 *
 * @example
 * // Basic usage
 * traverseObj(data, ['response', 'items', 0, 'title'])
 *
 * @example
 * // Multiple paths (fallback)
 * traverseObj(data, ['title'], ['name'], ['headline'])
 *
 * @example
 * // With regex key matching
 * traverseObj(data, ['items', /^item_\d+$/, 'value'])
 *
 * @example
 * // With type filtering
 * traverseObj(data, ['price'], { expectedType: 'number' })
 *
 * @example
 * // Get all values
 * traverseObj(data, ['items', TRAVERSE_ALL, 'name'], { getAll: true })
 */
export function traverseObj<T = unknown>(
  obj: unknown,
  ...args: (TraversePath | TraverseOptions<T>)[]
): T | T[] | undefined {
  // Separate paths from options
  const paths: TraversePath[] = [];
  let options: TraverseOptions<T> = {};

  for (const arg of args) {
    if (Array.isArray(arg)) {
      paths.push(arg);
    } else if (typeof arg === 'object' && arg !== null) {
      options = arg as TraverseOptions<T>;
    }
  }

  const {
    default: defaultValue,
    expectedType,
    getAll = false,
    caseSensitive = true,
    traverseString = false,
  } = options;

  // Type check function
  const typeCheck = (val: unknown): val is T => {
    if (!expectedType) return true;

    if (typeof expectedType === 'function') {
      return expectedType(val);
    }

    switch (expectedType) {
      case 'string':
        return typeof val === 'string';
      case 'number':
        return typeof val === 'number' && !isNaN(val);
      case 'boolean':
        return typeof val === 'boolean';
      case 'object':
        return typeof val === 'object' && val !== null && !Array.isArray(val);
      case 'array':
        return Array.isArray(val);
      default:
        return true;
    }
  };

  // Case-fold helper
  const caseFold = (key: string | number): string | number => {
    if (!caseSensitive && typeof key === 'string') {
      return key.toLowerCase();
    }
    return key;
  };

  // Apply a single key to an object
  const applyKey = (key: PathKey, currentObj: unknown): unknown[] => {
    if (currentObj === null || currentObj === undefined) {
      return [];
    }

    // Handle special symbols
    if (key === TRAVERSE_ALL) {
      if (Array.isArray(currentObj)) {
        return currentObj;
      }
      if (typeof currentObj === 'object') {
        return Object.values(currentObj as Record<string, unknown>);
      }
      return [];
    }

    if (key === TRAVERSE_FIRST) {
      if (Array.isArray(currentObj)) {
        return currentObj.length > 0 ? [currentObj[0]] : [];
      }
      if (typeof currentObj === 'object') {
        const values = Object.values(currentObj as Record<string, unknown>);
        return values.length > 0 ? [values[0]] : [];
      }
      return [];
    }

    // Handle string/number keys
    if (typeof key === 'string' || typeof key === 'number') {
      if (Array.isArray(currentObj)) {
        const idx = typeof key === 'number' ? key : parseInt(key, 10);
        if (!isNaN(idx) && idx >= 0 && idx < currentObj.length) {
          return [currentObj[idx]];
        }
        // Negative indexing like Python
        if (!isNaN(idx) && idx < 0 && Math.abs(idx) <= currentObj.length) {
          return [currentObj[currentObj.length + idx]];
        }
      }

      if (typeof currentObj === 'object' && currentObj !== null) {
        const record = currentObj as Record<string, unknown>;
        const strKey = String(key);

        // Direct match
        if (strKey in record) {
          return [record[strKey]];
        }

        // Case-insensitive match
        if (!caseSensitive) {
          const lowerKey = strKey.toLowerCase();
          for (const k of Object.keys(record)) {
            if (k.toLowerCase() === lowerKey) {
              return [record[k]];
            }
          }
        }
      }

      // Traverse into strings (for extracting substrings)
      if (traverseString && typeof currentObj === 'string') {
        const idx = typeof key === 'number' ? key : parseInt(key, 10);
        if (!isNaN(idx) && idx >= 0 && idx < currentObj.length) {
          return [currentObj[idx]];
        }
      }

      return [];
    }

    // Handle regex keys
    if (key instanceof RegExp) {
      if (typeof currentObj === 'object' && currentObj !== null && !Array.isArray(currentObj)) {
        const record = currentObj as Record<string, unknown>;
        const matches: unknown[] = [];
        for (const k of Object.keys(record)) {
          if (key.test(k)) {
            matches.push(record[k]);
          }
        }
        return matches;
      }
      return [];
    }

    // Handle function keys (predicate)
    if (typeof key === 'function') {
      if (Array.isArray(currentObj)) {
        return currentObj.filter((item, idx) => (key as Function)(item, idx));
      }
      if (typeof currentObj === 'object' && currentObj !== null) {
        const record = currentObj as Record<string, unknown>;
        const matches: unknown[] = [];
        for (const [k, v] of Object.entries(record)) {
          if ((key as Function)(v, k)) {
            matches.push(v);
          }
        }
        return matches;
      }
    }

    return [];
  };

  // Apply a full path to an object
  const applyPath = (startObj: unknown, path: TraversePath): unknown[] => {
    let currentValues: unknown[] = [startObj];

    for (const key of path) {
      const nextValues: unknown[] = [];

      for (const currentObj of currentValues) {
        const results = applyKey(key, currentObj);
        nextValues.push(...results);
      }

      if (nextValues.length === 0) {
        return [];
      }

      currentValues = nextValues;
    }

    // Filter by type
    return currentValues.filter(typeCheck);
  };

  // Try each path
  for (const path of paths) {
    const results = applyPath(obj, path);

    if (results.length > 0) {
      if (getAll) {
        return results as T[];
      }
      return results[0] as T;
    }
  }

  // Return default if no path succeeded
  return defaultValue;
}

/**
 * Shorthand for getting a single value
 */
export function getFirst<T = unknown>(
  obj: unknown,
  ...paths: TraversePath[]
): T | undefined {
  return traverseObj<T>(obj, ...paths) as T | undefined;
}

/**
 * Shorthand for getting all matching values
 */
export function getAll<T = unknown>(
  obj: unknown,
  path: TraversePath
): T[] {
  return (traverseObj<T>(obj, path, { getAll: true }) ?? []) as T[];
}

/**
 * Get a string value, returns undefined if not a string
 */
export function getString(obj: unknown, ...paths: TraversePath[]): string | undefined {
  const result = traverseObj<string>(obj, ...paths, { expectedType: 'string' });
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Get a number value, returns undefined if not a number
 */
export function getNumber(obj: unknown, ...paths: TraversePath[]): number | undefined {
  const result = traverseObj<number>(obj, ...paths, { expectedType: 'number' });
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Get a boolean value, returns undefined if not a boolean
 */
export function getBoolean(obj: unknown, ...paths: TraversePath[]): boolean | undefined {
  const result = traverseObj<boolean>(obj, ...paths, { expectedType: 'boolean' });
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Get an array value, returns undefined if not an array
 */
export function getArray<T = unknown>(obj: unknown, ...paths: TraversePath[]): T[] | undefined {
  const result = traverseObj<T[]>(obj, ...paths, { expectedType: 'array' });
  if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return result as T[] | undefined;
}

/**
 * Get an object value, returns undefined if not an object
 */
export function getObject(obj: unknown, ...paths: TraversePath[]): Record<string, unknown> | undefined {
  const result = traverseObj<Record<string, unknown>>(obj, ...paths, { expectedType: 'object' });
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Check if a path exists in an object
 */
export function hasPath(obj: unknown, path: TraversePath): boolean {
  return traverseObj(obj, path) !== undefined;
}

/**
 * Extract multiple fields from an object
 *
 * @example
 * extractFields(data, {
 *   title: [['name'], ['title'], ['headline']],
 *   price: [['price'], ['cost'], ['amount']],
 *   image: [['image'], ['thumbnail'], ['photo']],
 * })
 */
export function extractFields<T extends Record<string, TraversePath[]>>(
  obj: unknown,
  fieldPaths: T
): { [K in keyof T]: unknown } {
  const result = {} as { [K in keyof T]: unknown };

  for (const [field, paths] of Object.entries(fieldPaths)) {
    result[field as keyof T] = traverseObj(obj, ...paths);
  }

  return result;
}

/**
 * Safely get nested property using dot notation
 * Simpler alternative to traverseObj for basic cases
 *
 * @example
 * get(data, 'response.items.0.title')
 * get(data, 'response.items[0].title')
 */
export function get<T = unknown>(obj: unknown, path: string, defaultValue?: T): T | undefined {
  if (!path || typeof obj !== 'object' || obj === null) {
    return defaultValue;
  }

  // Handle both dot notation and bracket notation
  const parts = path.split(/\.|\[|\]/).filter(Boolean);
  const traversePath: TraversePath = parts.map((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) ? num : part;
  });

  const result = traverseObj<T>(obj, traversePath);
  if (result === undefined) {
    return defaultValue;
  }
  return (Array.isArray(result) ? result[0] : result) as T | undefined;
}

/**
 * Set a nested property value (immutably)
 * Returns a new object with the value set
 */
export function setPath<T>(obj: T, path: TraversePath, value: unknown): T {
  if (path.length === 0) {
    return value as T;
  }

  const [key, ...rest] = path;

  if (typeof key !== 'string' && typeof key !== 'number') {
    throw new Error('setPath only supports string and number keys');
  }

  if (Array.isArray(obj)) {
    const idx = typeof key === 'number' ? key : parseInt(String(key), 10);
    if (isNaN(idx)) {
      throw new Error(`Invalid array index: ${key}`);
    }
    const newArr = [...obj];
    newArr[idx] = rest.length === 0 ? value : setPath(obj[idx], rest, value);
    return newArr as unknown as T;
  }

  if (typeof obj === 'object' && obj !== null) {
    return {
      ...obj,
      [key]: rest.length === 0 ? value : setPath((obj as Record<string, unknown>)[String(key)], rest, value),
    };
  }

  throw new Error(`Cannot set property on ${typeof obj}`);
}

// Default export for convenience
export default traverseObj;
