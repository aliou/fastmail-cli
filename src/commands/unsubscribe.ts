/**
 * Newsletter unsubscribe command handlers.
 */

import { exec } from "node:child_process";
import { platform } from "node:os";
import { createInterface } from "node:readline/promises";
import {
  getBoolean,
  getNumber,
  getPositional,
  getString,
  parseArgs,
  wantsHelp,
} from "../args.ts";
import { getClient } from "../client.ts";
import { runtimeError, usageError } from "../error.ts";
import type { JmapClient } from "../jmap/client.ts";
import {
  type Email,
  type EmailFilter,
  type EmailHeader,
  getEmails,
  queryEmails,
} from "../jmap/email.ts";
import { JMAP_MAIL_CAPABILITY } from "../jmap/types.ts";
import { resolveMailboxId } from "../mailbox-resolver.ts";

/** Common options for unsubscribe commands */
const UNSUBSCRIBE_OPTIONS = {
  mailbox: { type: "string" as const },
  limit: { type: "string" as const },
  query: { type: "string" as const },
  from: { type: "string" as const },
  open: { type: "boolean" as const },
  json: { type: "boolean" as const },
  interactive: { type: "boolean" as const, short: "i" },
};

/**
 * Unsubscribe method types.
 */
interface UnsubscribeMethod {
  type: "mailto" | "http" | "https";
  url: string;
  oneClick?: boolean; // RFC 8058 one-click support
}

/**
 * Parse List-Unsubscribe header.
 */
function parseListUnsubscribe(headers: EmailHeader[]): UnsubscribeMethod[] {
  const unsubHeader = headers.find(
    (h) => h.name.toLowerCase() === "list-unsubscribe",
  );

  if (!unsubHeader) {
    return [];
  }

  const postHeader = headers.find(
    (h) => h.name.toLowerCase() === "list-unsubscribe-post",
  );
  const hasOneClick = postHeader?.value.toLowerCase().includes("one-click");

  // Parse <url>, <url> format
  const urlPattern = /<([^>]+)>/g;
  const methods: UnsubscribeMethod[] = [];

  for (const match of unsubHeader.value.matchAll(urlPattern)) {
    const url = match[1];
    if (!url) continue;

    let type: "mailto" | "http" | "https";

    if (url.startsWith("mailto:")) {
      type = "mailto";
    } else if (url.startsWith("https:")) {
      type = "https";
    } else if (url.startsWith("http:")) {
      type = "http";
    } else {
      continue; // Unknown protocol
    }

    const method: UnsubscribeMethod = { type, url };
    if (type === "https" && hasOneClick) {
      method.oneClick = true;
    }
    methods.push(method);
  }

  return methods;
}

/**
 * Execute unsubscribe via HTTP(S).
 */
async function unsubscribeHttp(url: string, oneClick: boolean): Promise<void> {
  if (oneClick) {
    // RFC 8058 one-click: POST with List-Unsubscribe=One-Click
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "List-Unsubscribe=One-Click",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } else {
    // Regular HTTP unsubscribe - open in browser
    const os = platform();
    let command: string;

    switch (os) {
      case "darwin":
        command = `open "${url}"`;
        break;
      case "win32":
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
    }

    return new Promise((resolve, reject) => {
      exec(command, (error) => {
        if (error) {
          reject(new Error(`Failed to open browser: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Execute unsubscribe via mailto.
 */
async function unsubscribeMailto(
  client: JmapClient,
  mailtoUrl: string,
): Promise<void> {
  // Parse mailto:email@example.com?subject=Unsubscribe&body=Please+remove
  const url = new URL(mailtoUrl);
  const to = url.pathname; // email address
  const subject = url.searchParams.get("subject") || "Unsubscribe";
  const body = url.searchParams.get("body") || "Please unsubscribe me.";

  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  // Get identity
  const identityResponse = await client.call<{
    list: Array<{ id: string; email: string; name?: string }>;
  }>([JMAP_MAIL_CAPABILITY], "Identity/get", {
    accountId,
  });

  if (identityResponse.list.length === 0) {
    throw new Error("No identities found");
  }

  const identity = identityResponse.list[0];
  if (!identity) {
    throw new Error("No identities found");
  }

  // Build email object
  const emailToCreate = {
    mailboxIds: {},
    keywords: { $draft: true },
    from: [{ email: identity.email, name: identity.name }],
    to: [{ email: to }],
    subject,
    bodyValues: {
      body: {
        value: decodeURIComponent(body),
      },
    },
    textBody: [
      {
        partId: "body",
        type: "text/plain",
      },
    ],
  };

  // Create draft email
  const emailSet = await client.call<{
    created?: Record<string, Email>;
    notCreated?: Record<string, { type: string; description?: string }>;
  }>([JMAP_MAIL_CAPABILITY], "Email/set", {
    accountId,
    create: {
      draft: emailToCreate,
    },
  });

  const createdEmail = emailSet.created?.draft;
  if (!createdEmail) {
    const error = emailSet.notCreated?.draft;
    throw new Error(
      `Failed to create email: ${error?.description ?? "Unknown error"}`,
    );
  }

  // Submit for sending
  const submissionSet = await client.call<{
    created?: Record<string, unknown>;
    notCreated?: Record<string, { type: string; description?: string }>;
  }>([JMAP_MAIL_CAPABILITY], "EmailSubmission/set", {
    accountId,
    create: {
      send: {
        identityId: identity.id,
        emailId: createdEmail.id,
      },
    },
    onSuccessDestroyEmail: [createdEmail.id],
  });

  const created = submissionSet.created?.send;
  if (!created) {
    const error = submissionSet.notCreated?.send;
    throw new Error(
      `Failed to send email: ${error?.description ?? "Unknown error"}`,
    );
  }
}

/**
 * Show unsubscribe methods for an email.
 */
export async function showUnsubscribe(args: string[]): Promise<void> {
  const parsed = parseArgs(args, UNSUBSCRIBE_OPTIONS, [1, 1]);
  if (!wantsHelp(parsed) && !getPositional(parsed, 0))
    throw usageError("Email ID required");

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail unsubscribe show <emailId>

Show unsubscribe methods for an email.

Options:
  -h, --help    Show this help
`);
    return;
  }

  const emailId = getPositional(parsed, 0);

  if (!emailId) throw usageError("Email ID required");

  const client = await getClient();

  // Get email with headers
  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "subject", "from", "headers"],
  });

  if (result.notFound.includes(emailId))
    throw runtimeError(`Email not found: ${emailId}`);

  const email = result.list[0];
  if (!email?.headers) throw runtimeError("No headers found");

  const methods = parseListUnsubscribe(email.headers);

  if (methods.length === 0) {
    console.log(
      JSON.stringify({
        hasUnsubscribe: false,
        message: "No List-Unsubscribe header found",
      }),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        hasUnsubscribe: true,
        emailId: email.id,
        subject: email.subject,
        from: email.from,
        methods,
      },
      null,
      2,
    ),
  );
}

/**
 * Execute unsubscribe for an email.
 */
export async function executeUnsubscribe(args: string[]): Promise<void> {
  const parsed = parseArgs(
    args,
    {
      ...UNSUBSCRIBE_OPTIONS,
      method: { type: "string" as const },
      auto: { type: "boolean" as const },
    },
    [1, 1],
  );
  if (!wantsHelp(parsed)) {
    if (!getPositional(parsed, 0)) throw usageError("Email ID required");
    if (args.includes("-i"))
      console.error("fastmail: -i is deprecated; use --interactive instead");
    if (!getBoolean(parsed, "auto") && !process.stdin.isTTY) {
      throw usageError(
        "Confirmation requires a TTY; use --auto for non-interactive execution",
      );
    }
  }

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail unsubscribe execute <emailId> [options]

Execute unsubscribe for an email.

Options:
  --method <type>   Prefer method type (http|mailto, default: https)
  --auto            Don't prompt for confirmation
  -h, --help        Show this help
`);
    return;
  }

  const emailId = getPositional(parsed, 0);

  if (!emailId) throw usageError("Email ID required");

  const client = await getClient();

  // Get email with headers
  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "subject", "from", "headers"],
  });

  if (result.notFound.includes(emailId))
    throw runtimeError(`Email not found: ${emailId}`);

  const email = result.list[0];
  if (!email?.headers) throw runtimeError("No headers found");

  const methods = parseListUnsubscribe(email.headers);

  if (methods.length === 0) throw runtimeError("No unsubscribe methods found");

  // Select method
  const preferMethod = getString(parsed, "method") ?? "https";
  let selected = methods.find((m) => m.type === preferMethod);

  if (!selected) {
    selected = methods[0]; // Fallback to first method
  }

  if (!getBoolean(parsed, "auto") && selected) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    const answer = await prompt.question(
      `Unsubscribe via ${selected.type}: ${selected.url}? [y/N] `,
    );
    prompt.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.error("Unsubscribe cancelled");
      return;
    }
  }

  if (!selected) throw runtimeError("No unsubscribe method selected");
  try {
    if (selected.type === "mailto")
      await unsubscribeMailto(client, selected.url);
    else await unsubscribeHttp(selected.url, selected.oneClick ?? false);
    const message =
      selected.type === "mailto"
        ? "Unsubscribe email sent"
        : selected.oneClick
          ? "Unsubscribed via one-click"
          : "Opened unsubscribe page in browser";
    if (getBoolean(parsed, "json")) {
      console.log(
        JSON.stringify(
          { emailId, method: selected.type, status: "unsubscribed" },
          null,
          2,
        ),
      );
    } else {
      console.error(message);
    }
  } catch (error) {
    throw runtimeError(
      `Unsubscribe failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Batch unsubscribe from newsletters.
 */
export async function batchUnsubscribe(args: string[]): Promise<void> {
  const parsed = parseArgs(
    args,
    {
      ...UNSUBSCRIBE_OPTIONS,
      "dry-run": { type: "boolean" as const },
      "one-click-only": { type: "boolean" as const },
    },
    [0, 0],
  );

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail unsubscribe batch [options]

Batch unsubscribe from newsletters.

Options:
  --query <text>      Search query for newsletters
  --mailbox <name>    Mailbox to process
  --limit <n>         Max emails to process (default: 50)
  --dry-run           Show what would be unsubscribed
  --one-click-only    Only unsubscribe if one-click available
  -h, --help          Show this help

Examples:
  fastmail unsubscribe batch --query "from:newsletter"
  fastmail unsubscribe batch --mailbox Newsletters --one-click-only
`);
    return;
  }

  const limit = getNumber(parsed, "limit") ?? 50;
  const client = await getClient();

  // Query emails
  const filter: EmailFilter = {};

  const query = getString(parsed, "query");
  if (query) {
    filter.text = query;
  }

  const mailbox = getString(parsed, "mailbox");
  if (mailbox) {
    const mailboxId = await resolveMailboxId(client, mailbox);
    filter.inMailbox = mailboxId;
  }

  const queryResult = await queryEmails(client, { filter, limit });

  if (queryResult.ids.length === 0) {
    if (getBoolean(parsed, "json"))
      console.log(JSON.stringify({ total: 0, results: [] }));
    else console.error("No emails found");
    return;
  }

  // Get emails with headers
  const getResult = await getEmails(client, {
    ids: queryResult.ids,
    properties: ["id", "subject", "from", "headers"],
  });

  const results: Array<{
    emailId: string;
    subject: string;
    status: "unsubscribed" | "skipped" | "failed";
    reason?: string;
  }> = [];

  for (const email of getResult.list) {
    if (!email.headers) {
      results.push({
        emailId: email.id,
        subject: email.subject ?? "(no subject)",
        status: "skipped",
        reason: "No headers",
      });
      continue;
    }

    const methods = parseListUnsubscribe(email.headers);

    if (methods.length === 0) {
      results.push({
        emailId: email.id,
        subject: email.subject ?? "(no subject)",
        status: "skipped",
        reason: "No unsubscribe method",
      });
      continue;
    }

    // Prefer one-click if available
    let method = methods.find((m) => m.oneClick);

    if (!method) {
      if (getBoolean(parsed, "one-click-only")) {
        results.push({
          emailId: email.id,
          subject: email.subject ?? "(no subject)",
          status: "skipped",
          reason: "No one-click method",
        });
        continue;
      }
      method = methods.find((m) => m.type === "https") ?? methods[0];
    }

    if (getBoolean(parsed, "dry-run")) {
      results.push({
        emailId: email.id,
        subject: email.subject ?? "(no subject)",
        status: "skipped",
        reason: "Dry run",
      });
      continue;
    }

    // Execute unsubscribe
    try {
      if (method?.type === "mailto") {
        await unsubscribeMailto(client, method.url);
      } else if (method) {
        await unsubscribeHttp(method.url, method.oneClick ?? false);
      }

      results.push({
        emailId: email.id,
        subject: email.subject ?? "(no subject)",
        status: "unsubscribed",
      });
    } catch (error) {
      results.push({
        emailId: email.id,
        subject: email.subject ?? "(no subject)",
        status: "failed",
        reason: String(error),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        total: queryResult.ids.length,
        results,
      },
      null,
      2,
    ),
  );
}
