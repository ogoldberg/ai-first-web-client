/**
 * Response Schema Versioning (CX-001)
 *
 * This module provides schema versioning for all MCP tool responses.
 * Schema versioning allows LLM clients to:
 * - Detect breaking changes in response formats
 * - Handle different versions appropriately
 * - Migrate code when versions change
 *
 * Version Format: MAJOR.MINOR
 * - MAJOR: Breaking changes (fields removed, types changed)
 * - MINOR: Backward-compatible additions (new fields)
 *
 * Compatibility Promise:
 * - Minor version bumps are always backward compatible
 * - Major version bumps may remove or change existing fields
 * - Deprecated fields will be marked for at least one minor version before removal
 */

/**
 * Current schema version for all tool responses
 *
 * Changelog:
 * - 1.0: Initial versioned schema
 *   - Added schemaVersion to all tool responses
 *   - Standardized response structure
 */
export const SCHEMA_VERSION = '1.0';

/**
 * Schema version metadata included in responses
 */
export interface SchemaVersionInfo {
  /** Schema version string (e.g., "1.0") */
  schemaVersion: string;
}

/**
 * Base interface for all versioned tool responses
 */
export interface VersionedResponse<T = unknown> extends SchemaVersionInfo {
  /** The actual response data */
  data: T;
}

/**
 * Helper to wrap any response with schema version
 *
 * @param data - The response data to wrap
 * @returns Versioned response with schemaVersion field
 *
 * @example
 * ```typescript
 * const result = withSchemaVersion({
 *   patterns: [...],
 *   stats: {...}
 * });
 * // Returns: { schemaVersion: "1.0", data: { patterns: [...], stats: {...} } }
 * ```
 */
export function withSchemaVersion<T>(data: T): VersionedResponse<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    data,
  };
}

/**
 * Helper to add schema version directly to an object (flat structure)
 *
 * This is useful when you want to add schemaVersion as a sibling field
 * rather than wrapping in a data object.
 *
 * @param response - The response object
 * @returns Response with schemaVersion field added
 *
 * @example
 * ```typescript
 * const result = addSchemaVersion({
 *   patterns: [...],
 *   stats: {...}
 * });
 * // Returns: { schemaVersion: "1.0", patterns: [...], stats: {...} }
 * ```
 */
export function addSchemaVersion<T extends object>(response: T): T & SchemaVersionInfo {
  return {
    ...response,
    schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * Type guard to check if a response is versioned
 */
export function isVersionedResponse(obj: unknown): obj is SchemaVersionInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'schemaVersion' in obj &&
    typeof (obj as SchemaVersionInfo).schemaVersion === 'string'
  );
}

/**
 * Parse schema version into major and minor components
 */
export function parseSchemaVersion(version: string): { major: number; minor: number } {
  const [major, minor] = version.split('.').map(Number);
  return { major: major || 0, minor: minor || 0 };
}

/**
 * Check if a schema version is compatible with the current version
 *
 * Compatibility rules:
 * - Same major version is compatible
 * - Higher minor version is compatible (client can handle extra fields)
 * - Different major version is not compatible
 */
export function isSchemaCompatible(clientVersion: string, serverVersion: string = SCHEMA_VERSION): boolean {
  const client = parseSchemaVersion(clientVersion);
  const server = parseSchemaVersion(serverVersion);
  return client.major === server.major;
}
