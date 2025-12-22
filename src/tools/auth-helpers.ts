/**
 * Auth Helper Functions (TC-001 Refactoring)
 * Shared logic for deprecated handlers and unified api_auth tool
 */

import type { AuthWorkflow } from '../core/auth-workflow.js';
import type {
  ApiKeyCredentials,
  BearerCredentials,
  BasicCredentials,
  OAuth2Credentials,
  CookieCredentials,
} from '../core/auth-workflow.js';
import type { AuthInfo } from '../core/api-documentation-discovery.js';

/** Valid auth types */
export type AuthType = AuthInfo['type'];

/** Union type for all credential types */
export type TypedCredentials = ApiKeyCredentials | BearerCredentials | BasicCredentials | OAuth2Credentials | CookieCredentials;

/**
 * Build typed credentials from raw input based on auth type
 */
export function buildTypedCredentials(
  authType: string,
  rawCredentials: Record<string, unknown>
): TypedCredentials | { error: string } {
  switch (authType) {
    case 'api_key':
      return {
        type: 'api_key',
        in: (rawCredentials.in as 'header' | 'query' | 'cookie') || 'header',
        name: (rawCredentials.name as string) || 'X-API-Key',
        value: rawCredentials.value as string,
      };
    case 'bearer':
      return {
        type: 'bearer',
        token: rawCredentials.token as string,
        expiresAt: rawCredentials.expiresAt as number | undefined,
      };
    case 'basic':
      return {
        type: 'basic',
        username: rawCredentials.username as string,
        password: rawCredentials.password as string,
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        flow: (rawCredentials.flow as OAuth2Credentials['flow']) || 'authorization_code',
        clientId: rawCredentials.clientId as string,
        clientSecret: rawCredentials.clientSecret as string | undefined,
        accessToken: rawCredentials.accessToken as string | undefined,
        refreshToken: rawCredentials.refreshToken as string | undefined,
        scopes: rawCredentials.scopes as string[] | undefined,
        urls: {
          authorizationUrl: rawCredentials.authorizationUrl as string | undefined,
          tokenUrl: rawCredentials.tokenUrl as string | undefined,
          refreshUrl: rawCredentials.refreshUrl as string | undefined,
        },
        username: rawCredentials.username as string | undefined,
        password: rawCredentials.password as string | undefined,
      };
    case 'cookie':
      return {
        type: 'cookie',
        name: rawCredentials.name as string,
        value: rawCredentials.value as string,
        expiresAt: rawCredentials.expiresAt as number | undefined,
      };
    default:
      return { error: `Unknown auth type: ${authType}` };
  }
}

/**
 * Handle auth status check
 */
export async function handleAuthStatus(
  authWorkflow: AuthWorkflow,
  domain: string,
  profile: string
): Promise<{
  domain: string;
  status: string;
  message: string;
  detectedAuth: AuthInfo[];
  configuredCredentials: Array<{
    type: AuthType;
    profile: string;
    validated: boolean;
    expiresAt?: number;
    isExpired: boolean;
  }>;
  missingAuth: Array<{
    type: string;
    guidance: ReturnType<typeof authWorkflow.getAuthGuidance>;
  }>;
}> {
  const status = await authWorkflow.getAuthStatus(domain, profile);
  return {
    domain: status.domain,
    status: status.status,
    message: status.message,
    detectedAuth: status.detectedAuth,
    configuredCredentials: status.configuredCredentials,
    missingAuth: status.missingAuth.map(auth => ({
      type: auth.type,
      guidance: authWorkflow.getAuthGuidance(auth),
    })),
  };
}

/**
 * Handle configure credentials
 */
export async function handleAuthConfigure(
  authWorkflow: AuthWorkflow,
  domain: string,
  authType: string,
  rawCredentials: Record<string, unknown>,
  profile: string,
  validate: boolean
): Promise<{
  success: boolean;
  domain: string;
  type: AuthType;
  profile: string;
  validated: boolean;
  error?: string;
  nextStep?: {
    action: 'visit_url' | 'enter_code' | 'complete';
    url?: string;
    instructions?: string;
  };
} | { error: string }> {
  const typedCredentials = buildTypedCredentials(authType, rawCredentials);
  if ('error' in typedCredentials) {
    return typedCredentials;
  }

  const result = await authWorkflow.configureCredentials(
    domain,
    typedCredentials,
    profile,
    validate
  );

  return {
    success: result.success,
    domain: result.domain,
    type: result.type,
    profile: result.profile,
    validated: result.validated,
    error: result.error,
    nextStep: result.nextStep,
  };
}

/**
 * Handle OAuth flow completion
 */
export async function handleOAuthComplete(
  authWorkflow: AuthWorkflow,
  code: string,
  state: string
): Promise<{
  success: boolean;
  domain?: string;
  profile?: string;
  validated: boolean;
  error?: string;
  message: string;
}> {
  const result = await authWorkflow.completeOAuthFlow(code, state);
  return {
    success: result.success,
    domain: result.domain,
    profile: result.profile,
    validated: result.validated,
    error: result.error,
    message: result.success
      ? 'OAuth authorization completed successfully. You can now make authenticated API calls.'
      : 'OAuth authorization failed. Please try again.',
  };
}

/**
 * Handle auth guidance request
 */
export async function handleAuthGuidance(
  authWorkflow: AuthWorkflow,
  domain: string,
  authType?: string
): Promise<{
  domain: string;
  detectedAuthTypes: AuthType[];
  guidance: Array<{ type: string; guidance: ReturnType<typeof authWorkflow.getAuthGuidance> }>;
}> {
  const status = await authWorkflow.getAuthStatus(domain);

  let guidance: Array<{ type: string; guidance: ReturnType<typeof authWorkflow.getAuthGuidance> }>;

  if (authType) {
    // Get guidance for specific type
    const authInfo = status.detectedAuth.find(a => a.type === authType) ||
      { type: authType as AuthType, in: 'header' as const, name: undefined };
    guidance = [{ type: authType, guidance: authWorkflow.getAuthGuidance(authInfo) }];
  } else {
    // Get guidance for all detected auth types
    guidance = status.detectedAuth.map(auth => ({
      type: auth.type,
      guidance: authWorkflow.getAuthGuidance(auth),
    }));

    // If no auth detected, show guidance for common types
    if (guidance.length === 0) {
      guidance = [
        { type: 'api_key', guidance: authWorkflow.getAuthGuidance({ type: 'api_key', in: 'header' }) },
        { type: 'bearer', guidance: authWorkflow.getAuthGuidance({ type: 'bearer' }) },
      ];
    }
  }

  return {
    domain,
    detectedAuthTypes: status.detectedAuth.map(a => a.type),
    guidance,
  };
}

/**
 * Handle auth deletion
 */
export async function handleAuthDelete(
  authWorkflow: AuthWorkflow,
  domain: string,
  authType: AuthType | undefined,
  profile: string
): Promise<{
  success: boolean;
  domain: string;
  authType: string;
  profile: string;
  message: string;
}> {
  const deleted = await authWorkflow.deleteCredentials(domain, authType, profile);
  return {
    success: deleted,
    domain,
    authType: authType || 'all',
    profile,
    message: deleted
      ? 'Credentials deleted successfully'
      : 'No matching credentials found',
  };
}

/**
 * Handle list configured auth
 */
export function handleAuthList(authWorkflow: AuthWorkflow): {
  totalDomains: number;
  domains: ReturnType<typeof authWorkflow.listConfiguredDomains>;
} {
  const configuredDomains = authWorkflow.listConfiguredDomains();
  return {
    totalDomains: configuredDomains.length,
    domains: configuredDomains,
  };
}
