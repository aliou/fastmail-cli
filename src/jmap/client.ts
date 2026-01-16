/**
 * JMAP client for FastMail API.
 * Handles session discovery, request batching, and response parsing.
 */

import { JMAP_SESSION_URL } from "../constants.ts";
import {
  JMAP_CORE_CAPABILITY,
  type JmapRequest,
  type JmapResponse,
  type JmapSession,
  type MethodInvocation,
  type MethodResponse,
} from "./types.ts";

export class JmapError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "JmapError";
  }
}

export class JmapMethodError extends Error {
  constructor(
    message: string,
    public readonly type: string,
    public readonly callId: string,
  ) {
    super(message);
    this.name = "JmapMethodError";
  }
}

interface JmapClientOptions {
  token: string;
  sessionUrl?: string;
}

let callIdCounter = 0;

function generateCallId(): string {
  callIdCounter += 1;
  return `c${callIdCounter}`;
}

export class JmapClient {
  private token: string;
  private sessionUrl: string;
  private session: JmapSession | null = null;

  constructor(options: JmapClientOptions) {
    this.token = options.token;
    this.sessionUrl = options.sessionUrl ?? JMAP_SESSION_URL;
  }

  /**
   * Fetch the JMAP session.
   * Caches the session and returns cached version if available.
   */
  async getSession(): Promise<JmapSession> {
    if (this.session) {
      return this.session;
    }

    const response = await fetch(this.sessionUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new JmapError(
        `Failed to fetch session: ${response.statusText}`,
        "sessionError",
        response.status,
      );
    }

    this.session = (await response.json()) as JmapSession;
    return this.session;
  }

  /**
   * Get the primary account ID for a capability.
   */
  async getPrimaryAccountId(capability: string): Promise<string> {
    const session = await this.getSession();
    const accountId = session.primaryAccounts[capability];
    if (!accountId) {
      throw new JmapError(
        `No primary account for capability: ${capability}`,
        "unknownCapability",
      );
    }
    return accountId;
  }

  /**
   * Invalidate the cached session.
   * Call this when you receive a different sessionState in a response.
   */
  invalidateSession(): void {
    this.session = null;
  }

  /**
   * Get the API token.
   * Used for blob download/upload operations.
   */
  getToken(): string {
    return this.token;
  }

  /**
   * Make a JMAP API request with multiple method calls.
   */
  async request(
    using: string[],
    methodCalls: MethodInvocation[],
  ): Promise<JmapResponse> {
    const session = await this.getSession();

    // Always include core capability (required by FastMail)
    const capabilities = using.includes(JMAP_CORE_CAPABILITY)
      ? using
      : [JMAP_CORE_CAPABILITY, ...using];

    const request: JmapRequest = {
      using: capabilities,
      methodCalls,
    };

    const response = await fetch(session.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorType = "requestError";
      let errorDetail = response.statusText;

      try {
        const parsed = JSON.parse(errorBody);
        errorType = parsed.type ?? errorType;
        errorDetail = parsed.detail ?? errorDetail;
      } catch {
        // Use default error message
      }

      throw new JmapError(errorDetail, errorType, response.status);
    }

    const jmapResponse = (await response.json()) as JmapResponse;

    // Check if session state changed
    if (this.session && jmapResponse.sessionState !== this.session.state) {
      this.invalidateSession();
    }

    return jmapResponse;
  }

  /**
   * Make a single method call and return its response.
   * Throws if the method returns an error.
   */
  async call<T extends Record<string, unknown>>(
    using: string[],
    methodName: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const callId = generateCallId();
    const response = await this.request(using, [[methodName, args, callId]]);

    const methodResponse = response.methodResponses.find(
      ([, , id]) => id === callId,
    );
    if (!methodResponse) {
      throw new JmapError(
        `No response for call ID: ${callId}`,
        "missingResponse",
      );
    }

    const [responseName, result] = methodResponse;

    // Check for method-level error
    if (responseName === "error") {
      const errorResult = result as { type: string; description?: string };
      throw new JmapMethodError(
        errorResult.description ?? `JMAP error: ${errorResult.type}`,
        errorResult.type,
        callId,
      );
    }

    return result as T;
  }
}

/**
 * Extract a specific method response from a JMAP response by call ID.
 */
export function getMethodResponse(
  response: JmapResponse,
  callId: string,
): MethodResponse | undefined {
  return response.methodResponses.find(([, , id]) => id === callId);
}

/**
 * Check if a method response is an error.
 */
export function isMethodError(methodResponse: MethodResponse): boolean {
  return methodResponse[0] === "error";
}
