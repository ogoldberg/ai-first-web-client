/**
 * JSON $ref Resolver for OpenAPI Specifications
 *
 * Resolves local $ref pointers in OpenAPI/JSON Schema documents.
 * Supports:
 * - Local references: #/components/schemas/User
 * - Nested references: References within referenced objects
 * - Circular reference detection
 */

import { logger } from './logger.js';

const refLogger = logger.create('JsonRefResolver');

/**
 * Options for $ref resolution
 */
export interface RefResolutionOptions {
  /** Maximum depth for nested resolution (default: 10) */
  maxDepth?: number;
  /** Whether to resolve circular references by marking them (default: true) */
  handleCircular?: boolean;
  /** Whether to inline resolved refs or keep structure (default: true) */
  inline?: boolean;
}

/**
 * Result of $ref resolution
 */
export interface RefResolutionResult {
  /** The resolved object */
  resolved: Record<string, unknown>;
  /** References that were resolved */
  resolvedRefs: string[];
  /** Circular references that were encountered */
  circularRefs: string[];
  /** Errors encountered during resolution */
  errors: string[];
}

/**
 * Resolve all $ref pointers in an OpenAPI/JSON document
 */
export function resolveRefs(
  document: Record<string, unknown>,
  options: RefResolutionOptions = {}
): RefResolutionResult {
  const maxDepth = options.maxDepth ?? 10;
  const handleCircular = options.handleCircular ?? true;
  const inline = options.inline ?? true;

  const resolvedRefs: string[] = [];
  const circularRefs: string[] = [];
  const errors: string[] = [];
  const resolutionStack = new Set<string>();

  /**
   * Resolve a single $ref pointer
   */
  function resolveRef(ref: string, depth: number): unknown {
    // Check for local reference
    if (!ref.startsWith('#/')) {
      errors.push(`Remote references not supported: ${ref}`);
      return { $ref: ref, _unresolved: true };
    }

    // Check depth limit
    if (depth > maxDepth) {
      errors.push(`Max resolution depth exceeded for: ${ref}`);
      return { $ref: ref, _maxDepthExceeded: true };
    }

    // Check for circular reference
    if (resolutionStack.has(ref)) {
      if (handleCircular) {
        circularRefs.push(ref);
        return { $ref: ref, _circular: true };
      }
      errors.push(`Circular reference detected: ${ref}`);
      return { $ref: ref, _circular: true };
    }

    // Parse the reference path
    const pathParts = ref.slice(2).split('/').map(decodeJsonPointer);

    // Navigate to the referenced value
    let value: unknown = document;
    for (const part of pathParts) {
      if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        errors.push(`Reference not found: ${ref}`);
        return { $ref: ref, _notFound: true };
      }
    }

    resolvedRefs.push(ref);

    // Recursively resolve any refs in the resolved value
    if (inline && value && typeof value === 'object') {
      resolutionStack.add(ref);
      const resolved = resolveObject(value as Record<string, unknown>, depth + 1);
      resolutionStack.delete(ref);
      return resolved;
    }

    return value;
  }

  /**
   * Recursively resolve all $refs in an object
   * Returns unknown because a $ref can resolve to any type (including primitives)
   */
  function resolveObject(obj: Record<string, unknown>, depth: number): unknown {
    // Handle $ref at current level
    if ('$ref' in obj && typeof obj.$ref === 'string') {
      const resolved = resolveRef(obj.$ref, depth);
      if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
        // Merge any sibling properties (OpenAPI 3.1 allows siblings with $ref)
        const siblings = { ...obj };
        delete siblings.$ref;
        if (Object.keys(siblings).length > 0) {
          return { ...(resolved as Record<string, unknown>), ...siblings };
        }
        return resolved;
      }
      // Return primitive or array values as-is
      return resolved;
    }

    // Recursively process all properties
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          result[key] = value.map(item =>
            item && typeof item === 'object'
              ? resolveObject(item as Record<string, unknown>, depth)
              : item
          );
        } else {
          result[key] = resolveObject(value as Record<string, unknown>, depth);
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  const resolvedValue = resolveObject(document, 0);

  // The top-level document will always be an object since we pass in Record<string, unknown>
  // Even if internal $refs resolve to primitives, those are nested values
  const resolved = (resolvedValue && typeof resolvedValue === 'object' && !Array.isArray(resolvedValue))
    ? resolvedValue as Record<string, unknown>
    : document; // Fallback to original if something unexpected happens

  if (resolvedRefs.length > 0) {
    refLogger.debug('Resolved references', {
      count: resolvedRefs.length,
      circular: circularRefs.length,
      errors: errors.length,
    });
  }

  return {
    resolved,
    resolvedRefs,
    circularRefs,
    errors,
  };
}

/**
 * Decode JSON Pointer escape sequences
 * ~0 -> ~
 * ~1 -> /
 */
function decodeJsonPointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Get a value at a JSON pointer path
 */
export function getValueAtPath(
  document: Record<string, unknown>,
  path: string
): unknown | undefined {
  if (!path.startsWith('#/')) {
    return undefined;
  }

  const pathParts = path.slice(2).split('/').map(decodeJsonPointer);
  let value: unknown = document;

  for (const part of pathParts) {
    if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Check if an object contains any $ref pointers
 */
export function hasRefs(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  if ('$ref' in (obj as Record<string, unknown>)) {
    return true;
  }

  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (hasRefs(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Count $ref pointers in a document
 */
export function countRefs(obj: unknown): number {
  if (!obj || typeof obj !== 'object') {
    return 0;
  }

  let count = 0;
  if ('$ref' in (obj as Record<string, unknown>)) {
    count++;
  }

  for (const value of Object.values(obj as Record<string, unknown>)) {
    count += countRefs(value);
  }

  return count;
}
