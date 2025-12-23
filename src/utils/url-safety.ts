/**
 * URL Safety Module - SSRF Protection
 *
 * Provides URL validation to prevent Server-Side Request Forgery (SSRF) attacks.
 * Blocks access to:
 * - Private IP ranges (RFC1918)
 * - Localhost and loopback addresses
 * - Link-local addresses
 * - Cloud metadata endpoints
 * - Dangerous protocols (file://, javascript:, data:, etc.)
 *
 * Security is enabled by default and can be disabled via configuration
 * for legitimate testing scenarios.
 */

import { logger } from './logger.js';

/**
 * URL Safety configuration
 */
export interface UrlSafetyConfig {
  /** Enable SSRF protection (default: true) */
  enabled: boolean;

  /** Allow private IP ranges (RFC1918) - DANGEROUS if true */
  allowPrivateIPs: boolean;

  /** Allow localhost/loopback - DANGEROUS if true */
  allowLocalhost: boolean;

  /** Allow link-local addresses - DANGEROUS if true */
  allowLinkLocal: boolean;

  /** Allow cloud metadata endpoints - DANGEROUS if true */
  allowMetadataEndpoints: boolean;

  /** Additional blocked hostnames (e.g., internal services) */
  blockedHostnames: string[];

  /** Additional allowed hostnames (overrides blocks) */
  allowedHostnames: string[];
}

/**
 * Default secure configuration - blocks all dangerous URLs
 */
export const DEFAULT_URL_SAFETY_CONFIG: UrlSafetyConfig = {
  enabled: true,
  allowPrivateIPs: false,
  allowLocalhost: false,
  allowLinkLocal: false,
  allowMetadataEndpoints: false,
  blockedHostnames: [],
  allowedHostnames: [],
};

/**
 * Result of URL safety validation
 */
export interface UrlSafetyResult {
  /** Whether the URL is safe to access */
  safe: boolean;

  /** Reason for blocking (if not safe) */
  reason?: string;

  /** Category of the block */
  category?: 'private_ip' | 'localhost' | 'link_local' | 'metadata' | 'protocol' | 'blocked_hostname';

  /** The parsed URL components (if valid URL) */
  parsed?: {
    protocol: string;
    hostname: string;
    port: string;
    pathname: string;
  };
}

/**
 * Allowed protocols for browsing
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Known cloud metadata endpoints to block
 */
const METADATA_HOSTNAMES = new Set([
  // AWS
  '169.254.169.254',
  'instance-data',

  // GCP
  'metadata.google.internal',
  'metadata.gke.io',

  // Azure
  '169.254.169.254',

  // DigitalOcean
  '169.254.169.254',

  // Alibaba Cloud
  '100.100.100.200',

  // Oracle Cloud
  '169.254.169.254',
]);

/**
 * IPv4 private ranges (RFC1918)
 */
const PRIVATE_IP_RANGES = [
  { start: ipToNumber('10.0.0.0'), end: ipToNumber('10.255.255.255') },      // 10.0.0.0/8
  { start: ipToNumber('172.16.0.0'), end: ipToNumber('172.31.255.255') },    // 172.16.0.0/12
  { start: ipToNumber('192.168.0.0'), end: ipToNumber('192.168.255.255') },  // 192.168.0.0/16
];

/**
 * Loopback range (127.0.0.0/8)
 */
const LOOPBACK_RANGE = {
  start: ipToNumber('127.0.0.0'),
  end: ipToNumber('127.255.255.255'),
};

/**
 * Link-local range (169.254.0.0/16)
 */
const LINK_LOCAL_RANGE = {
  start: ipToNumber('169.254.0.0'),
  end: ipToNumber('169.254.255.255'),
};

/**
 * Convert IPv4 address to number for range comparison
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if a value is an IPv4 address
 */
function isIPv4(hostname: string): boolean {
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Pattern);
  if (!match) return false;

  // Validate each octet is 0-255
  return match.slice(1).every(octet => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Check if a value is an IPv6 address (bracketed format from URL hostname)
 * Note: URL.hostname keeps the brackets for IPv6, e.g., [::1]
 */
function isIPv6(hostname: string): boolean {
  // Check for bracketed IPv6 addresses
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return true;
  }
  // Also check for unbracketed IPv6 patterns (in case called directly)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::$|^::1$|^fe80:/i;
  return ipv6Pattern.test(hostname);
}

/**
 * Strip brackets from IPv6 hostname if present
 */
function stripIPv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/**
 * Check if IPv6 address is loopback (::1)
 */
function isIPv6Loopback(hostname: string): boolean {
  const normalized = stripIPv6Brackets(hostname).toLowerCase();
  // ::1 is the IPv6 loopback address
  // Also check for expanded forms like 0:0:0:0:0:0:0:1
  return normalized === '::1' ||
         normalized === '0:0:0:0:0:0:0:1' ||
         normalized === '0000:0000:0000:0000:0000:0000:0000:0001';
}

/**
 * Check if IPv6 address is link-local (fe80::/10)
 */
function isIPv6LinkLocal(hostname: string): boolean {
  const normalized = stripIPv6Brackets(hostname).toLowerCase();
  return normalized.startsWith('fe80:') || normalized.startsWith('fe80');
}

/**
 * Check if IPv6 address is private/unique local (fc00::/7 - includes fd00::/8)
 */
function isIPv6Private(hostname: string): boolean {
  const normalized = stripIPv6Brackets(hostname).toLowerCase();
  // fc00::/7 covers fc00:: through fdff::
  return normalized.startsWith('fc') || normalized.startsWith('fd');
}

/**
 * Check if IP is in a range
 */
function isInRange(ip: string, range: { start: number; end: number }): boolean {
  const ipNum = ipToNumber(ip);
  return ipNum >= range.start && ipNum <= range.end;
}

/**
 * Check if IP is in private ranges (RFC1918)
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(range => isInRange(ip, range));
}

/**
 * Check if hostname resolves to localhost
 */
function isLocalhost(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return (
    lowered === 'localhost' ||
    lowered === 'localhost.localdomain' ||
    lowered.endsWith('.localhost') ||
    lowered === '0.0.0.0' ||
    (isIPv4(hostname) && isInRange(hostname, LOOPBACK_RANGE)) ||
    isIPv6Loopback(lowered)
  );
}

/**
 * Check if IP is in link-local range
 */
function isLinkLocal(ip: string): boolean {
  return isInRange(ip, LINK_LOCAL_RANGE);
}

/**
 * Check if hostname is a metadata endpoint
 */
function isMetadataEndpoint(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return METADATA_HOSTNAMES.has(lowered);
}

/**
 * URL Safety validator class
 */
export class UrlSafetyValidator {
  private config: UrlSafetyConfig;

  constructor(config: Partial<UrlSafetyConfig> = {}) {
    this.config = { ...DEFAULT_URL_SAFETY_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<UrlSafetyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): UrlSafetyConfig {
    return { ...this.config };
  }

  /**
   * Validate a URL for safety
   */
  validate(url: string): UrlSafetyResult {
    // If disabled, allow everything
    if (!this.config.enabled) {
      return { safe: true };
    }

    // Parse URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return {
        safe: false,
        reason: `Invalid URL: ${url}`,
        category: 'protocol',
      };
    }

    const result: UrlSafetyResult = {
      safe: true,
      parsed: {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
      },
    };

    // Check protocol
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return {
        ...result,
        safe: false,
        reason: `Blocked protocol: ${parsed.protocol}. Only http: and https: are allowed.`,
        category: 'protocol',
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check allowed hostnames (override all blocks)
    if (this.config.allowedHostnames.includes(hostname)) {
      return result;
    }

    // Check blocked hostnames
    if (this.config.blockedHostnames.includes(hostname)) {
      return {
        ...result,
        safe: false,
        reason: `Blocked hostname: ${hostname}`,
        category: 'blocked_hostname',
      };
    }

    // Check metadata endpoints
    if (!this.config.allowMetadataEndpoints && isMetadataEndpoint(hostname)) {
      return {
        ...result,
        safe: false,
        reason: `Blocked cloud metadata endpoint: ${hostname}. This could expose sensitive cloud credentials.`,
        category: 'metadata',
      };
    }

    // Check localhost
    if (!this.config.allowLocalhost && isLocalhost(hostname)) {
      return {
        ...result,
        safe: false,
        reason: `Blocked localhost/loopback address: ${hostname}. Enable allowLocalhost to access local services.`,
        category: 'localhost',
      };
    }

    // For IPv4 addresses, perform additional checks
    if (isIPv4(hostname)) {
      // Check link-local (but skip if it's an allowed metadata endpoint)
      const isMetadata = isMetadataEndpoint(hostname);
      if (!this.config.allowLinkLocal && isLinkLocal(hostname) && !(this.config.allowMetadataEndpoints && isMetadata)) {
        return {
          ...result,
          safe: false,
          reason: `Blocked link-local address: ${hostname}. Enable allowLinkLocal to access these addresses.`,
          category: 'link_local',
        };
      }

      // Check private IPs
      if (!this.config.allowPrivateIPs && isPrivateIP(hostname)) {
        return {
          ...result,
          safe: false,
          reason: `Blocked private IP address: ${hostname}. Enable allowPrivateIPs to access internal network resources.`,
          category: 'private_ip',
        };
      }
    }

    // For IPv6 addresses, perform additional checks
    if (isIPv6(hostname)) {
      // Check IPv6 link-local (fe80::/10)
      if (!this.config.allowLinkLocal && isIPv6LinkLocal(hostname)) {
        return {
          ...result,
          safe: false,
          reason: `Blocked IPv6 link-local address: ${hostname}. Enable allowLinkLocal to access these addresses.`,
          category: 'link_local',
        };
      }

      // Check IPv6 private/unique local (fc00::/7)
      if (!this.config.allowPrivateIPs && isIPv6Private(hostname)) {
        return {
          ...result,
          safe: false,
          reason: `Blocked IPv6 private address: ${hostname}. Enable allowPrivateIPs to access internal network resources.`,
          category: 'private_ip',
        };
      }
    }

    return result;
  }

  /**
   * Validate URL and throw if unsafe
   */
  validateOrThrow(url: string): void {
    const result = this.validate(url);
    if (!result.safe) {
      const error = new UrlSafetyError(result.reason || 'URL blocked by safety policy', result.category);
      logger.smartBrowser.warn('URL blocked by safety policy', {
        url,
        reason: result.reason,
        category: result.category,
      });
      throw error;
    }
  }
}

/**
 * Custom error for URL safety violations
 */
export class UrlSafetyError extends Error {
  public readonly category?: string;

  constructor(message: string, category?: string) {
    super(message);
    this.name = 'UrlSafetyError';
    this.category = category;
  }
}

/**
 * Global URL safety validator instance with default secure config
 */
export const urlSafetyValidator = new UrlSafetyValidator();

/**
 * Convenience function to validate URL
 */
export function validateUrl(url: string): UrlSafetyResult {
  return urlSafetyValidator.validate(url);
}

/**
 * Convenience function to validate URL and throw if unsafe
 */
export function validateUrlOrThrow(url: string): void {
  urlSafetyValidator.validateOrThrow(url);
}

/**
 * Configure the global URL safety validator
 */
export function configureUrlSafety(config: Partial<UrlSafetyConfig>): void {
  urlSafetyValidator.setConfig(config);
}
