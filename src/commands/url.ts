import { exec } from "node:child_process";
import { platform } from "node:os";
import {
  getBoolean,
  getPositional,
  getString,
  parseArgs,
  wantsHelp,
} from "../args.ts";
import { getClient } from "../client.ts";
import { runtimeError, usageError } from "../error.ts";
import { getEmails } from "../jmap/email.ts";
import { resolveMailboxId } from "../mailbox-resolver.ts";

const FASTMAIL_WEB_BASE = "https://app.fastmail.com";
const options = {
  open: { type: "boolean" as const },
  to: { type: "string" as const },
  subject: { type: "string" as const },
  body: { type: "string" as const },
};

function openInBrowser(url: string): void {
  const command =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "start"
        : "xdg-open";
  exec(`${command} "${url}"`, (error) => {
    if (error)
      console.error(`fastmail: failed to open browser: ${error.message}`);
  });
}

export function getEmailUrl(mailboxId: string, emailId: string): string {
  return `${FASTMAIL_WEB_BASE}/mail/${mailboxId}/${emailId}`;
}

export function getMailboxUrl(mailboxId: string): string {
  return `${FASTMAIL_WEB_BASE}/mail/${mailboxId}/`;
}

export function getSearchUrl(query: string): string {
  return `${FASTMAIL_WEB_BASE}/mail/search:${encodeURIComponent(query)}`;
}

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
    const query = params.toString();
    if (query) url += `?${query}`;
  }
  return url;
}

export async function urlEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, options, [1, null]);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail url email EMAIL_ID\n  fastmail url email EMAIL_ID --open\n\nUsage: fastmail url email <id>... [--open]\n\nOptions:\n  --open       Open URLs in browser\n  -h, --help   Show this help`,
    );
    return;
  }
  if (parsed.positionals.length === 0)
    throw usageError("Email ID(s) required. Usage: fastmail url email <id>...");
  const client = await getClient();
  const result = await getEmails(client, {
    ids: parsed.positionals,
    properties: ["id", "mailboxIds"],
  });
  const urls = result.list.flatMap((email) => {
    const mailboxId = Object.keys(email.mailboxIds)[0];
    return mailboxId ? [getEmailUrl(mailboxId, email.id)] : [];
  });
  if (result.notFound.length > 0) {
    throw runtimeError(`Email not found: ${result.notFound.join(", ")}`);
  }
  if (urls.length === 0) throw runtimeError("No URLs generated");
  for (const url of urls) {
    console.log(url);
    if (getBoolean(parsed, "open")) openInBrowser(url);
  }
}

export async function urlMailbox(args: string[]): Promise<void> {
  const parsed = parseArgs(args, options, [1, 1]);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail url mailbox Inbox\n\nUsage: fastmail url mailbox <name> [--open]\n\nOptions:\n  --open       Open URL in browser\n  -h, --help   Show this help`,
    );
    return;
  }
  const nameOrId = getPositional(parsed, 0);
  if (!nameOrId)
    throw usageError(
      "Mailbox name or ID required. Usage: fastmail url mailbox <name>",
    );
  const client = await getClient();
  const url = getMailboxUrl(await resolveMailboxId(client, nameOrId));
  console.log(url);
  if (getBoolean(parsed, "open")) openInBrowser(url);
}

export async function urlSearch(args: string[]): Promise<void> {
  const parsed = parseArgs(args, options, [1, 1]);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail url search 'from:person@example.com'\n\nUsage: fastmail url search <query> [--open]\n\nOptions:\n  --open       Open URL in browser\n  -h, --help   Show this help`,
    );
    return;
  }
  const query = getPositional(parsed, 0);
  if (!query)
    throw usageError(
      "Search query required. Usage: fastmail url search <query>",
    );
  const url = getSearchUrl(query);
  console.log(url);
  if (getBoolean(parsed, "open")) openInBrowser(url);
}

export async function urlCompose(args: string[]): Promise<void> {
  const parsed = parseArgs(args, options, [0, 0]);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail url compose --to person@example.com --subject Hello\n\nUsage: fastmail url compose [options]\n\nOptions:\n  --to <addr>      Pre-fill recipient\n  --subject <s>    Pre-fill subject\n  --body <text>    Pre-fill body\n  --open           Open URL in browser\n  -h, --help       Show this help`,
    );
    return;
  }
  if (parsed.positionals.length > 0)
    throw usageError("url compose accepts no positional arguments");
  const url = getComposeUrl({
    to: getString(parsed, "to"),
    subject: getString(parsed, "subject"),
    body: getString(parsed, "body"),
  });
  console.log(url);
  if (getBoolean(parsed, "open")) openInBrowser(url);
}
