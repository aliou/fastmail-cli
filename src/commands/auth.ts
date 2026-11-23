import { readFile } from "node:fs/promises";
import { getBoolean, getString, parseArgs, wantsHelp } from "../args.ts";
import {
  getAuthStatus,
  login,
  logout,
  promptForToken,
  readTokenFromStdin,
} from "../auth.ts";
import { getConfigPath } from "../config.ts";
import { runtimeError, usageError } from "../error.ts";

const options = {
  token: { type: "string" as const },
  "token-file": { type: "string" as const },
  json: { type: "boolean" as const },
};

export async function loginCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args, options);
  if (wantsHelp(parsed)) {
    console.log(`Examples:
  fastmail auth login --token-file ./token
  fastmail auth login --token-file - < ./token

Usage: fastmail auth login [--token-file <path>]

Options:
  --token-file <path>  Read API token from a file, or - for stdin
  --token <token>      API token (deprecated)
  -h, --help           Show this help`);
    return;
  }
  if (parsed.positionals.length > 0)
    throw usageError("auth login accepts no positional arguments");

  const tokenFile = getString(parsed, "token-file");
  let token = getString(parsed, "token");
  if (token !== undefined) {
    console.error(
      "fastmail: --token is deprecated; use --token-file or stdin instead",
    );
  }
  if (token && tokenFile)
    throw usageError("Use only one of --token and --token-file");
  if (tokenFile === "-") token = (await readTokenFromStdin()) ?? undefined;
  else if (tokenFile) token = (await readFile(tokenFile, "utf8")).trim();
  else if (!token && !process.stdin.isTTY)
    token = (await readTokenFromStdin()) ?? undefined;
  else if (!token && process.stdin.isTTY) token = await promptForToken();
  if (!token) {
    throw usageError(
      "No API token provided; use --token-file <path>, --token-file -, or pipe a token on stdin",
    );
  }

  console.error("Validating token...");
  const result = await login(token);
  if (!result.success)
    throw runtimeError(`Login failed: ${result.error ?? "Unknown error"}`);
  console.error(`Authenticated as: ${result.username}`);
  if (result.accountName)
    console.error(`Primary account: ${result.accountName}`);
  console.error(`Token saved to: ${getConfigPath()}`);
  if (getBoolean(parsed, "json")) {
    console.log(
      JSON.stringify(
        {
          authenticated: true,
          username: result.username,
          accountName: result.accountName,
        },
        null,
        2,
      ),
    );
  }
}

export async function logoutCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args, options);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail auth logout\n\nUsage: fastmail auth logout [--json]\n\nOptions:\n  --json       Output JSON\n  -h, --help   Show this help`,
    );
    return;
  }
  if (parsed.positionals.length > 0)
    throw usageError("auth logout accepts no positional arguments");
  await logout();
  if (getBoolean(parsed, "json"))
    console.log(JSON.stringify({ authenticated: false }));
  else console.error("Logged out. Token removed from config.");
}

export async function statusCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args, options);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail auth status --json\n\nUsage: fastmail auth status [--json]\n\nOptions:\n  --json       Output JSON\n  -h, --help   Show this help`,
    );
    return;
  }
  if (parsed.positionals.length > 0)
    throw usageError("auth status accepts no positional arguments");
  const status = await getAuthStatus();
  if (getBoolean(parsed, "json")) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(
      `Status: ${status.authenticated ? "Authenticated" : "Not authenticated"}`,
    );
    if (status.username) console.log(`User: ${status.username}`);
    if (status.accountName) console.log(`Account: ${status.accountName}`);
    if (status.error) console.log(`Reason: ${status.error}`);
    if (status.tokenSource)
      console.log(
        `Token source: ${status.tokenSource === "env" ? "FASTMAIL_API_TOKEN env var" : "config file"}`,
      );
  }
  if (!status.authenticated) throw runtimeError("Not authenticated");
}
