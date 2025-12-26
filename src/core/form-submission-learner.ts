/**
 * Form Submission Learner
 *
 * Learns API patterns from form submissions to enable direct POST requests
 * without browser rendering on future submissions.
 *
 * Progressive optimization:
 * - First submission: Use browser, capture POST request
 * - Learn: Field mapping, CSRF patterns, validation rules
 * - Future submissions: Direct POST (~10-25x faster)
 *
 * Part of the "Browser Minimizer" philosophy - progressively eliminate
 * the need for rendering by learning the underlying API patterns.
 */

import type { Page } from 'playwright';
import type {
  NetworkRequest,
  BrowsingAction,
} from '../types/index.js';
import type {
  LearnedApiPattern,
  ContentMapping,
  ApiExtractionSuccess,
} from '../types/api-patterns.js';
import { ApiPatternRegistry } from './api-pattern-learner.js';
import { logger } from '../utils/logger.js';
import { readFile } from 'fs/promises';

/**
 * Form field detected in HTML
 */
export interface FormField {
  name: string;
  type: string; // text, email, password, hidden, etc.
  required: boolean;
  value?: string;
  selector: string;
}

/**
 * File upload field detected in HTML
 */
export interface FileField {
  name: string;
  required: boolean;
  accept?: string; // MIME types or file extensions (e.g., "image/*", ".pdf,.doc")
  multiple: boolean; // Whether multiple files can be selected
  selector: string;
}

/**
 * Detected form structure
 */
export interface DetectedForm {
  action?: string; // Form action URL
  method: string; // GET or POST
  encoding?: string; // enctype attribute (multipart/form-data, application/x-www-form-urlencoded)
  fields: FormField[];
  fileFields: FileField[]; // File upload fields
  submitSelector: string;
  csrfFields: FormField[]; // Hidden fields that look like CSRF tokens
}

/**
 * File upload data
 */
export interface FileUploadData {
  /** File path on local filesystem, OR */
  filePath?: string;
  /** File contents as Buffer, OR */
  buffer?: Buffer;
  /** File contents as base64 string */
  base64?: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType?: string;
}

/**
 * Form submission data provided by user
 */
export interface FormSubmissionData {
  url: string; // URL of the page containing the form
  fields: Record<string, string | number | boolean>; // Field values to submit
  files?: Record<string, FileUploadData | FileUploadData[]>; // File uploads by field name
  formSelector?: string; // Optional selector to identify specific form
  isMultiStep?: boolean; // Whether this is part of a multi-step form
  stepNumber?: number; // Current step number (1-indexed)
  previousStepData?: Record<string, any>; // Data from previous steps
}

/**
 * Result of a form submission
 */
export interface FormSubmissionResult {
  success: boolean;
  method: 'browser' | 'api'; // How the form was submitted
  responseUrl?: string;
  responseData?: any;
  duration: number;
  learned: boolean; // Whether a new pattern was learned
  error?: string;
  otpRequired?: boolean; // Whether OTP challenge was encountered
  otpChallenge?: OTPChallenge; // OTP challenge details (if applicable)
}

/**
 * OTP/2FA challenge detected during submission
 */
export interface OTPChallenge {
  type: 'sms' | 'email' | 'totp' | 'authenticator' | 'backup_code' | 'unknown';
  message?: string; // Message shown to user (e.g., "Code sent to ***@example.com")
  destination?: string; // Masked destination (e.g., "***@example.com", "***1234")
  expiresIn?: number; // Seconds until code expires
  retryAfter?: number; // Seconds until can request new code
  endpoint: string; // OTP verification endpoint
  codeLength?: number; // Expected code length (e.g., 6)
}

/**
 * Callback for prompting user for OTP code
 * Returns the OTP code entered by the user, or null if cancelled
 */
export type OTPPromptCallback = (challenge: OTPChallenge) => Promise<string | null>;

/**
 * Rate limit information for a domain
 */
export interface RateLimitInfo {
  /** Domain being rate limited */
  domain: string;
  /** Rate limit quota (requests per period) */
  limit?: number;
  /** Remaining requests in current period */
  remaining?: number;
  /** Timestamp when rate limit resets (Unix timestamp in ms) */
  resetAt?: number;
  /** Retry after N seconds (from Retry-After header) */
  retryAfterSeconds?: number;
  /** Last time we hit a rate limit (for tracking) */
  lastRateLimitTime?: number;
  /** Number of times we've been rate limited */
  rateLimitCount: number;
}

/**
 * OAuth flow information
 */
export interface OAuthFlowInfo {
  /** OAuth flow type */
  flowType: 'authorization_code' | 'implicit' | 'pkce';
  /** Authorization endpoint URL */
  authEndpoint: string;
  /** Token endpoint URL (for authorization code flow) */
  tokenEndpoint?: string;
  /** Client ID */
  clientId: string;
  /** Redirect URI */
  redirectUri: string;
  /** Requested scopes */
  scopes: string[];
  /** State parameter (CSRF protection) */
  state?: string;
  /** PKCE code challenge (if using PKCE) */
  codeChallenge?: string;
  /** PKCE code challenge method */
  codeChallengeMethod?: 'S256' | 'plain';
  /** Response type (code, token, id_token) */
  responseType: string;
}

/**
 * Learned OAuth flow pattern
 */
export interface LearnedOAuthFlow {
  id: string;
  domain: string;
  /** URL that triggers OAuth flow (e.g., /login, /connect) */
  triggerUrl: string;
  /** OAuth provider (e.g., 'github', 'google', 'auth0') */
  provider?: string;
  /** Flow information */
  flow: OAuthFlowInfo;
  /** Whether this flow uses PKCE */
  usesPKCE: boolean;
  /** Learned at timestamp */
  learnedAt: number;
  /** Times this flow was used */
  timesUsed: number;
  /** Success rate */
  successRate: number;
}

/**
 * WebSocket message captured during form submission
 */
export interface WebSocketMessage {
  /** Event name (for Socket.IO-style APIs) or message type */
  event?: string;
  /** Message payload */
  payload: any;
  /** Timestamp when message was sent */
  timestamp: number;
  /** WebSocket URL */
  url: string;
  /** Direction: 'send' (client → server) or 'receive' (server → client) */
  direction: 'send' | 'receive';
}

/**
 * Learned WebSocket emission pattern for form submission
 */
export interface WebSocketPattern {
  /** WebSocket server URL */
  wsUrl: string;
  /** Event name (e.g., 'form:submit', 'message', 'update') */
  eventName?: string;
  /** Payload structure/template */
  payloadTemplate: Record<string, any>;
  /** Field mapping (formField → ws payload field) */
  fieldMapping: Record<string, string>;
  /** Whether this uses Socket.IO or raw WebSocket */
  protocol: 'socket.io' | 'websocket' | 'sockjs';
  /** Response event name to listen for (if any) */
  responseEvent?: string;
  /** Expected response fields indicating success */
  successFields?: string[];
}

/**
 * Learned server action pattern (Next.js/Remix)
 */
export interface ServerActionPattern {
  /** Framework type */
  framework: 'nextjs' | 'remix';
  /** Action ID (Next.js only - from Next-Action header) */
  actionId?: string;
  /** Action name (Remix only - from _action field) */
  actionName?: string;
  /** Whether action ID is stable across builds (usually false for Next.js) */
  isStableId: boolean;
  /** Field mapping (form field → server action param) */
  fieldMapping: Record<string, string>;
  /** Response type indicator */
  responseType: 'redirect' | 'json' | 'flight-stream';
  /** Expected redirect pattern (if responseType === 'redirect') */
  redirectPattern?: string;
}

/**
 * Dynamic field that needs to be fetched before each submission
 */
export interface DynamicField {
  fieldName: string; // API field name
  valueType: 'user_id' | 'session_id' | 'nonce' | 'timestamp' | 'uuid' | 'csrf_token' | 'custom';
  extractionStrategy: {
    type: 'dom' | 'api' | 'cookie' | 'url_param' | 'localStorage' | 'computed';
    selector?: string; // CSS selector for DOM extraction
    apiEndpoint?: string; // API to fetch value
    cookieName?: string; // Cookie name
    paramName?: string; // URL parameter name
    storageKey?: string; // localStorage key
    computeFn?: string; // JavaScript function to compute value (e.g., "Date.now()")
  };
  pattern?: RegExp; // Pattern to validate extracted value
}

/**
 * Learned form pattern that can be replayed
 */
export interface LearnedFormPattern {
  id: string;
  domain: string;
  formUrl: string; // URL where form appears
  formSelector?: string;

  // API details
  apiEndpoint: string;
  method: string; // POST, PUT, etc.

  // Pattern type
  patternType?: 'rest' | 'graphql' | 'json-rpc' | 'websocket' | 'server-action'; // Type of API pattern

  // Encoding (for file uploads)
  encoding?: 'application/x-www-form-urlencoded' | 'multipart/form-data' | 'application/json';

  // Field mapping
  fieldMapping: Record<string, string>; // formField → apiField

  // File upload fields (if any)
  fileFields?: FileField[];

  // GraphQL-specific (if patternType === 'graphql')
  graphqlMutation?: {
    mutationName: string;
    query: string;
    variableMapping: Record<string, string>; // formField → GraphQL variable
  };

  // JSON-RPC-specific (if patternType === 'json-rpc')
  jsonRpcMethod?: {
    methodName: string; // e.g., "user.create", "api.submit"
    paramsMapping: Record<string, string>; // formField → RPC param
    version: '1.0' | '2.0'; // JSON-RPC version
  };

  // WebSocket-specific (if patternType === 'websocket')
  websocketPattern?: WebSocketPattern;

  // Server Action-specific (if patternType === 'server-action')
  serverActionPattern?: ServerActionPattern;

  // Dynamic fields that must be fetched before each submission
  dynamicFields: DynamicField[];

  // CSRF handling (special case of dynamic field)
  csrfTokenField?: string; // Field name for CSRF token
  csrfTokenSource?: 'meta' | 'hidden' | 'cookie'; // Where to get the token
  csrfTokenSelector?: string; // How to extract it

  // Validation
  requiredFields: string[];

  // Success indicators
  successIndicators: {
    statusCodes: number[];
    responseFields?: string[]; // Fields that indicate success
  };

  // OTP/2FA handling (if this form requires 2FA)
  requiresOTP?: boolean;
  otpPattern?: {
    detectionIndicators: {
      statusCodes?: number[]; // e.g., [202, 401, 403]
      responseFields?: string[]; // e.g., ['requires2FA', 'otpRequired']
      responseValues?: Record<string, any>; // e.g., { requires2FA: true }
    };
    otpEndpoint: string; // Endpoint to submit OTP code
    otpFieldName: string; // Field name for OTP code (e.g., 'code', 'otp', 'token')
    otpMethod: 'POST' | 'PUT'; // HTTP method for OTP submission
    otpType: 'sms' | 'email' | 'totp' | 'authenticator' | 'backup_code' | 'unknown';
  };

  // Metadata
  learnedAt: number;
  timesUsed: number;
  successRate: number;
  lastUsed?: number;
}

/**
 * Options for form submission
 */
export interface SubmitFormOptions {
  timeout?: number;
  waitForNavigation?: boolean;
  csrfToken?: string; // Optional pre-fetched CSRF token
  onOTPRequired?: OTPPromptCallback; // Callback when OTP is required
  autoRetryOnOTP?: boolean; // Automatically retry submission with OTP (default: true)
}

export class FormSubmissionLearner {
  private patternRegistry: ApiPatternRegistry;
  private formPatterns: Map<string, LearnedFormPattern> = new Map();
  private rateLimits: Map<string, RateLimitInfo> = new Map(); // domain → rate limit info
  private oauthFlows: Map<string, LearnedOAuthFlow> = new Map(); // triggerUrl → OAuth flow

  constructor(patternRegistry: ApiPatternRegistry) {
    this.patternRegistry = patternRegistry;
  }

  /**
   * Submit a form with progressive optimization
   *
   * First attempt: Check for learned pattern
   * Fallback: Use browser and learn the pattern
   */
  async submitForm(
    data: FormSubmissionData,
    page: Page,
    options: SubmitFormOptions = {}
  ): Promise<FormSubmissionResult> {
    const startTime = Date.now();
    const domain = new URL(data.url).hostname;

    // Try learned pattern first
    const pattern = this.findMatchingPattern(data.url, data.formSelector);
    if (pattern) {
      const submissionMethod = pattern.patternType === 'websocket' ? 'WebSocket' : 'API';
      logger.formLearner.info(`Found learned form pattern, attempting direct ${submissionMethod} submission`, {
        patternId: pattern.id,
        patternType: pattern.patternType,
        endpoint: pattern.apiEndpoint,
      });

      try {
        let result: { responseUrl?: string; data?: any; success: boolean };

        // Use appropriate submission method based on pattern type
        if (pattern.patternType === 'websocket') {
          result = await this.submitViaWebSocket(data, pattern);
          result.responseUrl = pattern.websocketPattern?.wsUrl || pattern.apiEndpoint;
        } else {
          result = await this.submitViaApi(data, pattern, options);
        }

        // Update pattern metrics
        pattern.timesUsed++;
        pattern.lastUsed = Date.now();
        pattern.successRate = ((pattern.successRate * (pattern.timesUsed - 1)) + 1) / pattern.timesUsed;

        return {
          success: true,
          method: 'api', // Keep as 'api' for backward compatibility (includes WebSocket)
          responseUrl: result.responseUrl,
          responseData: result.data,
          duration: Date.now() - startTime,
          learned: false,
        };
      } catch (error) {
        logger.formLearner.warn(`Direct ${submissionMethod} submission failed, falling back to browser`, {
          patternId: pattern.id,
          patternType: pattern.patternType,
          error: error instanceof Error ? error.message : String(error),
        });

        // Update failure rate
        pattern.successRate = ((pattern.successRate * (pattern.timesUsed - 1)) + 0) / pattern.timesUsed;
      }
    }

    // Fallback: Submit via browser and learn
    logger.formLearner.info('Submitting via browser to learn pattern', {
      url: data.url,
      hasExistingPattern: !!pattern,
    });

    return await this.submitViaBrowserAndLearn(data, page, domain, options, startTime);
  }

  /**
   * Submit form via learned API pattern
   */
  private async submitViaApi(
    data: FormSubmissionData,
    pattern: LearnedFormPattern,
    options: SubmitFormOptions
  ): Promise<{ responseUrl: string; data: any }> {
    // Build payload from field mapping
    const payload: Record<string, any> = {};

    for (const [formField, apiField] of Object.entries(pattern.fieldMapping)) {
      if (data.fields[formField] !== undefined) {
        payload[apiField] = data.fields[formField];
      }
    }

    // Fetch and add dynamic fields (user IDs, nonces, session tokens, etc.)
    for (const dynamicField of pattern.dynamicFields) {
      logger.formLearner.debug('Fetching dynamic field', {
        field: dynamicField.fieldName,
        type: dynamicField.valueType,
        strategy: dynamicField.extractionStrategy.type,
      });

      const value = await this.extractDynamicFieldValue(data.url, dynamicField);
      if (value) {
        payload[dynamicField.fieldName] = value;
        logger.formLearner.debug('Extracted dynamic field value', {
          field: dynamicField.fieldName,
          value: this.maskSensitiveValue(value, dynamicField.valueType),
        });
      } else {
        logger.formLearner.warn('Failed to extract dynamic field', {
          field: dynamicField.fieldName,
          type: dynamicField.valueType,
        });
      }
    }

    // Add CSRF token if required (legacy path, now handled by dynamicFields)
    if (pattern.csrfTokenField && !pattern.dynamicFields.some(f => f.fieldName === pattern.csrfTokenField)) {
      const csrfToken = options.csrfToken || await this.extractCsrfToken(data.url, pattern);
      if (csrfToken) {
        payload[pattern.csrfTokenField] = csrfToken;
      }
    }

    // Check if this form has file uploads
    const hasFileUploads = pattern.fileFields && pattern.fileFields.length > 0;
    const userProvidedFiles = data.files && Object.keys(data.files).length > 0;

    // Make the request (handle file uploads, server actions, GraphQL, and REST differently)
    let response: Response;

    if (hasFileUploads) {
      // File upload via multipart/form-data
      if (!userProvidedFiles) {
        throw new Error('This form requires file uploads, but no files were provided. Please include files in the submission data.');
      }

      response = await this.submitMultipartForm(pattern, payload, data.files!);
    } else if (pattern.patternType === 'server-action' && pattern.serverActionPattern) {
      // Server Action (Next.js/Remix)
      const serverActionPattern = pattern.serverActionPattern;

      // For Remix actions with _action field, add it to payload
      if (serverActionPattern.framework === 'remix' && serverActionPattern.actionName) {
        payload._action = serverActionPattern.actionName;
      }

      // Build headers
      const headers: Record<string, string> = {
        'Accept': 'application/json, text/x-component',
      };

      // Add Next-Action header for Next.js
      if (serverActionPattern.framework === 'nextjs' && serverActionPattern.actionId) {
        headers['Next-Action'] = serverActionPattern.actionId;
      }

      // Determine content type based on encoding
      let body: string | FormData;
      if (pattern.encoding === 'multipart/form-data') {
        // Use FormData for multipart
        const formData = new FormData();
        for (const [key, value] of Object.entries(payload)) {
          formData.append(key, String(value));
        }
        body = formData;
        // Don't set Content-Type - browser will set it with boundary
      } else {
        // Use URL-encoded for everything else (default for server actions)
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(payload as Record<string, string>).toString();
      }

      response = await fetch(pattern.apiEndpoint, {
        method: 'POST',
        headers,
        body,
      });
    } else if (pattern.patternType === 'graphql' && pattern.graphqlMutation) {
      // GraphQL mutation request
      const graphqlPayload = {
        query: pattern.graphqlMutation.query,
        variables: {} as Record<string, any>,
      };

      // Map form fields to GraphQL variables
      for (const [formField, gqlVariable] of Object.entries(pattern.graphqlMutation.variableMapping)) {
        if (payload[formField] !== undefined) {
          graphqlPayload.variables[gqlVariable] = payload[formField];
        }
      }

      response = await fetch(pattern.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(graphqlPayload),
      });
    } else if (pattern.patternType === 'json-rpc' && pattern.jsonRpcMethod) {
      // JSON-RPC method call
      const rpcMethod = pattern.jsonRpcMethod;

      // Build RPC params from form fields
      const rpcParams: Record<string, any> = {};
      for (const [formField, rpcParam] of Object.entries(rpcMethod.paramsMapping)) {
        if (payload[formField] !== undefined) {
          rpcParams[rpcParam] = payload[formField];
        }
      }

      // Build JSON-RPC request
      const rpcRequest: any = {
        method: rpcMethod.methodName,
        params: rpcParams,
        id: Date.now(), // Use timestamp as ID (simple incrementing strategy)
      };

      // Add version field for JSON-RPC 2.0
      if (rpcMethod.version === '2.0') {
        rpcRequest.jsonrpc = '2.0';
      }

      response = await fetch(pattern.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(rpcRequest),
      });
    } else {
      // Standard REST request
      const contentType = pattern.encoding === 'application/x-www-form-urlencoded'
        ? 'application/x-www-form-urlencoded'
        : 'application/json';

      const body = contentType === 'application/x-www-form-urlencoded'
        ? new URLSearchParams(payload as Record<string, string>).toString()
        : JSON.stringify(payload);

      response = await fetch(pattern.apiEndpoint, {
        method: pattern.method,
        headers: {
          'Content-Type': contentType,
          'Accept': 'application/json',
        },
        body,
      });
    }

    // Update rate limit info from response headers
    const domain = new URL(pattern.apiEndpoint).hostname;
    this.updateRateLimitInfo(response, domain);

    // Check for rate limit (429) and handle specially
    if (response.status === 429) {
      const rateLimitInfo = this.detectRateLimit(response, domain);
      if (rateLimitInfo) {
        this.rateLimits.set(domain, rateLimitInfo);
        const waitSeconds = rateLimitInfo.retryAfterSeconds || 60;
        throw new Error(`Rate limit exceeded. Retry after ${waitSeconds} seconds.`);
      }
    }

    // Try to parse response data (might fail if not JSON)
    let responseData: any;
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }

    // Check for OTP challenge BEFORE throwing error on non-OK response
    const otpChallenge = this.detectOTPChallenge(response, responseData);

    if (otpChallenge) {
      logger.formLearner.info('OTP challenge detected during API submission', {
        otpType: otpChallenge.type,
        endpoint: otpChallenge.endpoint,
      });

      // Learn OTP pattern for future submissions
      if (!pattern.requiresOTP) {
        this.learnOTPPattern(pattern, otpChallenge, response, responseData);
      }

      // If no OTP callback provided, we can't proceed
      if (!options.onOTPRequired) {
        throw new Error('OTP required but no onOTPRequired callback provided. Cannot complete submission.');
      }

      // Prompt user for OTP code
      const otpCode = await options.onOTPRequired(otpChallenge);

      if (!otpCode) {
        throw new Error('OTP code not provided by user. Submission cancelled.');
      }

      // Submit OTP code
      const otpResponse = await this.submitOTP(otpChallenge, otpCode, pattern);

      if (!otpResponse.ok) {
        throw new Error(`OTP verification failed: ${otpResponse.status} ${otpResponse.statusText}`);
      }

      // Parse OTP response
      const otpResponseData = await otpResponse.json();

      return {
        responseUrl: otpResponse.url,
        data: otpResponseData,
      };
    }

    // No OTP challenge - proceed with normal validation
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    // Validate success
    if (!this.isSuccessResponse(response.status, responseData, pattern)) {
      throw new Error('Response does not match success indicators');
    }

    return {
      responseUrl: response.url,
      data: responseData,
    };
  }

  /**
   * Submit multipart/form-data request with file uploads
   */
  private async submitMultipartForm(
    pattern: LearnedFormPattern,
    fields: Record<string, any>,
    files: Record<string, FileUploadData | FileUploadData[]>
  ): Promise<Response> {
    const formData = new FormData();

    // Add regular fields
    for (const [fieldName, value] of Object.entries(fields)) {
      formData.append(fieldName, String(value));
    }

    // Add file uploads
    for (const [fieldName, fileData] of Object.entries(files)) {
      const fileUploads = Array.isArray(fileData) ? fileData : [fileData];

      for (const upload of fileUploads) {
        let fileBlob: Blob;

        // Convert file data to Blob
        if (upload.buffer) {
          // File provided as Buffer
          fileBlob = new Blob([upload.buffer], {
            type: upload.mimeType || 'application/octet-stream',
          });
        } else if (upload.base64) {
          // File provided as base64 string
          const binaryData = Buffer.from(upload.base64, 'base64');
          fileBlob = new Blob([binaryData], {
            type: upload.mimeType || 'application/octet-stream',
          });
        } else if (upload.filePath) {
          // File provided as filesystem path - read it
          const fileBuffer = await readFile(upload.filePath);
          fileBlob = new Blob([fileBuffer], {
            type: upload.mimeType || 'application/octet-stream',
          });
        } else {
          throw new Error(`File upload for field "${fieldName}" must provide either buffer, base64, or filePath`);
        }

        // Append file to FormData
        // Note: FormData.append expects a File object, but Blob works too
        formData.append(fieldName, fileBlob, upload.filename);
      }
    }

    logger.formLearner.info('Submitting multipart/form-data request', {
      endpoint: pattern.apiEndpoint,
      fieldsCount: Object.keys(fields).length,
      filesCount: Object.keys(files).length,
    });

    // Submit multipart request
    const response = await fetch(pattern.apiEndpoint, {
      method: pattern.method,
      body: formData,
      // Don't set Content-Type - fetch will set it automatically with boundary
    });

    return response;
  }

  /**
   * Detect OTP challenge from API response
   */
  private detectOTPChallenge(
    response: Response,
    responseData: any
  ): OTPChallenge | null {
    // Common OTP detection patterns
    const status = response.status;

    // Pattern 1: Status code based (202 Accepted, 401 Unauthorized with 2FA required)
    const otpStatusCodes = [202, 401, 403, 428]; // 428 = Precondition Required
    const isOTPStatus = otpStatusCodes.includes(status);

    // Pattern 2: Response field based
    const otpFieldPatterns = [
      'requires2FA',
      'requiresOTP',
      'twoFactorRequired',
      'otpRequired',
      'mfaRequired',
      'verification_required',
      'challenge_type',
    ];

    const hasOTPField = otpFieldPatterns.some(
      field => responseData && field in responseData && responseData[field]
    );

    // Pattern 3: Response message based
    const otpMessagePatterns = [
      /verification code/i,
      /2FA/i,
      /two.factor/i,
      /authentication code/i,
      /OTP/i,
      /one.time password/i,
      /sent.*(code|token)/i,
    ];

    const message = responseData?.message || responseData?.error || '';
    const hasOTPMessage = otpMessagePatterns.some(pattern => pattern.test(message));

    if (!isOTPStatus && !hasOTPField && !hasOTPMessage) {
      return null; // Not an OTP challenge
    }

    logger.formLearner.info('Detected OTP challenge', {
      status,
      hasOTPField,
      hasOTPMessage,
      responseData,
    });

    // Extract OTP details from response
    const otpType = this.extractOTPType(responseData);
    const otpEndpoint = responseData?.otpEndpoint ||
                       responseData?.verification_url ||
                       responseData?.verify_url ||
                       response.url; // Default to same endpoint

    const codeLength = responseData?.codeLength ||
                      responseData?.code_length ||
                      (otpType === 'totp' ? 6 : undefined);

    const challenge: OTPChallenge = {
      type: otpType,
      message: responseData?.message || responseData?.error || `Verification code required (${otpType})`,
      destination: responseData?.destination || responseData?.masked_destination,
      expiresIn: responseData?.expiresIn || responseData?.expires_in,
      retryAfter: responseData?.retryAfter || responseData?.retry_after,
      endpoint: otpEndpoint,
      codeLength,
    };

    return challenge;
  }

  /**
   * Extract OTP type from response data
   */
  private extractOTPType(responseData: any): OTPChallenge['type'] {
    const type = responseData?.otpType ||
                responseData?.method ||
                responseData?.challenge_type ||
                responseData?.verificationType;

    if (!type) {
      // Try to infer from message
      const message = (responseData?.message || '').toLowerCase();
      if (message.includes('sms')) return 'sms';
      if (message.includes('email')) return 'email';
      if (message.includes('authenticator')) return 'authenticator';
      if (message.includes('totp')) return 'totp';
      if (message.includes('backup')) return 'backup_code';
      return 'unknown';
    }

    const typeStr = String(type).toLowerCase();
    if (typeStr.includes('sms')) return 'sms';
    if (typeStr.includes('email')) return 'email';
    if (typeStr.includes('totp')) return 'totp';
    if (typeStr.includes('authenticator') || typeStr.includes('app')) return 'authenticator';
    if (typeStr.includes('backup')) return 'backup_code';

    return 'unknown';
  }

  /**
   * Submit OTP code to verification endpoint
   */
  private async submitOTP(
    challenge: OTPChallenge,
    otpCode: string,
    pattern?: LearnedFormPattern
  ): Promise<Response> {
    // Determine OTP field name (use learned pattern if available)
    const otpFieldName = pattern?.otpPattern?.otpFieldName || 'code';
    const otpMethod = pattern?.otpPattern?.otpMethod || 'POST';

    logger.formLearner.info('Submitting OTP code', {
      endpoint: challenge.endpoint,
      otpType: challenge.type,
      codeLength: otpCode.length,
    });

    const response = await fetch(challenge.endpoint, {
      method: otpMethod,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        [otpFieldName]: otpCode,
      }),
    });

    return response;
  }

  /**
   * Learn OTP pattern from challenge and add it to form pattern
   */
  private learnOTPPattern(
    pattern: LearnedFormPattern,
    challenge: OTPChallenge,
    initialResponse: Response,
    initialResponseData: any
  ): void {
    logger.formLearner.info('Learning OTP pattern', {
      patternId: pattern.id,
      otpType: challenge.type,
      endpoint: challenge.endpoint,
    });

    // Detect OTP field name by trying common patterns
    const otpFieldName = initialResponseData?.otpFieldName ||
                        initialResponseData?.code_field ||
                        'code'; // Default

    pattern.requiresOTP = true;
    pattern.otpPattern = {
      detectionIndicators: {
        statusCodes: [initialResponse.status],
        responseFields: Object.keys(initialResponseData || {}).filter(key =>
          key.toLowerCase().includes('otp') ||
          key.toLowerCase().includes('2fa') ||
          key.toLowerCase().includes('mfa') ||
          key.toLowerCase().includes('verification')
        ),
        responseValues: {},
      },
      otpEndpoint: challenge.endpoint,
      otpFieldName,
      otpMethod: 'POST', // Default, could be learned
      otpType: challenge.type,
    };

    // Extract specific response values that indicate OTP requirement
    if (initialResponseData) {
      for (const [key, value] of Object.entries(initialResponseData)) {
        if (
          typeof value === 'boolean' && value === true &&
          (key.includes('requires') || key.includes('needed') || key.includes('required'))
        ) {
          pattern.otpPattern.detectionIndicators.responseValues![key] = value;
        }
      }
    }

    logger.formLearner.info('OTP pattern learned', {
      patternId: pattern.id,
      otpFieldName,
      detectionFields: pattern.otpPattern.detectionIndicators.responseFields,
    });
  }

  /**
   * Enable WebSocket capture via Chrome DevTools Protocol
   */
  private async enableWebSocketCapture(page: Page): Promise<WebSocketMessage[]> {
    const wsMessages: WebSocketMessage[] = [];

    try {
      // Get CDP session
      const client = await page.context().newCDPSession(page);

      // Enable Network domain
      await client.send('Network.enable');

      // Listen for WebSocket events
      client.on('Network.webSocketCreated', (params: any) => {
        logger.formLearner.debug('WebSocket created', { url: params.url });
      });

      client.on('Network.webSocketFrameSent', (params: any) => {
        logger.formLearner.debug('WebSocket frame sent', {
          url: params.response?.url,
          payloadData: params.response?.payloadData
        });

        try {
          const payload = JSON.parse(params.response?.payloadData || '{}');

          wsMessages.push({
            event: payload.event || payload.type || payload.action,
            payload,
            timestamp: Date.now(),
            url: params.response?.url || 'unknown',
            direction: 'send',
          });
        } catch (e) {
          // Not JSON or parse error
          logger.formLearner.debug('Could not parse WebSocket frame', { error: e });
        }
      });

      client.on('Network.webSocketFrameReceived', (params: any) => {
        try {
          const payload = JSON.parse(params.response?.payloadData || '{}');

          wsMessages.push({
            event: payload.event || payload.type || payload.action,
            payload,
            timestamp: Date.now(),
            url: params.response?.url || 'unknown',
            direction: 'receive',
          });
        } catch (e) {
          // Not JSON or parse error
        }
      });

    } catch (error) {
      logger.formLearner.warn('Failed to enable WebSocket capture', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return wsMessages;
  }

  /**
   * Analyze WebSocket messages to learn form submission pattern
   */
  private analyzeWebSocketPattern(
    formUrl: string,
    form: DetectedForm,
    wsMessages: WebSocketMessage[],
    domain: string
  ): LearnedFormPattern | null {
    // Filter to only sent messages (client → server)
    const sentMessages = wsMessages.filter(msg => msg.direction === 'send');

    if (sentMessages.length === 0) {
      logger.formLearner.debug('No WebSocket messages sent during form submission');
      return null;
    }

    // Find the most likely form submission message
    // Look for messages with form field names in payload
    const formFieldNames = form.fields.map(f => f.name.toLowerCase());

    let bestMatch: WebSocketMessage | null = null;
    let bestMatchScore = 0;

    for (const msg of sentMessages) {
      let score = 0;
      const payloadKeys = Object.keys(msg.payload).map(k => k.toLowerCase());

      // Score based on matching field names
      for (const fieldName of formFieldNames) {
        if (payloadKeys.includes(fieldName)) {
          score += 2;
        }
        // Check for camelCase/snake_case variations
        const camelCase = this.toCamelCase(fieldName);
        const snakeCase = this.toSnakeCase(fieldName);
        if (payloadKeys.includes(camelCase) || payloadKeys.includes(snakeCase)) {
          score += 1;
        }
      }

      // Prefer messages with event names containing 'submit', 'create', 'update', 'send'
      const eventName = (msg.event || '').toLowerCase();
      if (eventName.includes('submit') || eventName.includes('create') ||
          eventName.includes('update') || eventName.includes('send')) {
        score += 3;
      }

      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = msg;
      }
    }

    if (!bestMatch || bestMatchScore === 0) {
      logger.formLearner.debug('Could not identify form submission in WebSocket messages');
      return null;
    }

    logger.formLearner.info('Identified WebSocket form submission pattern', {
      event: bestMatch.event,
      url: bestMatch.url,
      score: bestMatchScore,
    });

    // Extract field mapping
    const fieldMapping: Record<string, string> = {};
    const payloadKeys = Object.keys(bestMatch.payload);

    for (const field of form.fields) {
      if (field.type === 'submit') continue;

      const fieldName = field.name;
      const camelCase = this.toCamelCase(fieldName);
      const snakeCase = this.toSnakeCase(fieldName);

      if (payloadKeys.includes(fieldName)) {
        fieldMapping[fieldName] = fieldName;
      } else if (payloadKeys.includes(camelCase)) {
        fieldMapping[fieldName] = camelCase;
      } else if (payloadKeys.includes(snakeCase)) {
        fieldMapping[fieldName] = snakeCase;
      }
    }

    // Detect protocol (Socket.IO vs raw WebSocket)
    const protocol = this.detectWebSocketProtocol(bestMatch);

    // Find response message (if any)
    const responseMessage = wsMessages.find(msg =>
      msg.direction === 'receive' &&
      msg.timestamp > bestMatch!.timestamp &&
      msg.timestamp - bestMatch!.timestamp < 5000 // Within 5 seconds
    );

    const pattern: LearnedFormPattern = {
      id: `ws:${domain}:${Date.now()}`,
      domain,
      formUrl,
      apiEndpoint: bestMatch.url,
      method: 'WEBSOCKET',
      patternType: 'websocket',
      fieldMapping,
      websocketPattern: {
        wsUrl: bestMatch.url,
        eventName: bestMatch.event,
        payloadTemplate: bestMatch.payload,
        fieldMapping,
        protocol,
        responseEvent: responseMessage?.event,
        successFields: responseMessage ? Object.keys(responseMessage.payload) : undefined,
      },
      requiredFields: form.fields.filter(f => f.required).map(f => f.name),
      successIndicators: {
        statusCodes: [200], // WebSocket doesn't have HTTP status, but we keep for consistency
      },
      dynamicFields: [],
      learnedAt: Date.now(),
      timesUsed: 0,
      successRate: 1.0,
    };

    logger.formLearner.info('Learned WebSocket form pattern', {
      patternId: pattern.id,
      event: bestMatch.event,
      protocol,
      fieldsCount: Object.keys(fieldMapping).length,
    });

    return pattern;
  }

  /**
   * Detect WebSocket protocol (Socket.IO, raw WebSocket, SockJS)
   */
  private detectWebSocketProtocol(message: WebSocketMessage): WebSocketPattern['protocol'] {
    const url = message.url.toLowerCase();
    const payload = message.payload;

    // Socket.IO detection
    if (url.includes('socket.io') || payload.type === '42' || 'event' in payload) {
      return 'socket.io';
    }

    // SockJS detection
    if (url.includes('sockjs')) {
      return 'sockjs';
    }

    // Default to raw WebSocket
    return 'websocket';
  }

  /**
   * Submit form via WebSocket using learned pattern
   *
   * Note: This is a basic implementation. For production use with Socket.IO or
   * other WebSocket libraries, you may need to install additional dependencies.
   */
  private async submitViaWebSocket(
    data: FormSubmissionData,
    pattern: LearnedFormPattern
  ): Promise<{ success: boolean; data?: any }> {
    if (!pattern.websocketPattern) {
      throw new Error('WebSocket pattern is missing');
    }

    const wsPattern = pattern.websocketPattern;

    logger.formLearner.info('Submitting form via WebSocket', {
      wsUrl: wsPattern.wsUrl,
      event: wsPattern.eventName,
      protocol: wsPattern.protocol,
    });

    return new Promise((resolve, reject) => {
      // Note: In Node.js, WebSocket is not natively available
      // Users need to install 'ws' package: npm install ws
      // For Socket.IO: npm install socket.io-client

      // Check if WebSocket is available (browser or Node.js with 'ws' installed)
      if (typeof WebSocket === 'undefined') {
        reject(new Error(
          'WebSocket is not available. ' +
          'For Node.js, install the "ws" package: npm install ws. ' +
          'For Socket.IO, install "socket.io-client": npm install socket.io-client'
        ));
        return;
      }

      const ws = new WebSocket(wsPattern.wsUrl);
      let responseReceived = false;

      ws.onopen = () => {
        logger.formLearner.debug('WebSocket connection opened');

        // Build payload from field mapping
        const payload: Record<string, any> = {};

        for (const [formField, wsField] of Object.entries(wsPattern.fieldMapping)) {
          if (data.fields[formField] !== undefined) {
            payload[wsField] = data.fields[formField];
          }
        }

        // Merge with payload template (to include any static fields)
        const fullPayload = {
          ...wsPattern.payloadTemplate,
          ...payload,
        };

        // Send message based on protocol
        if (wsPattern.protocol === 'socket.io') {
          // Socket.IO format: ['event', data]
          const socketIoMessage = JSON.stringify([wsPattern.eventName, fullPayload]);
          ws.send(socketIoMessage);
        } else {
          // Raw WebSocket: send JSON payload
          const message = wsPattern.eventName
            ? JSON.stringify({ event: wsPattern.eventName, ...fullPayload })
            : JSON.stringify(fullPayload);
          ws.send(message);
        }

        logger.formLearner.debug('WebSocket message sent', { payload: fullPayload });

        // If no response event expected, resolve immediately
        if (!wsPattern.responseEvent) {
          setTimeout(() => {
            ws.close();
            if (!responseReceived) {
              resolve({ success: true });
            }
          }, 1000);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());

          logger.formLearner.debug('WebSocket message received', { data });

          // Check if this is the expected response
          if (wsPattern.responseEvent) {
            const eventName = data.event || data.type || data.action;
            if (eventName === wsPattern.responseEvent) {
              responseReceived = true;
              ws.close();
              resolve({ success: true, data });
            }
          } else {
            // No specific response event, accept any response
            responseReceived = true;
            ws.close();
            resolve({ success: true, data });
          }
        } catch (e) {
          // Not JSON or parse error
          logger.formLearner.debug('Could not parse WebSocket response', { error: e });
        }
      };

      ws.onerror = (error) => {
        logger.formLearner.error('WebSocket error', { error });
        reject(new Error(`WebSocket error: ${error}`));
      };

      ws.onclose = () => {
        logger.formLearner.debug('WebSocket connection closed');
        if (!responseReceived && wsPattern.responseEvent) {
          reject(new Error('WebSocket closed without receiving expected response'));
        }
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!responseReceived) {
          ws.close();
          reject(new Error('WebSocket submission timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Submit form via browser and learn the API pattern
   */
  private async submitViaBrowserAndLearn(
    data: FormSubmissionData,
    page: Page,
    domain: string,
    options: SubmitFormOptions,
    startTime: number
  ): Promise<FormSubmissionResult> {
    const networkRequests: NetworkRequest[] = [];

    // Enable WebSocket capture
    const wsMessagesPromise = this.enableWebSocketCapture(page);

    // Capture network requests
    const requestListener = (request: any) => {
      // Try to capture POST data (for GraphQL mutation detection)
      let requestBody: any = null;
      try {
        requestBody = request.postDataJSON();
      } catch {
        // Not JSON or no POST data
      }

      request.response().then((response: any) => {
        const req: NetworkRequest = {
          url: request.url(),
          method: request.method(),
          status: response.status(),
          statusText: response.statusText(),
          headers: response.headers(),
          requestHeaders: request.headers(),
          contentType: response.headers()['content-type'],
          timestamp: Date.now(),
        };

        // Store request body if available (needed for GraphQL detection)
        if (requestBody) {
          (req as any).requestBody = requestBody;
        }

        // Capture response body for mutation requests
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
          response.json().then((body: any) => {
            req.responseBody = body;
          }).catch(() => {
            // Not JSON, skip
          });
        }

        networkRequests.push(req);
      }).catch(() => {
        // Ignore failed requests
      });
    };

    page.on('request', requestListener);

    try {
      // Navigate to form page
      await page.goto(data.url, { waitUntil: 'networkidle' });

      // Detect form structure
      const form = await this.detectForm(page, data.formSelector);

      if (!form) {
        throw new Error('No form found on page');
      }

      // Fill form fields
      for (const [fieldName, value] of Object.entries(data.fields)) {
        const field = form.fields.find(f => f.name === fieldName);
        if (field) {
          await page.fill(field.selector, String(value));
        }
      }

      // Submit form
      await Promise.all([
        options.waitForNavigation !== false
          ? page.waitForNavigation({ waitUntil: 'networkidle' })
          : Promise.resolve(),
        page.click(form.submitSelector),
      ]);

      // Get captured WebSocket messages
      const wsMessages = await wsMessagesPromise;

      // Try to learn WebSocket pattern first
      let learnedPattern: LearnedFormPattern | null = null;

      if (wsMessages.length > 0) {
        logger.formLearner.debug('Analyzing WebSocket messages for form pattern', {
          messagesCount: wsMessages.length,
        });

        learnedPattern = this.analyzeWebSocketPattern(
          data.url,
          form,
          wsMessages,
          domain
        );
      }

      // If no WebSocket pattern found, try REST/GraphQL pattern
      if (!learnedPattern) {
        logger.formLearner.debug('No WebSocket pattern found, analyzing HTTP requests');

        learnedPattern = this.analyzeFormSubmission(
          data.url,
          form,
          networkRequests,
          domain
        );
      }

      if (learnedPattern) {
        this.formPatterns.set(learnedPattern.id, learnedPattern);
        logger.formLearner.info('Learned new form pattern', {
          patternId: learnedPattern.id,
          patternType: learnedPattern.patternType || 'rest',
          endpoint: learnedPattern.apiEndpoint,
          fieldsCount: Object.keys(learnedPattern.fieldMapping).length,
        });
      }

      return {
        success: true,
        method: 'browser',
        responseUrl: page.url(),
        duration: Date.now() - startTime,
        learned: !!learnedPattern,
      };
    } catch (error) {
      return {
        success: false,
        method: 'browser',
        duration: Date.now() - startTime,
        learned: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      page.off('request', requestListener);
    }
  }

  /**
   * Detect form structure on the page
   */
  private async detectForm(page: Page, formSelector?: string): Promise<DetectedForm | null> {
    return await page.evaluate((selector) => {
      const forms = selector
        ? [document.querySelector(selector) as HTMLFormElement]
        : Array.from(document.querySelectorAll('form'));

      const form = forms.find(f => f !== null);
      if (!form) return null;

      const fields: any[] = [];
      const csrfFields: any[] = [];
      const fileFields: any[] = [];

      // Extract all input, select, textarea elements
      const inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach((input: any) => {
        // Handle file inputs separately
        if (input.type === 'file') {
          fileFields.push({
            name: input.name || input.id,
            required: input.required || input.hasAttribute('required'),
            accept: input.accept || undefined,
            multiple: input.multiple || input.hasAttribute('multiple'),
            selector: getSelector(input),
          });
          return; // Don't add file inputs to regular fields
        }

        const field = {
          name: input.name || input.id,
          type: input.type || input.tagName.toLowerCase(),
          required: input.required || input.hasAttribute('required'),
          value: input.value,
          selector: getSelector(input),
        };

        fields.push(field);

        // Detect CSRF tokens (hidden fields with token-like names)
        if (
          input.type === 'hidden' &&
          (input.name.toLowerCase().includes('csrf') ||
           input.name.toLowerCase().includes('token') ||
           input.name.toLowerCase().includes('authenticity'))
        ) {
          csrfFields.push(field);
        }
      });

      // Find submit button
      const submitButton =
        form.querySelector('button[type="submit"]') ||
        form.querySelector('input[type="submit"]') ||
        form.querySelector('button');

      // Get form encoding (enctype)
      const encoding = form.enctype ||
        (fileFields.length > 0 ? 'multipart/form-data' : 'application/x-www-form-urlencoded');

      return {
        action: form.action,
        method: form.method.toUpperCase() || 'POST',
        encoding,
        fields,
        fileFields,
        submitSelector: submitButton ? getSelector(submitButton) : 'button[type="submit"]',
        csrfFields,
      };

      // Helper to generate CSS selector
      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        if (el.name) return `[name="${el.name}"]`;
        return el.tagName.toLowerCase();
      }
    }, formSelector);
  }

  /**
   * Analyze form submission to learn the API pattern
   */
  private analyzeFormSubmission(
    formUrl: string,
    form: DetectedForm,
    networkRequests: NetworkRequest[],
    domain: string
  ): LearnedFormPattern | null {
    // Find mutation requests (POST/PUT/PATCH/DELETE) that are likely the form submission
    const submitRequests = networkRequests.filter(req =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.status >= 200 && req.status < 400
    );

    if (submitRequests.length === 0) {
      logger.formLearner.warn('No successful mutation requests (POST/PUT/PATCH/DELETE) found in form submission');
      return null;
    }

    // Use the first successful mutation (most likely the form submission)
    const submitRequest = submitRequests[0];

    // Check if this is a Server Action (Next.js/Remix) - check first as it's most specific
    const serverAction = this.detectServerAction(submitRequest, formUrl);
    if (serverAction) {
      logger.formLearner.info('Detected server action submission', {
        framework: serverAction.framework,
        endpoint: submitRequest.url,
        actionId: serverAction.actionId,
        actionName: serverAction.actionName,
      });
      return this.createServerActionPattern(formUrl, form, submitRequest, serverAction, domain);
    }

    // Check if this is a GraphQL mutation
    const graphqlMutation = this.detectGraphQLMutation(submitRequest);
    if (graphqlMutation) {
      logger.formLearner.info('Detected GraphQL mutation submission', {
        endpoint: submitRequest.url,
        mutationName: graphqlMutation.mutationName,
      });
      return this.createGraphQLPattern(formUrl, form, submitRequest, graphqlMutation, domain);
    }

    // Check if this is a JSON-RPC method call
    const jsonRpc = this.detectJsonRpc(submitRequest);
    if (jsonRpc) {
      logger.formLearner.info('Detected JSON-RPC submission', {
        endpoint: submitRequest.url,
        method: jsonRpc.methodName,
        version: jsonRpc.version,
      });
      return this.createJsonRpcPattern(formUrl, form, submitRequest, jsonRpc, domain);
    }

    // Try to extract field mapping from request body
    const fieldMapping = this.extractFieldMapping(form, submitRequest);

    if (Object.keys(fieldMapping).length === 0) {
      logger.formLearner.warn('Could not extract field mapping from request');
      return null;
    }

    // Detect CSRF token handling
    const csrfHandling = this.detectCsrfHandling(form);

    const pattern: LearnedFormPattern = {
      id: `form:${domain}:${Date.now()}`,
      domain,
      formUrl,
      apiEndpoint: submitRequest.url,
      method: submitRequest.method,
      encoding: form.encoding as LearnedFormPattern['encoding'],
      fieldMapping,
      fileFields: form.fileFields && form.fileFields.length > 0 ? form.fileFields : undefined,
      csrfTokenField: csrfHandling?.fieldName,
      csrfTokenSource: csrfHandling?.source,
      csrfTokenSelector: csrfHandling?.selector,
      requiredFields: form.fields.filter(f => f.required).map(f => f.name),
      successIndicators: {
        statusCodes: [submitRequest.status],
      },
      dynamicFields: [], // Will be populated by multi-submission learning
      learnedAt: Date.now(),
      timesUsed: 0,
      successRate: 1.0,
    };

    return pattern;
  }

  /**
   * Extract field mapping from form and request
   */
  private extractFieldMapping(
    form: DetectedForm,
    request: NetworkRequest
  ): Record<string, string> {
    const mapping: Record<string, string> = {};

    // Try to parse request body
    const requestBody = request.requestHeaders['content-type']?.includes('application/json')
      ? this.tryParseJson(String(request.requestHeaders))
      : null;

    if (!requestBody) {
      // Fallback: assume 1:1 mapping
      for (const field of form.fields) {
        if (field.name && field.type !== 'submit') {
          mapping[field.name] = field.name;
        }
      }
    } else {
      // Try to match form fields to API fields
      for (const field of form.fields) {
        if (field.name && field.type !== 'submit') {
          // Look for exact match
          if (field.name in requestBody) {
            mapping[field.name] = field.name;
          } else {
            // Look for camelCase/snake_case variations
            const variations = [
              field.name,
              this.toCamelCase(field.name),
              this.toSnakeCase(field.name),
            ];

            for (const variant of variations) {
              if (variant in requestBody) {
                mapping[field.name] = variant;
                break;
              }
            }
          }
        }
      }
    }

    return mapping;
  }

  /**
   * Detect CSRF token handling
   */
  private detectCsrfHandling(form: DetectedForm): {
    fieldName: string;
    source: 'meta' | 'hidden' | 'cookie';
    selector?: string;
  } | null {
    if (form.csrfFields.length > 0) {
      const csrfField = form.csrfFields[0];
      return {
        fieldName: csrfField.name,
        source: 'hidden',
        selector: csrfField.selector,
      };
    }

    return null;
  }

  /**
   * Extract CSRF token for learned pattern
   */
  private async extractCsrfToken(
    url: string,
    pattern: LearnedFormPattern
  ): Promise<string | null> {
    if (!pattern.csrfTokenSource || !pattern.csrfTokenSelector) {
      return null;
    }

    // Fetch the form page to get the token
    const response = await fetch(url);
    const html = await response.text();

    // Extract token from HTML
    if (pattern.csrfTokenSource === 'hidden' || pattern.csrfTokenSource === 'meta') {
      const match = html.match(new RegExp(`${pattern.csrfTokenSelector}[^>]*value=["']([^"']+)["']`));
      return match ? match[1] : null;
    }

    return null;
  }

  /**
   * Check if response indicates success
   */
  private isSuccessResponse(
    status: number,
    data: any,
    pattern: LearnedFormPattern
  ): boolean {
    // Check status code
    if (!pattern.successIndicators.statusCodes.includes(status)) {
      return false;
    }

    // Check response fields if defined
    if (pattern.successIndicators.responseFields) {
      for (const field of pattern.successIndicators.responseFields) {
        if (!(field in data)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Find matching learned pattern for a form
   */
  private findMatchingPattern(
    url: string,
    formSelector?: string
  ): LearnedFormPattern | null {
    const domain = new URL(url).hostname;

    for (const pattern of this.formPatterns.values()) {
      if (pattern.domain === domain && pattern.formUrl === url) {
        if (!formSelector || pattern.formSelector === formSelector) {
          return pattern;
        }
      }
    }

    return null;
  }

  /**
   * Get all learned patterns for a domain
   */
  getLearnedPatterns(domain: string): LearnedFormPattern[] {
    return Array.from(this.formPatterns.values())
      .filter(p => p.domain === domain);
  }

  /**
   * Helper: Try to parse JSON safely
   */
  private tryParseJson(str: string): any | null {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  /**
   * Helper: Convert to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/[_-](\w)/g, (_, c) => c.toUpperCase());
  }

  /**
   * Helper: Convert to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Extract value for a dynamic field
   */
  private async extractDynamicFieldValue(
    pageUrl: string,
    field: DynamicField
  ): Promise<string | number | null> {
    const strategy = field.extractionStrategy;

    try {
      switch (strategy.type) {
        case 'dom':
          return await this.extractFromDom(pageUrl, strategy.selector!);

        case 'api':
          return await this.extractFromApi(strategy.apiEndpoint!);

        case 'cookie':
          return this.extractFromCookie(strategy.cookieName!);

        case 'url_param':
          return this.extractFromUrlParam(pageUrl, strategy.paramName!);

        case 'localStorage':
          // localStorage extraction requires browser context
          logger.formLearner.warn('localStorage extraction not yet implemented, requires browser context');
          return null;

        case 'computed':
          return this.computeValue(strategy.computeFn!);

        default:
          logger.formLearner.warn('Unknown extraction strategy type', { type: strategy.type });
          return null;
      }
    } catch (error) {
      logger.formLearner.error('Failed to extract dynamic field value', {
        field: field.fieldName,
        strategy: strategy.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract value from DOM by fetching page and parsing HTML
   */
  private async extractFromDom(url: string, selector: string): Promise<string | null> {
    const response = await fetch(url);
    const html = await response.text();

    // Simple regex-based extraction (could use cheerio for more robust parsing)
    const regex = new RegExp(`${selector}[^>]*(?:value|data-value|data-id)=["']([^"']+)["']`, 'i');
    const match = html.match(regex);

    if (match) {
      return match[1];
    }

    // Try data attributes
    const dataRegex = new RegExp(`${selector}[^>]*>([^<]+)<`, 'i');
    const dataMatch = html.match(dataRegex);

    return dataMatch ? dataMatch[1].trim() : null;
  }

  /**
   * Extract value from an API endpoint
   */
  private async extractFromApi(apiUrl: string): Promise<string | number | null> {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    // Return first string/number value found
    if (typeof data === 'string' || typeof data === 'number') {
      return data;
    }

    // Look for common field names
    const commonFields = ['id', 'userId', 'user_id', 'sessionId', 'session_id', 'nonce', 'token'];
    for (const field of commonFields) {
      if (field in data && (typeof data[field] === 'string' || typeof data[field] === 'number')) {
        return data[field];
      }
    }

    return null;
  }

  /**
   * Extract value from cookie
   */
  private extractFromCookie(cookieName: string): string | null {
    // Note: In browser context, use document.cookie
    // In Node.js, we'd need the cookie jar from the session
    logger.formLearner.warn('Cookie extraction requires browser or session context');
    return null;
  }

  /**
   * Extract value from URL parameter
   */
  private extractFromUrlParam(url: string, paramName: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get(paramName);
    } catch {
      return null;
    }
  }

  /**
   * Compute value using a function string
   */
  private computeValue(computeFn: string): string | number {
    // Safe evaluation of simple expressions
    if (computeFn === 'Date.now()') {
      return Date.now();
    }

    if (computeFn === 'Math.random()') {
      return Math.random();
    }

    if (computeFn.startsWith('uuid()') || computeFn === 'UUID()') {
      return this.generateUUID();
    }

    logger.formLearner.warn('Unknown compute function', { computeFn });
    return '';
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Detect if a value is dynamic (changes between submissions)
   */
  private detectDynamicValue(
    fieldName: string,
    value: any,
    values: any[]
  ): { isDynamic: boolean; valueType?: DynamicField['valueType'] } {
    // If we've seen different values for this field, it's dynamic
    const uniqueValues = new Set(values);
    if (uniqueValues.size <= 1) {
      return { isDynamic: false };
    }

    // Detect value type based on name and format
    const lowerName = fieldName.toLowerCase();

    if (lowerName.includes('csrf') || lowerName.includes('token')) {
      return { isDynamic: true, valueType: 'csrf_token' };
    }

    if (lowerName.includes('nonce')) {
      return { isDynamic: true, valueType: 'nonce' };
    }

    if (lowerName.includes('user') && lowerName.includes('id')) {
      return { isDynamic: true, valueType: 'user_id' };
    }

    if (lowerName.includes('session')) {
      return { isDynamic: true, valueType: 'session_id' };
    }

    // Check value format
    const stringValue = String(value);

    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stringValue)) {
      return { isDynamic: true, valueType: 'uuid' };
    }

    // Timestamp pattern
    if (/^\d{10,13}$/.test(stringValue)) {
      return { isDynamic: true, valueType: 'timestamp' };
    }

    return { isDynamic: true, valueType: 'custom' };
  }

  /**
   * Infer extraction strategy for a dynamic field
   */
  private inferExtractionStrategy(
    field: FormField,
    valueType: DynamicField['valueType']
  ): DynamicField['extractionStrategy'] {
    // CSRF tokens usually come from hidden fields or meta tags
    if (valueType === 'csrf_token') {
      if (field.type === 'hidden') {
        return {
          type: 'dom',
          selector: field.selector,
        };
      }
      return {
        type: 'dom',
        selector: 'meta[name="csrf-token"]',
      };
    }

    // Timestamps are computed
    if (valueType === 'timestamp') {
      return {
        type: 'computed',
        computeFn: 'Date.now()',
      };
    }

    // UUIDs are computed
    if (valueType === 'uuid') {
      return {
        type: 'computed',
        computeFn: 'uuid()',
      };
    }

    // User IDs might come from cookies, localStorage, or API
    if (valueType === 'user_id') {
      return {
        type: 'cookie',
        cookieName: 'user_id',
      };
    }

    // Default: try to extract from DOM
    return {
      type: 'dom',
      selector: field.selector,
    };
  }

  /**
   * Mask sensitive values for logging
   */
  private maskSensitiveValue(value: string | number, valueType: DynamicField['valueType']): string {
    const str = String(value);

    if (valueType === 'csrf_token' || valueType === 'session_id') {
      return str.substring(0, 8) + '...' + str.substring(str.length - 4);
    }

    return str;
  }

  /**
   * Analyze form to detect dynamic fields during learning
   */
  private detectDynamicFields(
    form: DetectedForm,
    submissions: Array<{ fields: FormField[]; request: NetworkRequest }>
  ): DynamicField[] {
    const dynamicFields: DynamicField[] = [];

    // Group field values across multiple submissions
    const fieldValues = new Map<string, any[]>();

    for (const submission of submissions) {
      for (const field of submission.fields) {
        if (!fieldValues.has(field.name)) {
          fieldValues.set(field.name, []);
        }
        fieldValues.get(field.name)!.push(field.value);
      }
    }

    // Detect which fields are dynamic
    for (const [fieldName, values] of fieldValues.entries()) {
      const detection = this.detectDynamicValue(fieldName, values[0], values);

      if (detection.isDynamic && detection.valueType) {
        const formField = form.fields.find(f => f.name === fieldName);
        if (formField) {
          const strategy = this.inferExtractionStrategy(formField, detection.valueType);

          dynamicFields.push({
            fieldName,
            valueType: detection.valueType,
            extractionStrategy: strategy,
          });
        }
      }
    }

    return dynamicFields;
  }

  /**
   * Detect if a network request is a GraphQL mutation
   */
  private detectGraphQLMutation(request: NetworkRequest): {
    mutationName: string;
    query: string;
    variables: Record<string, any>;
  } | null {
    // GraphQL requests are typically POST to /graphql endpoint
    if (request.method !== 'POST') {
      return null;
    }

    // Check if URL looks like GraphQL endpoint
    const url = request.url.toLowerCase();
    if (!url.includes('graphql') && !url.includes('/gql') && !url.includes('/query')) {
      return null;
    }

    // Get request body (added during network monitoring)
    const requestBody = (request as any).requestBody;
    if (!requestBody || typeof requestBody !== 'object') {
      return null;
    }

    // GraphQL requests have 'query' and optionally 'variables' fields
    if (!('query' in requestBody) || typeof requestBody.query !== 'string') {
      return null;
    }

    const query = requestBody.query as string;

    // Check if it's a mutation (not a query)
    if (!query.trim().startsWith('mutation')) {
      return null;
    }

    // Extract mutation name from query
    const mutationMatch = query.match(/mutation\s+(\w+)/);
    const mutationName = mutationMatch ? mutationMatch[1] : 'UnknownMutation';

    const variables = (requestBody.variables as Record<string, any>) || {};

    return {
      mutationName,
      query,
      variables,
    };
  }

  /**
   * Create a GraphQL-specific learned pattern
   */
  private createGraphQLPattern(
    formUrl: string,
    form: DetectedForm,
    request: NetworkRequest,
    graphqlMutation: { mutationName: string; query: string; variables: Record<string, any> },
    domain: string
  ): LearnedFormPattern {
    // Map form fields to GraphQL variables
    const variableMapping: Record<string, string> = {};
    const fieldMapping: Record<string, string> = {};

    // Try to match form fields to GraphQL variables
    for (const field of form.fields) {
      if (field.type === 'submit' || !field.name) continue;

      // Look for matching variable names
      const fieldName = field.name;
      const variableNames = Object.keys(graphqlMutation.variables);

      // Try exact match first
      if (variableNames.includes(fieldName)) {
        variableMapping[fieldName] = fieldName;
        fieldMapping[fieldName] = fieldName;
      } else {
        // Try camelCase/snake_case variations
        const camelCase = this.toCamelCase(fieldName);
        const snakeCase = this.toSnakeCase(fieldName);

        if (variableNames.includes(camelCase)) {
          variableMapping[fieldName] = camelCase;
          fieldMapping[fieldName] = camelCase;
        } else if (variableNames.includes(snakeCase)) {
          variableMapping[fieldName] = snakeCase;
          fieldMapping[fieldName] = snakeCase;
        }
      }
    }

    // Detect CSRF handling
    const csrfHandling = this.detectCsrfHandling(form);

    const pattern: LearnedFormPattern = {
      id: `graphql:${domain}:${Date.now()}`,
      domain,
      formUrl,
      apiEndpoint: request.url,
      method: 'POST',
      patternType: 'graphql',
      encoding: form.encoding as LearnedFormPattern['encoding'],
      graphqlMutation: {
        mutationName: graphqlMutation.mutationName,
        query: graphqlMutation.query,
        variableMapping,
      },
      fieldMapping,
      fileFields: form.fileFields && form.fileFields.length > 0 ? form.fileFields : undefined,
      csrfTokenField: csrfHandling?.fieldName,
      csrfTokenSource: csrfHandling?.source,
      csrfTokenSelector: csrfHandling?.selector,
      requiredFields: form.fields.filter(f => f.required).map(f => f.name),
      successIndicators: {
        statusCodes: [request.status],
      },
      dynamicFields: [], // Will be populated by multi-submission learning
      learnedAt: Date.now(),
      timesUsed: 0,
      successRate: 1.0,
    };

    logger.formLearner.info('Created GraphQL mutation pattern', {
      patternId: pattern.id,
      mutationName: graphqlMutation.mutationName,
      variablesCount: Object.keys(variableMapping).length,
    });

    return pattern;
  }

  /**
   * Detect server action pattern (Next.js Server Actions or Remix Actions)
   */
  private detectServerAction(request: NetworkRequest, formUrl: string): {
    framework: 'nextjs' | 'remix';
    actionId?: string;
    actionName?: string;
    requestBody: any;
  } | null {
    // Server actions are POST requests
    if (request.method !== 'POST') {
      return null;
    }

    // Get request headers and body
    const headers = request.requestHeaders || {};
    const requestBody = (request as any).requestBody;

    // Check for Next.js Server Action (Next-Action header)
    const nextActionHeader = headers['next-action'] || headers['Next-Action'];
    if (nextActionHeader) {
      logger.formLearner.info('Detected Next.js Server Action', {
        actionId: nextActionHeader,
        url: request.url,
      });

      return {
        framework: 'nextjs',
        actionId: String(nextActionHeader),
        requestBody,
      };
    }

    // Check for Remix Action (_action field in form data)
    // Remix actions POST to the same route, often with _action field
    const urlObj = new URL(request.url);
    const formUrlObj = new URL(formUrl);

    // Check if request URL matches form URL (or is the same route)
    const isSameRoute = urlObj.pathname === formUrlObj.pathname;

    if (isSameRoute && requestBody) {
      // Look for _action field (Remix convention for multiple actions)
      if (typeof requestBody === 'object' && '_action' in requestBody) {
        logger.formLearner.info('Detected Remix Action with _action field', {
          actionName: requestBody._action,
          url: request.url,
        });

        return {
          framework: 'remix',
          actionName: String(requestBody._action),
          requestBody,
        };
      }

      // Even without _action, if it POSTs to same route, likely Remix Action
      // But we'll be conservative and only detect if we have strong indicators
      const hasRemixIndicators =
        headers['content-type']?.includes('application/x-www-form-urlencoded') ||
        headers['content-type']?.includes('multipart/form-data');

      if (hasRemixIndicators && isSameRoute) {
        logger.formLearner.info('Detected Remix Action (same-route POST)', {
          url: request.url,
        });

        return {
          framework: 'remix',
          requestBody,
        };
      }
    }

    return null;
  }

  /**
   * Create a server action pattern
   */
  private createServerActionPattern(
    formUrl: string,
    form: DetectedForm,
    request: NetworkRequest,
    serverAction: {
      framework: 'nextjs' | 'remix';
      actionId?: string;
      actionName?: string;
      requestBody: any;
    },
    domain: string
  ): LearnedFormPattern {
    // Extract field mapping from request body
    const fieldMapping: Record<string, string> = {};

    if (serverAction.requestBody && typeof serverAction.requestBody === 'object') {
      for (const field of form.fields) {
        if (field.type === 'submit' || !field.name) continue;

        // Skip _action field for Remix (it's a framework field, not user data)
        if (field.name === '_action') continue;

        const fieldName = field.name;

        // Try exact match
        if (fieldName in serverAction.requestBody) {
          fieldMapping[fieldName] = fieldName;
        } else {
          // Try camelCase/snake_case variations
          const camelCase = this.toCamelCase(fieldName);
          const snakeCase = this.toSnakeCase(fieldName);

          if (camelCase in serverAction.requestBody) {
            fieldMapping[fieldName] = camelCase;
          } else if (snakeCase in serverAction.requestBody) {
            fieldMapping[fieldName] = snakeCase;
          } else {
            // Default to 1:1 mapping
            fieldMapping[fieldName] = fieldName;
          }
        }
      }
    } else {
      // Fallback: assume 1:1 mapping
      for (const field of form.fields) {
        if (field.name && field.type !== 'submit' && field.name !== '_action') {
          fieldMapping[field.name] = field.name;
        }
      }
    }

    // Detect CSRF handling
    const csrfHandling = this.detectCsrfHandling(form);

    // Determine response type based on status code and content-type
    let responseType: 'redirect' | 'json' | 'flight-stream' = 'json';
    if (request.status >= 300 && request.status < 400) {
      responseType = 'redirect';
    } else if (request.responseHeaders?.['content-type']?.includes('text/x-component')) {
      responseType = 'flight-stream'; // React Server Components streaming
    }

    const pattern: LearnedFormPattern = {
      id: `server-action:${domain}:${Date.now()}`,
      domain,
      formUrl,
      apiEndpoint: request.url,
      method: 'POST',
      patternType: 'server-action',
      encoding: form.encoding as LearnedFormPattern['encoding'],
      serverActionPattern: {
        framework: serverAction.framework,
        actionId: serverAction.actionId,
        actionName: serverAction.actionName,
        isStableId: false, // Assume non-stable for Next.js (changes per build)
        fieldMapping,
        responseType,
        redirectPattern: responseType === 'redirect' ? request.responseHeaders?.['location'] : undefined,
      },
      fieldMapping,
      fileFields: form.fileFields && form.fileFields.length > 0 ? form.fileFields : undefined,
      csrfTokenField: csrfHandling?.fieldName,
      csrfTokenSource: csrfHandling?.source,
      csrfTokenSelector: csrfHandling?.selector,
      requiredFields: form.fields.filter(f => f.required).map(f => f.name),
      successIndicators: {
        statusCodes: [request.status],
      },
      dynamicFields: [], // Will be populated by multi-submission learning
      learnedAt: Date.now(),
      timesUsed: 0,
      successRate: 1.0,
    };

    logger.formLearner.info('Created server action pattern', {
      patternId: pattern.id,
      framework: serverAction.framework,
      actionId: serverAction.actionId,
      actionName: serverAction.actionName,
      fieldsCount: Object.keys(fieldMapping).length,
    });

    return pattern;
  }

  /**
   * Detect JSON-RPC method call pattern
   */
  private detectJsonRpc(request: NetworkRequest): {
    methodName: string;
    params: Record<string, any>;
    version: '1.0' | '2.0';
    id: any;
  } | null {
    // JSON-RPC requires POST method
    if (request.method !== 'POST') {
      return null;
    }

    // Must be JSON content type
    const contentType = request.requestHeaders?.['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    // Get request body
    const requestBody = (request as any).requestBody;
    if (!requestBody || typeof requestBody !== 'object') {
      return null;
    }

    // JSON-RPC 2.0 detection
    if (requestBody.jsonrpc === '2.0' && typeof requestBody.method === 'string') {
      const params = requestBody.params || {};

      logger.formLearner.info('Detected JSON-RPC 2.0 request', {
        method: requestBody.method,
        hasParams: !!requestBody.params,
        id: requestBody.id,
      });

      return {
        methodName: requestBody.method,
        params: typeof params === 'object' ? params : {},
        version: '2.0',
        id: requestBody.id,
      };
    }

    // JSON-RPC 1.0 detection (legacy)
    if (typeof requestBody.method === 'string' && 'params' in requestBody && 'id' in requestBody) {
      const params = requestBody.params || {};

      logger.formLearner.info('Detected JSON-RPC 1.0 request', {
        method: requestBody.method,
        hasParams: !!requestBody.params,
        id: requestBody.id,
      });

      return {
        methodName: requestBody.method,
        params: Array.isArray(params) ? {} : params, // 1.0 can use arrays, convert to object
        version: '1.0',
        id: requestBody.id,
      };
    }

    return null;
  }

  /**
   * Create a JSON-RPC pattern
   */
  private createJsonRpcPattern(
    formUrl: string,
    form: DetectedForm,
    request: NetworkRequest,
    jsonRpc: {
      methodName: string;
      params: Record<string, any>;
      version: '1.0' | '2.0';
      id: any;
    },
    domain: string
  ): LearnedFormPattern {
    // Extract field mapping from params
    const paramsMapping: Record<string, string> = {};
    const fieldMapping: Record<string, string> = {};

    // Try to match form fields to RPC params
    for (const field of form.fields) {
      if (field.type === 'submit' || !field.name) continue;

      const fieldName = field.name;

      // Try exact match first
      if (fieldName in jsonRpc.params) {
        paramsMapping[fieldName] = fieldName;
        fieldMapping[fieldName] = fieldName;
      } else {
        // Try camelCase/snake_case variations
        const camelCase = this.toCamelCase(fieldName);
        const snakeCase = this.toSnakeCase(fieldName);

        if (camelCase in jsonRpc.params) {
          paramsMapping[fieldName] = camelCase;
          fieldMapping[fieldName] = camelCase;
        } else if (snakeCase in jsonRpc.params) {
          paramsMapping[fieldName] = snakeCase;
          fieldMapping[fieldName] = snakeCase;
        } else {
          // Default to 1:1 mapping
          paramsMapping[fieldName] = fieldName;
          fieldMapping[fieldName] = fieldName;
        }
      }
    }

    // Detect CSRF handling
    const csrfHandling = this.detectCsrfHandling(form);

    const pattern: LearnedFormPattern = {
      id: `json-rpc:${domain}:${Date.now()}`,
      domain,
      formUrl,
      apiEndpoint: request.url,
      method: 'POST',
      patternType: 'json-rpc',
      encoding: 'application/json',
      jsonRpcMethod: {
        methodName: jsonRpc.methodName,
        paramsMapping,
        version: jsonRpc.version,
      },
      fieldMapping,
      fileFields: form.fileFields && form.fileFields.length > 0 ? form.fileFields : undefined,
      csrfTokenField: csrfHandling?.fieldName,
      csrfTokenSource: csrfHandling?.source,
      csrfTokenSelector: csrfHandling?.selector,
      requiredFields: form.fields.filter(f => f.required).map(f => f.name),
      successIndicators: {
        statusCodes: [request.status],
      },
      dynamicFields: [], // Will be populated by multi-submission learning
      learnedAt: Date.now(),
      timesUsed: 0,
      successRate: 1.0,
    };

    logger.formLearner.info('Created JSON-RPC pattern', {
      patternId: pattern.id,
      method: jsonRpc.methodName,
      version: jsonRpc.version,
      paramsCount: Object.keys(paramsMapping).length,
    });

    return pattern;
  }

  /**
   * Detect and parse rate limit information from response
   */
  private detectRateLimit(response: Response, domain: string): RateLimitInfo | null {
    // Check for 429 status code
    if (response.status !== 429) {
      // Also check for rate limit headers even on success (to track remaining quota)
      const headers = response.headers;
      const limit = headers.get('x-ratelimit-limit') || headers.get('ratelimit-limit');
      const remaining = headers.get('x-ratelimit-remaining') || headers.get('ratelimit-remaining');
      const reset = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset');

      if (limit || remaining || reset) {
        const existingInfo = this.rateLimits.get(domain) || {
          domain,
          rateLimitCount: 0,
        };

        return {
          ...existingInfo,
          limit: limit ? parseInt(limit, 10) : existingInfo.limit,
          remaining: remaining ? parseInt(remaining, 10) : existingInfo.remaining,
          resetAt: reset ? parseInt(reset, 10) * 1000 : existingInfo.resetAt, // Convert to ms
        };
      }

      return null;
    }

    // We hit a rate limit (429)
    const headers = response.headers;
    const retryAfter = headers.get('retry-after');
    const limit = headers.get('x-ratelimit-limit') || headers.get('ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset');

    let retryAfterSeconds: number | undefined;
    let resetAt: number | undefined;

    // Parse Retry-After header (can be seconds or HTTP date)
    if (retryAfter) {
      if (/^\d+$/.test(retryAfter)) {
        // Retry-After is in seconds
        retryAfterSeconds = parseInt(retryAfter, 10);
        resetAt = Date.now() + (retryAfterSeconds * 1000);
      } else {
        // Retry-After is an HTTP date
        const retryDate = new Date(retryAfter);
        if (!isNaN(retryDate.getTime())) {
          resetAt = retryDate.getTime();
          retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
        }
      }
    }

    // Parse X-RateLimit-Reset header (Unix timestamp)
    if (reset && !resetAt) {
      resetAt = parseInt(reset, 10) * 1000; // Convert to ms
      retryAfterSeconds = Math.ceil((resetAt - Date.now()) / 1000);
    }

    const existingInfo = this.rateLimits.get(domain);

    const rateLimitInfo: RateLimitInfo = {
      domain,
      limit: limit ? parseInt(limit, 10) : existingInfo?.limit,
      remaining: 0, // We're rate limited, so remaining is 0
      resetAt,
      retryAfterSeconds,
      lastRateLimitTime: Date.now(),
      rateLimitCount: (existingInfo?.rateLimitCount || 0) + 1,
    };

    logger.formLearner.warn('Rate limit detected', {
      domain,
      retryAfterSeconds,
      resetAt: resetAt ? new Date(resetAt).toISOString() : undefined,
      rateLimitCount: rateLimitInfo.rateLimitCount,
    });

    return rateLimitInfo;
  }

  /**
   * Check if we should wait before making a request due to rate limiting
   * Returns wait time in milliseconds, or 0 if safe to proceed
   */
  private checkRateLimitWait(domain: string): number {
    const rateLimitInfo = this.rateLimits.get(domain);
    if (!rateLimitInfo) {
      return 0; // No rate limit info, proceed
    }

    // Check if rate limit has expired
    if (rateLimitInfo.resetAt && rateLimitInfo.resetAt > Date.now()) {
      const waitMs = rateLimitInfo.resetAt - Date.now();
      logger.formLearner.info('Rate limit still active, need to wait', {
        domain,
        waitSeconds: Math.ceil(waitMs / 1000),
      });
      return waitMs;
    }

    // Check if we have remaining quota
    if (rateLimitInfo.remaining !== undefined && rateLimitInfo.remaining <= 0) {
      if (rateLimitInfo.resetAt && rateLimitInfo.resetAt > Date.now()) {
        const waitMs = rateLimitInfo.resetAt - Date.now();
        logger.formLearner.info('No remaining quota, need to wait', {
          domain,
          waitSeconds: Math.ceil(waitMs / 1000),
        });
        return waitMs;
      }
    }

    return 0; // Safe to proceed
  }

  /**
   * Retry a request with exponential backoff after rate limit
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    domain: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check if we need to wait due to rate limiting
        const waitMs = this.checkRateLimitWait(domain);
        if (waitMs > 0) {
          const waitSeconds = Math.ceil(waitMs / 1000);
          logger.formLearner.info('Waiting for rate limit to reset', {
            domain,
            waitSeconds,
            attempt: attempt + 1,
          });

          // Cap wait time at 60 seconds for safety
          const cappedWait = Math.min(waitMs, 60000);
          await new Promise(resolve => setTimeout(resolve, cappedWait));
        }

        // Attempt the request
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Check if this is a rate limit error
        if (error.response && error.response.status === 429) {
          const rateLimitInfo = this.detectRateLimit(error.response, domain);
          if (rateLimitInfo) {
            this.rateLimits.set(domain, rateLimitInfo);
          }

          // Calculate backoff time (exponential: 2^attempt seconds, max 60s)
          const backoffSeconds = Math.min(Math.pow(2, attempt), 60);

          if (attempt < maxRetries) {
            logger.formLearner.info('Rate limit hit, retrying with backoff', {
              domain,
              attempt: attempt + 1,
              maxRetries,
              backoffSeconds,
            });

            await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
            continue;
          }
        }

        // Not a rate limit error, or max retries exceeded
        throw error;
      }
    }

    // Max retries exceeded
    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Update rate limit info after a successful or failed request
   */
  private updateRateLimitInfo(response: Response, domain: string): void {
    const rateLimitInfo = this.detectRateLimit(response, domain);
    if (rateLimitInfo) {
      this.rateLimits.set(domain, rateLimitInfo);

      // Log if we're getting close to the limit
      if (rateLimitInfo.remaining !== undefined && rateLimitInfo.limit !== undefined) {
        const percentRemaining = (rateLimitInfo.remaining / rateLimitInfo.limit) * 100;
        if (percentRemaining < 20) {
          logger.formLearner.warn('Approaching rate limit', {
            domain,
            remaining: rateLimitInfo.remaining,
            limit: rateLimitInfo.limit,
            percentRemaining: percentRemaining.toFixed(1),
          });
        }
      }
    }
  }

  /**
   * Detect OAuth authorization redirect from URL
   */
  private detectOAuthRedirect(url: string): OAuthFlowInfo | null {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    // Check for OAuth 2.0 authorization parameters
    const hasClientId = params.has('client_id');
    const hasRedirectUri = params.has('redirect_uri');
    const hasResponseType = params.has('response_type');

    if (!hasClientId || !hasResponseType) {
      return null; // Not an OAuth redirect
    }

    const responseType = params.get('response_type') || '';
    const clientId = params.get('client_id') || '';
    const redirectUri = params.get('redirect_uri') || '';
    const scope = params.get('scope') || '';
    const state = params.get('state') || undefined;
    const codeChallenge = params.get('code_challenge') || undefined;
    const codeChallengeMethod = params.get('code_challenge_method') as 'S256' | 'plain' | undefined;

    // Determine flow type
    let flowType: 'authorization_code' | 'implicit' | 'pkce' = 'authorization_code';
    if (codeChallenge) {
      flowType = 'pkce';
    } else if (responseType.includes('token')) {
      flowType = 'implicit';
    }

    logger.formLearner.info('Detected OAuth authorization redirect', {
      authEndpoint: urlObj.origin + urlObj.pathname,
      clientId,
      flowType,
      scopes: scope.split(' '),
    });

    return {
      flowType,
      authEndpoint: urlObj.origin + urlObj.pathname,
      clientId,
      redirectUri,
      scopes: scope ? scope.split(' ') : [],
      state,
      codeChallenge,
      codeChallengeMethod,
      responseType,
    };
  }
}
