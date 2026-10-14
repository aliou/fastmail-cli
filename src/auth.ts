/**
 * Authentication utilities for fastmail-cli.
 * Handles token storage, validation, and auth status.
 */

import {
  checkConfigPermissions,
  getProxyUrl,
  loadConfig,
  saveConfig,
  updateConfig,
} from "./config.ts";
import { JMAP_SESSION_URL } from "./constants.ts";
import { applyProxy, authHeaders, JmapClient } from "./jmap/client.ts";
import type { JmapSession } from "./jmap/types.ts";

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
  primaryAccountId?: string;
  accountName?: string;
  tokenSource?: "env" | "config" | "proxy";
  error?: string;
}

export interface LoginResult {
  success: boolean;
  username?: string;
  primaryAccountId?: string;
  accountName?: string;
  error?: string;
}

/**
 * Fetch JMAP session to validate token.
 * Returns session on success, throws on failure.
 * When proxyUrl is given, the session request goes through that proxy.
 * The token may be omitted when the proxy injects its own credentials.
 */
export async function fetchSession(
  token?: string,
  proxyUrl?: string,
): Promise<JmapSession> {
  const response = await fetch(applyProxy(JMAP_SESSION_URL, proxyUrl), {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid API token");
    }
    throw new Error(`Failed to authenticate: ${response.statusText}`);
  }

  return (await response.json()) as JmapSession;
}

/**
 * Validate a token by attempting to fetch the session.
 * Returns true if valid, false otherwise.
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    await fetchSession(token, await getProxyUrl());
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the primary mail account from a session.
 */
function getPrimaryMailAccount(session: JmapSession): {
  accountId: string;
  accountName: string;
} | null {
  const mailCapability = "urn:ietf:params:jmap:mail";
  const accountId = session.primaryAccounts[mailCapability];

  if (!accountId) {
    return null;
  }

  const account = session.accounts[accountId];
  return {
    accountId,
    accountName: account?.name ?? accountId,
  };
}

/**
 * Perform login: validate token and store in config.
 */
export async function login(token: string): Promise<LoginResult> {
  try {
    const session = await fetchSession(token, await getProxyUrl());
    const primaryAccount = getPrimaryMailAccount(session);

    // Store token in config
    await updateConfig({
      apiToken: token,
      defaultAccountId: primaryAccount?.accountId,
    });

    return {
      success: true,
      username: session.username,
      primaryAccountId: primaryAccount?.accountId,
      accountName: primaryAccount?.accountName,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Perform logout: remove token from config.
 */
export async function logout(): Promise<void> {
  const config = await loadConfig();
  delete config.apiToken;
  delete config.defaultAccountId;
  await saveConfig(config);
}

/**
 * Check current authentication status.
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  // Check permissions first
  await checkConfigPermissions();

  // Get token (env or config)
  const envToken = process.env.FASTMAIL_API_TOKEN;
  const config = await loadConfig();
  const token = envToken ?? config.apiToken;
  const proxyUrl = await getProxyUrl();

  // A proxy that injects its own credentials makes the token optional
  if (!token && !proxyUrl) {
    return {
      authenticated: false,
      error: "No API token configured",
    };
  }

  const tokenSource = envToken ? "env" : token ? "config" : "proxy";

  try {
    const session = await fetchSession(token, proxyUrl);
    const primaryAccount = getPrimaryMailAccount(session);

    return {
      authenticated: true,
      username: session.username,
      primaryAccountId: primaryAccount?.accountId,
      accountName: primaryAccount?.accountName,
      tokenSource,
    };
  } catch (error) {
    return {
      authenticated: false,
      tokenSource,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Read token from stdin (for piping).
 */
export async function readTokenFromStdin(): Promise<string | null> {
  // Check if stdin is a TTY (interactive) - if so, don't read from it
  if (process.stdin.isTTY) {
    return null;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString("utf-8").trim();
    return input || null;
  } catch {
    return null;
  }
}

/**
 * Prompt for token interactively.
 */
export async function promptForToken(): Promise<string> {
  process.stdout.write("Enter API token: ");

  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
      if (input.includes("\n")) {
        process.stdin.pause();
        resolve(input.trim());
      }
    });
    process.stdin.resume();
  });
}

/**
 * Create an authenticated JMAP client for command handlers.
 *
 * Resolves the token (env var > config file) and the optional proxy base URL
 * (FASTMAIL_PROXY_URL env var > config file). The token is optional when a
 * proxy is configured, since the proxy may inject its own credentials.
 * Exits with an error message if neither is configured.
 */
export async function createClient(): Promise<JmapClient> {
  const config = await loadConfig();
  const token = process.env.FASTMAIL_API_TOKEN ?? config.apiToken;
  const proxyUrl = await getProxyUrl();

  if (!token && !proxyUrl) {
    console.error(
      "Error: Not authenticated. Run 'fastmail auth login', set FASTMAIL_API_TOKEN, or set FASTMAIL_PROXY_URL",
    );
    process.exit(1);
  }

  return new JmapClient({ token, proxyUrl });
}
