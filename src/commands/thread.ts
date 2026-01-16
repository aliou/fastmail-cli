/**
 * Thread command handlers.
 */

import { getPositional, getString, parseArgs, wantsHelp } from "../args.ts";
import { loadConfig } from "../config.ts";
import { JmapClient } from "../jmap/client.ts";
import {
  type Email,
  type EmailBodyPart,
  getEmails,
  setEmails,
} from "../jmap/email.ts";
import { getThreads } from "../jmap/thread.ts";
import { JMAP_MAIL_CAPABILITY } from "../jmap/types.ts";

/** Common options for thread commands */
const THREAD_OPTIONS = {
  "body-type": { type: "string" as const },
  "add-mailbox": { type: "string" as const },
  "remove-mailbox": { type: "string" as const },
  "add-keyword": { type: "string" as const },
  "remove-keyword": { type: "string" as const },
};

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
 * Get a thread with all its emails.
 */
export async function getThread(args: string[]): Promise<void> {
  const parsed = parseArgs(args, THREAD_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail thread get <threadId> [options]

Get a thread with all messages.

Options:
  --body-type <t>    Which body to include (text|html|none, default: none)
  -h, --help         Show this help
`);
    return;
  }

  const threadId = getPositional(parsed, 0);
  if (!threadId) {
    console.error("Error: Thread ID required");
    console.error("Usage: fastmail thread get <threadId>");
    process.exit(1);
  }

  const client = await getClient();
  const bodyType = getString(parsed, "body-type") ?? "none";

  // 1. Get thread to get emailIds
  const threadResult = await getThreads(client, { ids: [threadId] });

  if (threadResult.notFound.includes(threadId)) {
    console.error(`Error: Thread not found: ${threadId}`);
    process.exit(1);
  }

  const thread = threadResult.list[0];
  if (!thread || thread.emailIds.length === 0) {
    console.error(`Error: Thread not found or empty: ${threadId}`);
    process.exit(1);
  }

  // 2. Get all emails in the thread
  const properties = [
    "id",
    "threadId",
    "mailboxIds",
    "keywords",
    "subject",
    "from",
    "to",
    "cc",
    "receivedAt",
    "preview",
    "hasAttachment",
  ];

  if (bodyType !== "none") {
    properties.push("bodyValues", "textBody", "htmlBody");
  }

  const emailResult = await getEmails(client, {
    ids: thread.emailIds,
    properties,
    fetchTextBodyValues: bodyType === "text",
    fetchHTMLBodyValues: bodyType === "html",
  });

  // 3. Sort by receivedAt (chronological order)
  const emails = emailResult.list.sort(
    (a, b) =>
      new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
  );

  // Get subject from first email
  const subject = emails[0]?.subject ?? "(no subject)";

  // Format output
  const output = {
    id: threadId,
    subject,
    messageCount: emails.length,
    emails: emails.map((email) => ({
      id: email.id,
      from: email.from ?? [],
      to: email.to ?? [],
      cc: email.cc ?? [],
      receivedAt: email.receivedAt,
      preview: email.preview,
      hasAttachment: email.hasAttachment ?? false,
      keywords: email.keywords,
      ...(bodyType !== "none" && { bodyValues: email.bodyValues }),
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Modify labels/keywords on all emails in a thread.
 */
export async function modifyThread(args: string[]): Promise<void> {
  const parsed = parseArgs(args, THREAD_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail thread modify <threadId> [options]

Modify labels/keywords on all emails in a thread.

Options:
  --add-mailbox <id|name>     Add to mailbox
  --remove-mailbox <id|name>  Remove from mailbox
  --add-keyword <kw>          Add keyword (e.g., $flagged, $seen)
  --remove-keyword <kw>       Remove keyword
  -h, --help                  Show this help

Examples:
  fastmail thread modify THREAD_ID --add-keyword '$flagged'
  fastmail thread modify THREAD_ID --add-keyword '$seen'
  fastmail thread modify THREAD_ID --add-mailbox Archive --remove-mailbox Inbox
`);
    return;
  }

  const threadId = getPositional(parsed, 0);
  if (!threadId) {
    console.error("Error: Thread ID required");
    console.error("Usage: fastmail thread modify <threadId> [options]");
    process.exit(1);
  }

  const addMailbox = getString(parsed, "add-mailbox");
  const removeMailbox = getString(parsed, "remove-mailbox");
  const addKeyword = getString(parsed, "add-keyword");
  const removeKeyword = getString(parsed, "remove-keyword");

  if (!addMailbox && !removeMailbox && !addKeyword && !removeKeyword) {
    console.error("Error: At least one modification option required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  const client = await getClient();

  // 1. Get thread to get emailIds
  const threadResult = await getThreads(client, { ids: [threadId] });

  if (threadResult.notFound.includes(threadId)) {
    console.error(`Error: Thread not found: ${threadId}`);
    process.exit(1);
  }

  const thread = threadResult.list[0];
  if (!thread || thread.emailIds.length === 0) {
    console.error(`Error: Thread not found or empty: ${threadId}`);
    process.exit(1);
  }

  // 2. Resolve mailbox IDs if needed
  let addMailboxId: string | undefined;
  let removeMailboxId: string | undefined;

  if (addMailbox) {
    addMailboxId = await resolveMailboxId(client, addMailbox);
  }
  if (removeMailbox) {
    removeMailboxId = await resolveMailboxId(client, removeMailbox);
  }

  // 3. Build update map for all emails
  const update: Record<string, Record<string, boolean | null>> = {};

  for (const emailId of thread.emailIds) {
    const patch: Record<string, boolean | null> = {};

    if (addMailboxId) {
      patch[`mailboxIds/${addMailboxId}`] = true;
    }
    if (removeMailboxId) {
      patch[`mailboxIds/${removeMailboxId}`] = null;
    }
    if (addKeyword) {
      patch[`keywords/${addKeyword}`] = true;
    }
    if (removeKeyword) {
      patch[`keywords/${removeKeyword}`] = null;
    }

    update[emailId] = patch;
  }

  // 4. Apply updates
  const result = await setEmails(client, { update });

  const modified = Object.keys(result.updated ?? {}).length;
  const failed = Object.keys(result.notUpdated ?? {}).length;

  console.log(
    JSON.stringify({
      action: "modifyThread",
      threadId,
      modified,
      failed,
    }),
  );

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * List all attachments in a thread.
 */
export async function threadAttachments(args: string[]): Promise<void> {
  const parsed = parseArgs(args, THREAD_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail thread attachments <threadId> [options]

List all attachments in a thread.

Options:
  -h, --help  Show this help
`);
    return;
  }

  const threadId = getPositional(parsed, 0);
  if (!threadId) {
    console.error("Error: Thread ID required");
    console.error("Usage: fastmail thread attachments <threadId>");
    process.exit(1);
  }

  const client = await getClient();

  // 1. Get thread to get emailIds
  const threadResult = await getThreads(client, { ids: [threadId] });

  if (threadResult.notFound.includes(threadId)) {
    console.error(`Error: Thread not found: ${threadId}`);
    process.exit(1);
  }

  const thread = threadResult.list[0];
  if (!thread || thread.emailIds.length === 0) {
    console.error(`Error: Thread not found or empty: ${threadId}`);
    process.exit(1);
  }

  // 2. Get emails with attachment info
  const emailResult = await getEmails(client, {
    ids: thread.emailIds,
    properties: [
      "id",
      "subject",
      "receivedAt",
      "hasAttachment",
      "attachments",
      "bodyStructure",
    ],
  });

  // 3. Extract attachments from each email
  const output = emailResult.list
    .filter((email) => email.hasAttachment)
    .map((email) => ({
      emailId: email.id,
      subject: email.subject ?? "(no subject)",
      receivedAt: email.receivedAt,
      attachments: (email.attachments ?? []).map((att: EmailBodyPart) => ({
        blobId: att.blobId,
        name: att.name ?? "(unnamed)",
        type: att.type ?? "application/octet-stream",
        size: att.size ?? 0,
      })),
    }));

  console.log(JSON.stringify(output, null, 2));
}
