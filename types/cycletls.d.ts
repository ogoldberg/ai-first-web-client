/**
 * Type declarations for cycletls
 *
 * CycleTLS is an optional dependency for TLS fingerprint impersonation.
 * These types are minimal and cover our usage.
 */

declare module 'cycletls' {
  interface CycleTLSClient {
    (
      url: string,
      options: {
        body?: string;
        ja3?: string;
        userAgent?: string;
        headers?: Record<string, string>;
        timeout?: number;
        proxy?: string;
        disableRedirect?: boolean;
      },
      method?: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'
    ): Promise<CycleTLSResponse>;
    exit(): Promise<void>;
  }

  interface CycleTLSResponse {
    status: number;
    body: string;
    headers: Record<string, string>;
    finalUrl?: string;
  }

  function initCycleTLS(): Promise<CycleTLSClient>;

  export default initCycleTLS;
}
