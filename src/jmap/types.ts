/**
 * JMAP protocol types.
 * Based on RFC 8620 (JMAP Core) and RFC 8621 (JMAP Mail).
 */

// Account information from session
export interface JmapAccount {
  name: string;
  isPersonal: boolean;
  isReadOnly: boolean;
  accountCapabilities: Record<string, unknown>;
}

// Session response from /jmap/session endpoint
export interface JmapSession {
  username: string;
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl: string;
  state: string;
  accounts: Record<string, JmapAccount>;
  primaryAccounts: Record<string, string>;
  capabilities: Record<string, unknown>;
}

// Method invocation: [methodName, arguments, callId]
export type MethodInvocation = [string, Record<string, unknown>, string];

// Method response: [methodName, result, callId]
export type MethodResponse = [string, Record<string, unknown>, string];

// JMAP request body
export interface JmapRequest {
  using: string[];
  methodCalls: MethodInvocation[];
}

// JMAP response body
export interface JmapResponse {
  methodResponses: MethodResponse[];
  sessionState: string;
}

// JMAP error response
export interface JmapErrorResponse {
  type: string;
  status?: number;
  detail?: string;
}

// JMAP method-level error
export interface JmapMethodError {
  type: string;
  description?: string;
}

// Common JMAP capabilities
export const JMAP_CORE_CAPABILITY = "urn:ietf:params:jmap:core";
export const JMAP_MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
export const JMAP_SUBMISSION_CAPABILITY = "urn:ietf:params:jmap:submission";
export const MASKED_EMAIL_CAPABILITY =
  "https://www.fastmail.com/dev/maskedemail";
