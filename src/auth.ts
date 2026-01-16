/**
 * Authentication utilities for fastmail-cli.
 * Handles token storage, validation, and auth status.
 */

import {
  checkConfigPermissions,
  loadConfig,
  saveConfig,
  updateConfig,
} from "./config.ts";
import { JMAP_SESSION_URL } from "./constants.ts";
import type { JmapSession } from "./jmap/types.ts";

export interface AuthStatus {
  authenticated: boolean;
  username?: string;
  primaryAccountId?: string;
  accountName?: string;
  tokenSource?: "env" | "config";
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
 */
export async function fetchSession(token: string): Promise<JmapSession> {
  const response = await fetch(JMAP_SESSION_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
    await fetchSession(token);
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
    const session = await fetchSession(token);
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

  if (!token) {
    return {
      authenticated: false,
      error: "No API token configured",
    };
  }

  const tokenSource = envToken ? "env" : "config";

  try {
    const session = await fetchSession(token);
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
