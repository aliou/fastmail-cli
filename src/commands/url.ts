/**
 * URL command handlers.
 * Generate FastMail web URLs for emails, threads, mailboxes.
 */

import { exec } from "node:child_process";
import { platform } from "node:os";
import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import { JmapClient } from "../jmap/client.ts";
import { getEmails } from "../jmap/email.ts";
import { JMAP_MAIL_CAPABILITY } from "../jmap/types.ts";

const FASTMAIL_WEB_BASE = "https://app.fastmail.com";

/**
 * Get authenticated JMAP client.
 */
async function getClient(): Promise<JmapClient> {
  const envToken = process.env.FASTMAIL_API_TOKEN;
  const config = await loadConfig();
  const token = envToken ?? config.apiToken;

  if (!token) {
    throw new Error(
      "Not authenticated. Run 'fastmail auth login' or set FASTMAIL_API_TOKEN",
    );
  }

  return new JmapClient({ token });
}

/**
 * Resolve mailbox name to ID.
 */
async function resolveMailboxId(
  client: JmapClient,
  nameOrId: string,
): Promise<string> {
  // If it looks like an ID (contains special chars), use it directly
  if (nameOrId.includes("~") || nameOrId.includes("/")) {
    return nameOrId;
  }

  // Otherwise, query mailboxes to find by name
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);
  const response = await client.call<{
    accountId: string;
    state: string;
    list: Array<{ id: string; name: string; role?: string }>;
  }>([JMAP_MAIL_CAPABILITY], "Mailbox/get", {
    accountId,
  });

  // Try exact name match first
  let mailbox = response.list.find(
    (mb) => mb.name.toLowerCase() === nameOrId.toLowerCase(),
  );

  // If no exact match, try role match (e.g., "inbox" -> role "inbox")
  if (!mailbox) {
    mailbox = response.list.find(
      (mb) => mb.role?.toLowerCase() === nameOrId.toLowerCase(),
    );
  }

  if (!mailbox) {
    throw new Error(`Mailbox not found: ${nameOrId}`);
  }

  return mailbox.id;
}

/**
 * Open URL in default browser.
 */
function openInBrowser(url: string): void {
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
      // Linux and others
      command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
    }
  });
}

/**
 * Get URL for an email.
 */
export function getEmailUrl(mailboxId: string, emailId: string): string {
  return `${FASTMAIL_WEB_BASE}/mail/${mailboxId}/${emailId}`;
}

/**
 * Get URL for a mailbox.
 */
export function getMailboxUrl(mailboxId: string): string {
  return `${FASTMAIL_WEB_BASE}/mail/${mailboxId}/`;
}

/**
 * Get URL for search.
 */
export function getSearchUrl(query: string): string {
  return `${FASTMAIL_WEB_BASE}/mail/search:${encodeURIComponent(query)}`;
}

/**
 * Get URL for compose.
 */
export function getComposeUrl(options?: {
  to?: string;
  subject?: string;
  body?: string;
}): string {
  let url = `${FASTMAIL_WEB_BASE}/mail/compose`;
  if (options) {
    const params = new URLSearchParams();
    if (options.to) params.set("to", options.to);
    if (options.subject) params.set("subject", options.subject);
    if (options.body) params.set("body", options.body);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

function printHelp(): void {
  console.log(`
Usage: fastmail url <subcommand> [options]

Generate FastMail web URLs.

Subcommands:
  email <id>...     Generate URL(s) for email(s)
  mailbox <name>    Generate URL for a mailbox
  search <query>    Generate search URL
  compose           Generate compose URL

Options:
  --open            Open URL(s) in browser
  -h, --help        Show this help

Compose options:
  --to <addr>       Pre-fill recipient
  --subject <s>     Pre-fill subject
  --body <text>     Pre-fill body

Examples:
  fastmail url email EMAIL_ID
  fastmail url email EMAIL_ID1 EMAIL_ID2 --open
  fastmail url mailbox Inbox
  fastmail url search "from:alice"
  fastmail url compose --to bob@example.com --subject "Hello"
`);
}

/**
 * Generate URL for email(s).
 */
export async function urlEmail(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      open: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: fastmail url email <id>... [--open]

Generate FastMail web URL(s) for email(s).

Arguments:
  <id>...     Email ID(s)

Options:
  --open      Open URL(s) in browser
  -h, --help  Show this help
`);
    return;
  }

  if (positionals.length === 0) {
    console.error("Error: Email ID(s) required");
    console.error("Usage: fastmail url email <id>...");
    process.exit(1);
  }

  const client = await getClient();

  // Get emails to find their mailboxIds
  const result = await getEmails(client, {
    ids: positionals,
    properties: ["id", "mailboxIds"],
  });

  const urls: string[] = [];

  for (const email of result.list) {
    const mailboxId = Object.keys(email.mailboxIds)[0];
    if (mailboxId) {
      urls.push(getEmailUrl(mailboxId, email.id));
    }
  }

  // Report not found
  for (const id of result.notFound) {
    console.error(`Email not found: ${id}`);
  }

  if (urls.length === 0) {
    console.error("No URLs generated");
    process.exit(1);
  }

  for (const url of urls) {
    console.log(url);
  }

  if (values.open) {
    for (const url of urls) {
      openInBrowser(url);
    }
  }
}

/**
 * Generate URL for a mailbox.
 */
export async function urlMailbox(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      open: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: fastmail url mailbox <name> [--open]

Generate FastMail web URL for a mailbox.

Arguments:
  <name>      Mailbox name or ID

Options:
  --open      Open URL in browser
  -h, --help  Show this help
`);
    return;
  }

  const nameOrId = positionals[0];
  if (!nameOrId) {
    console.error("Error: Mailbox name or ID required");
    console.error("Usage: fastmail url mailbox <name>");
    process.exit(1);
  }

  const client = await getClient();
  const mailboxId = await resolveMailboxId(client, nameOrId);
  const url = getMailboxUrl(mailboxId);

  console.log(url);

  if (values.open) {
    openInBrowser(url);
  }
}

/**
 * Generate search URL.
 */
export async function urlSearch(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      open: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: fastmail url search <query> [--open]

Generate FastMail web URL for a search.

Arguments:
  <query>     Search query

Options:
  --open      Open URL in browser
  -h, --help  Show this help
`);
    return;
  }

  const query = positionals[0];
  if (!query) {
    console.error("Error: Search query required");
    console.error("Usage: fastmail url search <query>");
    process.exit(1);
  }

  const url = getSearchUrl(query);

  console.log(url);

  if (values.open) {
    openInBrowser(url);
  }
}

/**
 * Generate compose URL.
 */
export async function urlCompose(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      to: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
      open: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(`
Usage: fastmail url compose [options]

Generate FastMail web URL for composing an email.

Options:
  --to <addr>      Pre-fill recipient
  --subject <s>    Pre-fill subject
  --body <text>    Pre-fill body
  --open           Open URL in browser
  -h, --help       Show this help
`);
    return;
  }

  const url = getComposeUrl({
    to: values.to,
    subject: values.subject,
    body: values.body,
  });

  console.log(url);

  if (values.open) {
    openInBrowser(url);
  }
}

/**
 * Main URL command router.
 */
export async function urlCommand(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  if (!subcommand) {
    // Check for --help flag in args
    const { values } = parseArgs({
      args,
      options: {
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
      strict: false,
    });

    if (values.help) {
      printHelp();
      return;
    }
    printHelp();
    process.exit(1);
  }

  switch (subcommand) {
    case "email":
      await urlEmail(args);
      break;
    case "mailbox":
      await urlMailbox(args);
      break;
    case "search":
      await urlSearch(args);
      break;
    case "compose":
      await urlCompose(args);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      printHelp();
      process.exit(1);
  }
}
