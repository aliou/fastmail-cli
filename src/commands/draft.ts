/**
 * Draft command handlers.
 */

import {
  getBoolean,
  getNumber,
  getPositional,
  getString,
  parseArgs,
  wantsHelp,
} from "../args.ts";
import { loadConfig } from "../config.ts";
import { JmapClient } from "../jmap/client.ts";
import {
  type Email,
  type EmailAddress,
  getEmails,
  queryEmails,
  setEmails,
} from "../jmap/email.ts";
import { setEmailSubmissions } from "../jmap/submission.ts";
import {
  JMAP_MAIL_CAPABILITY,
  JMAP_SUBMISSION_CAPABILITY,
} from "../jmap/types.ts";

/** Common options for draft commands */
const DRAFT_OPTIONS = {
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
 * Parse email addresses from comma-separated string.
 */
function parseAddresses(input: string): EmailAddress[] {
  return input.split(",").map((addr) => {
    const trimmed = addr.trim();
    return { email: trimmed };
  });
}

/**
 * Get the Drafts mailbox ID.
 */
async function getDraftsMailboxId(client: JmapClient): Promise<string> {
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);
  const response = await client.call<{
    list: Array<{ id: string; role?: string }>;
  }>([JMAP_MAIL_CAPABILITY], "Mailbox/get", { accountId });

  const drafts = response.list.find((mb) => mb.role === "drafts");
  if (!drafts) {
    throw new Error("Drafts mailbox not found");
  }
  return drafts.id;
}

/**
 * Get identity for sending.
 */
async function getIdentity(
  client: JmapClient,
): Promise<{ id: string; email: string; name?: string }> {
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);
  const response = await client.call<{
    list: Array<{ id: string; email: string; name?: string }>;
  }>([JMAP_MAIL_CAPABILITY, JMAP_SUBMISSION_CAPABILITY], "Identity/get", {
    accountId,
  });

  if (response.list.length === 0) {
    throw new Error("No identities found");
  }

  const identity = response.list[0];
  if (!identity) {
    throw new Error("No identities found");
  }

  return identity;
}

/**
 * Format draft for output.
 */
function formatDraft(email: Email, full = false): Record<string, unknown> {
  const base = {
    id: email.id,
    subject: email.subject ?? "(no subject)",
    to: email.to ?? [],
    receivedAt: email.receivedAt,
  };

  if (!full) {
    return base;
  }

  return {
    ...base,
    threadId: email.threadId,
    from: email.from ?? [],
    cc: email.cc ?? [],
    bcc: email.bcc ?? [],
    preview: email.preview,
    bodyValues: email.bodyValues,
    textBody: email.textBody,
    htmlBody: email.htmlBody,
  };
}

/**
 * List drafts.
 */
export async function listDrafts(args: string[]): Promise<void> {
  const parsed = parseArgs(args, DRAFT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail draft list [options]

List all drafts.

Options:
  --limit <n>    Max results (default: 20)
  -h, --help     Show this help
`);
    return;
  }

  const client = await getClient();
  const limit = getNumber(parsed, "limit") ?? 20;

  // Get drafts mailbox ID
  const draftsMailboxId = await getDraftsMailboxId(client);

  // Query emails in Drafts mailbox with $draft keyword
  const queryResult = await queryEmails(client, {
    filter: {
      inMailbox: draftsMailboxId,
      hasKeyword: "$draft",
    },
    sort: [{ property: "receivedAt", isAscending: false }],
    limit,
  });

  if (queryResult.ids.length === 0) {
    console.log("[]");
    return;
  }

  // Get draft details
  const getResult = await getEmails(client, {
    ids: queryResult.ids,
    properties: ["id", "subject", "to", "receivedAt"],
  });

  const formatted = getResult.list.map((email) => formatDraft(email, false));
  console.log(JSON.stringify(formatted, null, 2));
}

/**
 * Get draft by ID.
 */
export async function getDraft(args: string[]): Promise<void> {
  const parsed = parseArgs(args, DRAFT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail draft get <id> [options]

Get draft details.

Options:
  --body-type <t>  Which body to include (text|html, default: text)
  -h, --help       Show this help
`);
    return;
  }

  const draftId = getPositional(parsed, 0);
  if (!draftId) {
    console.error("Error: Draft ID required");
    console.error("Usage: fastmail draft get <id>");
    process.exit(1);
  }

  const client = await getClient();
  const bodyType = getString(parsed, "body-type") ?? "text";

  const getResult = await getEmails(client, {
    ids: [draftId],
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
      "preview",
      "bodyValues",
      "textBody",
      "htmlBody",
    ],
    fetchTextBodyValues: bodyType === "text",
    fetchHTMLBodyValues: bodyType === "html",
  });

  if (getResult.notFound.includes(draftId)) {
    console.error(`Error: Draft not found: ${draftId}`);
    process.exit(1);
  }

  const email = getResult.list[0];
  if (!email) {
    console.error(`Error: Draft not found: ${draftId}`);
    process.exit(1);
  }

  console.log(JSON.stringify(formatDraft(email, true), null, 2));
}

/**
 * Create a new draft.
 */
export async function createDraft(args: string[]): Promise<void> {
  const parsed = parseArgs(args, DRAFT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail draft create [options]

Create a new draft.

Options:
  --to <addr>         Recipient (comma-separated for multiple)
  --cc <addr>         CC recipient (comma-separated)
  --bcc <addr>        BCC recipient (comma-separated)
  --subject <text>    Subject line
  --body <text>       Body text
  --body-file <path>  Read body from file
  --stdin             Read body from stdin
  --html              Body is HTML
  -h, --help          Show this help

Examples:
  fastmail draft create --to bob@example.com --subject "Hello" --body "Draft content"
  fastmail draft create --to bob@example.com --subject "Report" --body-file report.txt
`);
    return;
  }

  // Get body content
  let body = "";
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
      body = getString(parsed, "body") ?? "";
    }
  }

  const client = await getClient();

  // Get drafts mailbox ID
  const draftsMailboxId = await getDraftsMailboxId(client);

  // Parse recipients
  const to = getString(parsed, "to");
  const cc = getString(parsed, "cc");
  const bcc = getString(parsed, "bcc");
  const subject = getString(parsed, "subject");

  const toAddrs: EmailAddress[] = to ? parseAddresses(to) : [];
  const ccAddrs: EmailAddress[] = cc ? parseAddresses(cc) : [];
  const bccAddrs: EmailAddress[] = bcc ? parseAddresses(bcc) : [];

  // Build draft email object (from address set by server if not provided)
  const draftToCreate: Partial<Email> = {
    mailboxIds: { [draftsMailboxId]: true },
    keywords: { $draft: true },
    ...(toAddrs.length > 0 && { to: toAddrs }),
    ...(ccAddrs.length > 0 && { cc: ccAddrs }),
    ...(bccAddrs.length > 0 && { bcc: bccAddrs }),
    ...(subject && { subject }),
    ...(body && {
      bodyValues: {
        body: { value: body },
      },
      textBody: [
        {
          partId: "body",
          type: getBoolean(parsed, "html") ? "text/html" : "text/plain",
        },
      ],
    }),
  };

  const result = await setEmails(client, {
    create: {
      draft: draftToCreate,
    },
  });

  const created = result.created?.draft;
  if (!created) {
    const error = result.notCreated?.draft;
    console.error(
      `Error creating draft: ${error?.description ?? "Unknown error"}`,
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        id: created.id,
        subject: subject ?? "(no subject)",
      },
      null,
      2,
    ),
  );
}

/**
 * Delete a draft.
 */
export async function deleteDraft(args: string[]): Promise<void> {
  const parsed = parseArgs(args, DRAFT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail draft delete <id>

Delete a draft.

Options:
  -h, --help    Show this help
`);
    return;
  }

  const draftId = getPositional(parsed, 0);
  if (!draftId) {
    console.error("Error: Draft ID required");
    console.error("Usage: fastmail draft delete <id>");
    process.exit(1);
  }

  const client = await getClient();

  const result = await setEmails(client, {
    destroy: [draftId],
  });

  if (result.notDestroyed?.[draftId]) {
    const error = result.notDestroyed[draftId];
    console.error(
      `Error deleting draft: ${error?.description ?? "Unknown error"}`,
    );
    process.exit(1);
  }

  console.log(`Draft deleted: ${draftId}`);
}

/**
 * Send a draft.
 */
export async function sendDraft(args: string[]): Promise<void> {
  const parsed = parseArgs(args, DRAFT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail draft send <id>

Send a draft.

Options:
  -h, --help    Show this help
`);
    return;
  }

  const draftId = getPositional(parsed, 0);
  if (!draftId) {
    console.error("Error: Draft ID required");
    console.error("Usage: fastmail draft send <id>");
    process.exit(1);
  }

  const client = await getClient();

  // Get draft to verify it exists and has recipients
  const getResult = await getEmails(client, {
    ids: [draftId],
    properties: ["id", "to", "cc", "bcc"],
  });

  if (getResult.notFound.includes(draftId)) {
    console.error(`Error: Draft not found: ${draftId}`);
    process.exit(1);
  }

  const draft = getResult.list[0];
  if (!draft) {
    console.error(`Error: Draft not found: ${draftId}`);
    process.exit(1);
  }

  // Check for recipients
  const hasRecipients =
    (draft.to && draft.to.length > 0) ||
    (draft.cc && draft.cc.length > 0) ||
    (draft.bcc && draft.bcc.length > 0);

  if (!hasRecipients) {
    console.error("Error: Draft has no recipients");
    process.exit(1);
  }

  // Get identity for sending
  const identity = await getIdentity(client);

  // Submit for sending
  const result = await setEmailSubmissions(client, {
    create: {
      send: {
        identityId: identity.id,
        emailId: draftId,
      },
    },
    // Note: onSuccessDestroyEmail should use "#send" to reference the created submission's emailId
    onSuccessDestroyEmail: ["#send"],
  });

  const created = result.created?.send;
  if (!created) {
    const error = result.notCreated?.send;
    console.error(
      `Error sending draft: ${error?.description ?? "Unknown error"}`,
    );
    process.exit(1);
  }

  console.log("Draft sent successfully");
}

/**
 * Update an existing draft.
 * Note: In JMAP, most Email properties are immutable.
 * To "update" a draft, we must destroy the old one and create a new one.
 */
export async function updateDraft(args: string[]): Promise<void> {
  const parsed = parseArgs(args, DRAFT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail draft update <id> [options]

Update an existing draft.

Note: Returns a new draft ID because JMAP emails are immutable.

Options:
  --to <addr>         Replace recipients (comma-separated)
  --cc <addr>         Replace CC recipients (comma-separated)
  --bcc <addr>        Replace BCC recipients (comma-separated)
  --subject <text>    Replace subject
  --body <text>       Replace body
  --body-file <path>  Read body from file
  --stdin             Read body from stdin
  --html              Body is HTML
  -h, --help          Show this help

Examples:
  fastmail draft update DRAFT_ID --subject "Updated subject"
  fastmail draft update DRAFT_ID --to "new@example.com" --body "New content"
`);
    return;
  }

  const draftId = getPositional(parsed, 0);
  if (!draftId) {
    console.error("Error: Draft ID required");
    console.error("Usage: fastmail draft update <id> [options]");
    process.exit(1);
  }

  // Check if any changes specified
  const hasChanges =
    getString(parsed, "to") ||
    getString(parsed, "cc") ||
    getString(parsed, "bcc") ||
    getString(parsed, "subject") ||
    getString(parsed, "body") ||
    getString(parsed, "body-file") ||
    getBoolean(parsed, "stdin");

  if (!hasChanges) {
    console.error("Error: No changes specified");
    console.error(
      "Use --to, --cc, --bcc, --subject, --body, --body-file, or --stdin",
    );
    process.exit(1);
  }

  const client = await getClient();

  // Fetch existing draft
  const getResult = await getEmails(client, {
    ids: [draftId],
    properties: [
      "id",
      "mailboxIds",
      "keywords",
      "from",
      "to",
      "cc",
      "bcc",
      "subject",
      "bodyValues",
      "textBody",
      "htmlBody",
    ],
    fetchTextBodyValues: true,
    fetchHTMLBodyValues: true,
  });

  if (getResult.notFound.includes(draftId)) {
    console.error(`Error: Draft not found: ${draftId}`);
    process.exit(1);
  }

  const existingDraft = getResult.list[0];
  if (!existingDraft) {
    console.error(`Error: Draft not found: ${draftId}`);
    process.exit(1);
  }

  // Get drafts mailbox ID
  const draftsMailboxId = await getDraftsMailboxId(client);

  // Get body content for update
  let newBody: string | undefined;
  if (getBoolean(parsed, "stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    newBody = Buffer.concat(chunks).toString("utf-8");
  } else {
    const bodyFile = getString(parsed, "body-file");
    if (bodyFile) {
      newBody = await Bun.file(bodyFile).text();
    } else {
      newBody = getString(parsed, "body");
    }
  }

  // Get existing body if not replacing
  let existingBody = "";
  if (existingDraft.bodyValues) {
    const bodyPart = existingDraft.textBody?.[0] || existingDraft.htmlBody?.[0];
    const bodyValue = bodyPart?.partId
      ? existingDraft.bodyValues[bodyPart.partId]
      : undefined;
    if (bodyValue) {
      existingBody = bodyValue.value;
    }
  }

  // Determine body type from existing or new
  const existingIsHtml =
    existingDraft.htmlBody &&
    existingDraft.htmlBody.length > 0 &&
    (!existingDraft.textBody || existingDraft.textBody.length === 0);
  const useHtml = getBoolean(parsed, "html") || (existingIsHtml && !newBody);

  // Build new draft with merged values
  const to = getString(parsed, "to");
  const cc = getString(parsed, "cc");
  const bcc = getString(parsed, "bcc");
  const subject = getString(parsed, "subject");

  const newDraft: Partial<Email> = {
    mailboxIds: { [draftsMailboxId]: true },
    keywords: { $draft: true },
    from: existingDraft.from,
    to: to ? parseAddresses(to) : existingDraft.to,
    cc: cc ? parseAddresses(cc) : existingDraft.cc,
    bcc: bcc ? parseAddresses(bcc) : existingDraft.bcc,
    subject: subject ?? existingDraft.subject,
  };

  // Add body
  const bodyContent = newBody ?? existingBody;
  if (bodyContent) {
    newDraft.bodyValues = {
      body: { value: bodyContent },
    };
    newDraft.textBody = [
      {
        partId: "body",
        type: useHtml ? "text/html" : "text/plain",
      },
    ];
  }

  // Create new draft and destroy old one in same request
  const result = await setEmails(client, {
    create: {
      newDraft: newDraft,
    },
    destroy: [draftId],
  });

  const created = result.created?.newDraft;
  if (!created) {
    const error = result.notCreated?.newDraft;
    console.error(
      `Error updating draft: ${error?.description ?? "Unknown error"}`,
    );
    process.exit(1);
  }

  // Check if old draft was destroyed
  if (result.notDestroyed?.[draftId]) {
    console.error(
      `Warning: New draft created but old draft not destroyed: ${result.notDestroyed[draftId]?.description}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        id: created.id,
        previousId: draftId,
        subject: newDraft.subject ?? "(no subject)",
      },
      null,
      2,
    ),
  );
}
