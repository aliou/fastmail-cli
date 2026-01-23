/**
 * Email command handlers.
 */

import { basename } from "node:path";
import {
  getBoolean,
  getNumber,
  getPositional,
  getString,
  parseArgs,
  wantsHelp,
} from "../args.ts";
import { loadConfig } from "../config.ts";
import { uploadBlob } from "../jmap/blob.ts";
import { JmapClient } from "../jmap/client.ts";
import {
  type Email,
  type EmailAddress,
  type EmailBodyPart,
  type EmailFilter,
  getEmails,
  queryEmails,
  setEmails,
} from "../jmap/email.ts";
import { setEmailSubmissions } from "../jmap/submission.ts";
import {
  JMAP_MAIL_CAPABILITY,
  JMAP_SUBMISSION_CAPABILITY,
} from "../jmap/types.ts";

/** Common options for email commands */
const EMAIL_OPTIONS = {
  mailbox: { type: "string" as const },
  limit: { type: "string" as const },
  "body-type": { type: "string" as const },
  to: { type: "string" as const },
  cc: { type: "string" as const },
  bcc: { type: "string" as const },
  subject: { type: "string" as const },
  body: { type: "string" as const },
  "body-file": { type: "string" as const },
  stdin: { type: "boolean" as const },
  html: { type: "boolean" as const },
  query: { type: "string" as const },
  from: { type: "string" as const },
  before: { type: "string" as const },
  after: { type: "string" as const },
  attach: { type: "string" as const, multiple: true },
  "reply-to": { type: "string" as const },
  "reply-all": { type: "boolean" as const },
};

/**
 * Reply context extracted from an original email.
 */
interface ReplyContext {
  inReplyTo: string[];
  references: string[];
  threadId: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
}

/**
 * Get reply headers and recipients from an original email.
 */
export async function getReplyContext(
  client: JmapClient,
  emailId: string,
  replyAll: boolean,
  myEmail: string,
): Promise<ReplyContext> {
  const result = await getEmails(client, {
    ids: [emailId],
    properties: [
      "messageId",
      "inReplyTo",
      "references",
      "threadId",
      "from",
      "to",
      "cc",
      "replyTo",
      "subject",
    ],
  });

  if (result.notFound.includes(emailId)) {
    throw new Error(`Email not found: ${emailId}`);
  }

  const email = result.list[0];
  if (!email) {
    throw new Error(`Email not found: ${emailId}`);
  }

  // Build References header: original references + original messageId
  const references = [...(email.references ?? []), ...(email.messageId ?? [])];

  // In-Reply-To is just the original messageId
  const inReplyTo = email.messageId ?? [];

  // Subject with Re: prefix (if not already present)
  let subject = email.subject ?? "";
  if (!subject.toLowerCase().startsWith("re:")) {
    subject = `Re: ${subject}`;
  }

  // Recipients for reply
  let to: EmailAddress[] = [];
  let cc: EmailAddress[] = [];

  if (replyAll) {
    // Reply-all: reply to sender (or replyTo), cc all original recipients except self
    const replyTo = email.replyTo ?? email.from ?? [];
    to = replyTo;

    // Gather all recipients, excluding self and those already in To
    const allRecipients = [
      ...(email.from ?? []),
      ...(email.to ?? []),
      ...(email.cc ?? []),
    ];

    cc = allRecipients.filter(
      (addr) =>
        addr.email.toLowerCase() !== myEmail.toLowerCase() &&
        !to.some((t) => t.email.toLowerCase() === addr.email.toLowerCase()),
    );
  }

  return {
    inReplyTo,
    references,
    threadId: email.threadId,
    to,
    cc,
    subject,
  };
}

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
 * Parse date string to ISO 8601 format.
 * Accepts:
 * - ISO 8601: "2026-01-11T00:00:00Z"
 * - Date only: "2026-01-11" -> "2026-01-11T00:00:00Z"
 * - Relative: "7d", "2w", "1m", "1y" -> calculated date
 */
export function parseDate(input: string): string {
  // Relative dates
  const relativeMatch = input.match(/^(\d+)([dwmy])$/);
  if (relativeMatch?.[1] && relativeMatch[2]) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const now = new Date();

    switch (unit) {
      case "d":
        now.setDate(now.getDate() - amount);
        break;
      case "w":
        now.setDate(now.getDate() - amount * 7);
        break;
      case "m":
        now.setMonth(now.getMonth() - amount);
        break;
      case "y":
        now.setFullYear(now.getFullYear() - amount);
        break;
    }

    return now.toISOString();
  }

  // ISO 8601 - return as-is
  if (input.includes("T") && input.endsWith("Z")) {
    return input;
  }

  // Date only - add time
  if (input.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return `${input}T00:00:00Z`;
  }

  throw new Error(
    `Invalid date format: ${input}. Use ISO 8601, YYYY-MM-DD, or relative (7d, 2w, 1m, 1y)`,
  );
}

/**
 * Resolve mailbox name to ID.
 * For now, this is a simple implementation - in practice would use Mailbox/get.
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
 * Format email for display.
 */
function formatEmail(email: Email, full = false): Record<string, unknown> {
  const base = {
    id: email.id,
    threadId: email.threadId,
    subject: email.subject ?? "(no subject)",
    from: email.from ?? [],
    receivedAt: email.receivedAt,
    hasAttachment: email.hasAttachment ?? false,
    keywords: email.keywords,
  };

  if (!full) {
    return base;
  }

  return {
    ...base,
    to: email.to ?? [],
    cc: email.cc ?? [],
    bcc: email.bcc ?? [],
    size: email.size,
    hasAttachment: email.hasAttachment,
    preview: email.preview,
    bodyValues: email.bodyValues,
    textBody: email.textBody,
    htmlBody: email.htmlBody,
  };
}

/**
 * List emails from a mailbox.
 */
export async function listEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, {
    ...EMAIL_OPTIONS,
    unread: { type: "boolean" as const },
    flagged: { type: "boolean" as const },
  });

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail email list [options]

List emails from a mailbox.

Options:
  --mailbox <name>  Mailbox name or ID (default: Inbox)
  --limit <n>       Max results (default: 20)
  --unread          Only unread emails
  --flagged         Only flagged emails
  --after <date>    Received on or after date (ISO 8601, YYYY-MM-DD, or 7d)
  --before <date>   Received before date (ISO 8601, YYYY-MM-DD, or 7d)
  -h, --help        Show this help

Examples:
  fastmail email list --after "2026-01-11"
  fastmail email list --after "7d" --unread
  fastmail email list --before "2026-01-01T00:00:00Z"
`);
    return;
  }

  const client = await getClient();

  const mailboxName = getString(parsed, "mailbox") ?? "Inbox";
  const limit = getNumber(parsed, "limit") ?? 20;

  // Build filter
  const filter: EmailFilter = {};

  // Resolve mailbox name to ID
  const mailboxId = await resolveMailboxId(client, mailboxName);
  filter.inMailbox = mailboxId;

  if (getBoolean(parsed, "unread")) {
    filter.notKeyword = "$seen";
  }

  if (getBoolean(parsed, "flagged")) {
    filter.hasKeyword = "$flagged";
  }

  // Date filtering
  const after = getString(parsed, "after");
  if (after) {
    filter.after = parseDate(after);
  }

  const before = getString(parsed, "before");
  if (before) {
    filter.before = parseDate(before);
  }

  // Query emails
  const queryResult = await queryEmails(client, {
    filter,
    sort: [{ property: "receivedAt", isAscending: false }],
    limit,
  });

  if (queryResult.ids.length === 0) {
    console.log("[]");
    return;
  }

  // Get email details
  const getResult = await getEmails(client, {
    ids: queryResult.ids,
    properties: [
      "id",
      "threadId",
      "subject",
      "from",
      "receivedAt",
      "hasAttachment",
      "keywords",
    ],
  });

  // Output as JSON
  const formatted = getResult.list.map((email) => formatEmail(email, false));
  console.log(JSON.stringify(formatted, null, 2));
}

/**
 * Get full email by ID.
 */
export async function getEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, {
    ...EMAIL_OPTIONS,
    raw: { type: "boolean" as const },
  });

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail email get <id> [options]

Get full email by ID.

Options:
  --raw             Output raw RFC5322 message
  --body-type <t>   Which body to include (text|html, default: text)
  -h, --help        Show this help
`);
    return;
  }

  const emailId = getPositional(parsed, 0);
  if (!emailId) {
    console.error("Error: Email ID required");
    console.error("Usage: fastmail email get <id>");
    process.exit(1);
  }

  const client = await getClient();
  const bodyType = getString(parsed, "body-type") ?? "text";

  const getResult = await getEmails(client, {
    ids: [emailId],
    properties: [
      "id",
      "threadId",
      "mailboxIds",
      "keywords",
      "subject",
      "from",
      "to",
      "cc",
      "bcc",
      "receivedAt",
      "size",
      "preview",
      "headers",
      "bodyStructure",
      "bodyValues",
      "textBody",
      "htmlBody",
      "hasAttachment",
    ],
    fetchTextBodyValues: bodyType === "text",
    fetchHTMLBodyValues: bodyType === "html",
  });

  if (getResult.notFound.includes(emailId)) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  const email = getResult.list[0];
  if (!email) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  if (getBoolean(parsed, "raw")) {
    // TODO: Fetch raw message via download URL
    console.error("Error: --raw not yet implemented");
    process.exit(1);
  }

  console.log(JSON.stringify(formatEmail(email, true), null, 2));
}

/**
 * Search emails.
 */
export async function searchEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, EMAIL_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail email search <query> [options]

Search emails using text query.

Options:
  --limit <n>       Max results (default: 20)
  --mailbox <name>  Restrict to mailbox
  --after <date>    Received on or after date (ISO 8601, YYYY-MM-DD, or 7d)
  --before <date>   Received before date (ISO 8601, YYYY-MM-DD, or 7d)
  -h, --help        Show this help

Examples:
  fastmail email search "from:newsletter" --after "7d"
  fastmail email search "project update" --after "2026-01-01" --before "2026-01-15"
`);
    return;
  }

  const query = getPositional(parsed, 0);
  if (!query) {
    console.error("Error: Search query required");
    console.error("Usage: fastmail email search <query>");
    process.exit(1);
  }

  const client = await getClient();
  const limit = getNumber(parsed, "limit") ?? 20;

  // Build filter
  const filter: EmailFilter = {
    text: query,
  };

  const mailbox = getString(parsed, "mailbox");
  if (mailbox) {
    const mailboxId = await resolveMailboxId(client, mailbox);
    filter.inMailbox = mailboxId;
  }

  // Date filtering
  const after = getString(parsed, "after");
  if (after) {
    filter.after = parseDate(after);
  }

  const before = getString(parsed, "before");
  if (before) {
    filter.before = parseDate(before);
  }

  // Query emails
  const queryResult = await queryEmails(client, {
    filter,
    sort: [{ property: "receivedAt", isAscending: false }],
    limit,
  });

  if (queryResult.ids.length === 0) {
    console.log("[]");
    return;
  }

  // Get email details
  const getResult = await getEmails(client, {
    ids: queryResult.ids,
    properties: [
      "id",
      "threadId",
      "subject",
      "from",
      "receivedAt",
      "hasAttachment",
      "keywords",
    ],
  });

  const formatted = getResult.list.map((email) => formatEmail(email, false));
  console.log(JSON.stringify(formatted, null, 2));
}

/**
 * Send an email.
 */
export async function sendEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, {
    ...EMAIL_OPTIONS,
    "body-file": { type: "string" as const },
  });

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail email send [options]

Send an email.

Options:
  --to <addr>           Recipient (comma-separated for multiple)
  --cc <addr>           CC recipient
  --bcc <addr>          BCC recipient
  --subject <text>      Subject line
  --body <text>         Body text
  --body-file <path>    Read body from file
  --stdin               Read body from stdin
  --html                Body is HTML
  --from <identity>     From identity (if multiple)
  --attach <path>       Attach file (comma-separated for multiple)
  --reply-to <emailId>  Reply to email ID (sets In-Reply-To/References/thread)
  --reply-all           Auto-populate To/Cc from original (requires --reply-to)
  -h, --help            Show this help

Examples:
  fastmail email send --to bob@example.com --subject "Hello" --body "Hi there"
  fastmail email send --to bob@example.com --subject "Report" --body-file report.txt
  cat body.txt | fastmail email send --to bob@example.com --subject "Data" --stdin
  fastmail email send --to bob@example.com --subject "Files" --body "See attached" --attach file.pdf
  fastmail email send --reply-to EMAIL_ID --body "Thanks!"
  fastmail email send --reply-to EMAIL_ID --reply-all --body "Thanks everyone!"
`);
    return;
  }

  const replyTo = getString(parsed, "reply-to");
  const replyAll = getBoolean(parsed, "reply-all");
  const to = getString(parsed, "to");
  const subject = getString(parsed, "subject");

  // Validate --reply-all requires --reply-to
  if (replyAll && !replyTo) {
    console.error("Error: --reply-all requires --reply-to");
    process.exit(1);
  }

  // Validate required fields (--to not required if --reply-to with --reply-all)
  const hasReplyAllContext = replyTo && replyAll;
  if (!to && !hasReplyAllContext) {
    console.error(
      "Error: --to is required (or use --reply-to with --reply-all)",
    );
    process.exit(1);
  }

  // Subject not required if replying (will use Re: original subject)
  if (!subject && !replyTo) {
    console.error("Error: --subject is required (or use --reply-to)");
    process.exit(1);
  }

  // Get body content
  let body: string;
  if (getBoolean(parsed, "stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString("utf-8");
  } else {
    const bodyFile = getString(parsed, "body-file");
    if (bodyFile) {
      body = await Bun.file(bodyFile).text();
    } else {
      const bodyText = getString(parsed, "body");
      if (bodyText) {
        body = bodyText;
      } else {
        console.error("Error: --body, --body-file, or --stdin required");
        process.exit(1);
      }
    }
  }

  const client = await getClient();
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  // Get Drafts and Sent mailboxes
  const mailboxResponse = await client.call<{
    list: Array<{ id: string; role?: string }>;
  }>([JMAP_MAIL_CAPABILITY], "Mailbox/get", { accountId });

  const draftsMailbox = mailboxResponse.list.find((mb) => mb.role === "drafts");
  if (!draftsMailbox) {
    console.error("Error: Drafts mailbox not found");
    process.exit(1);
  }

  const sentMailbox = mailboxResponse.list.find((mb) => mb.role === "sent");
  if (!sentMailbox) {
    console.error("Error: Sent mailbox not found");
    process.exit(1);
  }

  // Get identity (for now, use first available)
  // Identity/get requires the submission capability
  const identityResponse = await client.call<{
    list: Array<{ id: string; email: string; name?: string }>;
  }>([JMAP_MAIL_CAPABILITY, JMAP_SUBMISSION_CAPABILITY], "Identity/get", {
    accountId,
  });

  if (identityResponse.list.length === 0) {
    console.error("Error: No identities found");
    process.exit(1);
  }

  const identity = identityResponse.list[0];
  if (!identity) {
    console.error("Error: No identities found");
    process.exit(1);
  }

  // Get reply context if replying
  let replyContext: ReplyContext | null = null;
  if (replyTo) {
    replyContext = await getReplyContext(
      client,
      replyTo,
      replyAll,
      identity.email,
    );

    // Validate reply-all has recipients
    if (
      replyAll &&
      replyContext.to.length === 0 &&
      replyContext.cc.length === 0
    ) {
      console.error("Error: No recipients for reply");
      process.exit(1);
    }
  }

  // Parse recipients (explicit --to overrides reply context)
  let toAddrs: EmailAddress[] = [];
  if (to) {
    toAddrs = to.split(",").map((addr) => {
      const trimmed = addr.trim();
      return { email: trimmed };
    });
  } else if (replyContext) {
    toAddrs = replyContext.to;
  }

  const cc = getString(parsed, "cc");
  let ccAddrs: EmailAddress[] = [];
  if (cc) {
    ccAddrs = cc.split(",").map((addr) => {
      const trimmed = addr.trim();
      return { email: trimmed };
    });
  } else if (replyContext) {
    ccAddrs = replyContext.cc;
  }

  const bcc = getString(parsed, "bcc");
  const bccAddrs: EmailAddress[] = bcc
    ? bcc.split(",").map((addr) => {
        const trimmed = addr.trim();
        return { email: trimmed };
      })
    : [];

  // Determine final subject (explicit --subject overrides reply context)
  const finalSubject = subject ?? replyContext?.subject ?? "";

  // Handle attachments
  const attachments: EmailBodyPart[] = [];
  const attach = getString(parsed, "attach");
  if (attach) {
    const attachPaths = attach.split(",");

    for (const filePath of attachPaths) {
      const trimmed = filePath.trim();
      const file = Bun.file(trimmed);

      if (!(await file.exists())) {
        console.error(`Error: File not found: ${trimmed}`);
        process.exit(1);
      }

      const data = await file.arrayBuffer();
      const type = file.type || "application/octet-stream";
      const name = basename(trimmed);

      // Upload blob
      const uploaded = await uploadBlob(client, data, type);

      attachments.push({
        blobId: uploaded.blobId,
        type: uploaded.type,
        name,
        size: uploaded.size,
        disposition: "attachment",
      });
    }
  }

  // Build email object
  // Note: threadId is server-set and immutable, determined from In-Reply-To/References
  const emailToCreate = {
    mailboxIds: { [draftsMailbox.id]: true },
    keywords: { $draft: true },
    from: [{ email: identity.email, name: identity.name }],
    to: toAddrs,
    ...(ccAddrs.length > 0 && { cc: ccAddrs }),
    ...(bccAddrs.length > 0 && { bcc: bccAddrs }),
    subject: finalSubject,
    // Reply headers for threading (server determines threadId from these)
    ...(replyContext && {
      inReplyTo: replyContext.inReplyTo,
      references: replyContext.references,
    }),
    bodyValues: {
      body: {
        value: body,
      },
    },
    textBody: [
      {
        partId: "body",
        type: getBoolean(parsed, "html") ? "text/html" : "text/plain",
      },
    ],
    ...(attachments.length > 0 && { attachments }),
  };

  // Create draft email
  const emailSet = await setEmails(client, {
    create: {
      draft: emailToCreate as unknown as Partial<Email>,
    },
  });

  const createdEmail = emailSet.created?.draft;
  if (!createdEmail) {
    const error = emailSet.notCreated?.draft;
    console.error(
      `Error creating email: ${error?.type ?? "unknown"} - ${error?.description ?? "Unknown error"}`,
    );
    process.exit(1);
  }

  // Submit for sending
  // Use onSuccessUpdateEmail to move from Drafts to Sent and remove $draft keyword
  const submissionSet = await setEmailSubmissions(client, {
    create: {
      send: {
        identityId: identity.id,
        emailId: createdEmail.id,
      },
    },
    onSuccessUpdateEmail: {
      "#send": {
        mailboxIds: { [sentMailbox.id]: true },
        "keywords/$draft": null,
      },
    },
  });

  const created = submissionSet.created?.send;
  if (!created) {
    const error = submissionSet.notCreated?.send;
    console.error(
      `Error sending email: ${error?.description ?? "Unknown error"}`,
    );
    process.exit(1);
  }

  console.log("Email sent successfully");
}

/**
 * Mark emails as read.
 */
export async function markRead(args: string[]): Promise<void> {
  const parsed = parseArgs(args, EMAIL_OPTIONS);
  const ids = parsed.positionals;

  if (wantsHelp(parsed) || ids.length === 0) {
    console.log(`
Usage: fastmail email mark-read <id>...

Mark one or more emails as read.

Arguments:
  <id>...    Email IDs to mark as read

Examples:
  fastmail email mark-read EMAIL_ID
  fastmail email mark-read ID1 ID2 ID3
`);
    if (ids.length === 0) {
      process.exit(1);
    }
    return;
  }

  const client = await getClient();

  // Build update map: set $seen keyword to true for all IDs
  const update: Record<string, Record<string, boolean>> = {};
  for (const id of ids) {
    update[id] = { "keywords/$seen": true };
  }

  const result = await setEmails(client, { update });

  const updated = Object.keys(result.updated ?? {}).length;
  const failed = Object.keys(result.notUpdated ?? {}).length;

  console.log(
    JSON.stringify({
      action: "markRead",
      updated,
      failed,
      ids: updated > 0 ? Object.keys(result.updated ?? {}) : undefined,
    }),
  );

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Mark emails as unread.
 */
export async function markUnread(args: string[]): Promise<void> {
  const parsed = parseArgs(args, EMAIL_OPTIONS);
  const ids = parsed.positionals;

  if (wantsHelp(parsed) || ids.length === 0) {
    console.log(`
Usage: fastmail email mark-unread <id>...

Mark one or more emails as unread.

Arguments:
  <id>...    Email IDs to mark as unread

Examples:
  fastmail email mark-unread EMAIL_ID
  fastmail email mark-unread ID1 ID2 ID3
`);
    if (ids.length === 0) {
      process.exit(1);
    }
    return;
  }

  const client = await getClient();

  // Build update map: remove $seen keyword (set to null)
  const update: Record<string, Record<string, boolean | null>> = {};
  for (const id of ids) {
    update[id] = { "keywords/$seen": null };
  }

  const result = await setEmails(client, { update });

  const updated = Object.keys(result.updated ?? {}).length;
  const failed = Object.keys(result.notUpdated ?? {}).length;

  console.log(
    JSON.stringify({
      action: "markUnread",
      updated,
      failed,
      ids: updated > 0 ? Object.keys(result.updated ?? {}) : undefined,
    }),
  );

  if (failed > 0) {
    process.exit(1);
  }
}
