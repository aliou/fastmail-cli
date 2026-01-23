/**
 * Batch operation command handlers.
 */

import {
  getBoolean,
  getNumber,
  getString,
  type ParsedArgs,
  parseArgs,
  wantsHelp,
} from "../args.ts";
import { loadConfig } from "../config.ts";
import { JmapClient } from "../jmap/client.ts";
import {
  type EmailFilter,
  getEmails,
  queryEmails,
  setEmails,
} from "../jmap/email.ts";
import { JMAP_MAIL_CAPABILITY } from "../jmap/types.ts";

/** Common options for batch commands */
const BATCH_OPTIONS = {
  ids: { type: "string" as const },
  mailbox: { type: "string" as const },
  query: { type: "string" as const },
  "in-mailbox": { type: "string" as const },
  limit: { type: "string" as const },
  "dry-run": { type: "boolean" as const },
  to: { type: "string" as const },
  from: { type: "string" as const },
  permanent: { type: "boolean" as const },
  "add-keyword": { type: "string" as const },
  "remove-keyword": { type: "string" as const },
  "add-mailbox": { type: "string" as const },
  "remove-mailbox": { type: "string" as const },
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
 * Batch set emails with chunking support.
 */
async function batchSetEmails(
  client: JmapClient,
  updates: Record<string, Record<string, unknown>>,
): Promise<{ updated: number; failed: number }> {
  const session = await client.getSession();
  const coreCapability = session.capabilities["urn:ietf:params:jmap:core"] as
    | { maxObjectsInSet?: number }
    | undefined;
  const maxObjects = coreCapability?.maxObjectsInSet ?? 500;

  const ids = Object.keys(updates);
  let totalUpdated = 0;
  let totalFailed = 0;

  for (let i = 0; i < ids.length; i += maxObjects) {
    const chunk = ids.slice(i, i + maxObjects);
    const chunkUpdates: Record<string, Record<string, unknown>> = {};
    for (const id of chunk) {
      chunkUpdates[id] = updates[id] as Record<string, unknown>;
    }
    const result = await setEmails(client, { update: chunkUpdates });

    // Collect results
    totalUpdated += Object.keys(result.updated ?? {}).length;
    totalFailed += Object.keys(result.notUpdated ?? {}).length;
  }

  // Log summary if chunked
  if (ids.length > maxObjects) {
    console.error(
      `Processed ${ids.length} emails in ${Math.ceil(ids.length / maxObjects)} chunks`,
    );
  }

  return { updated: totalUpdated, failed: totalFailed };
}

/**
 * Batch destroy emails with chunking support.
 */
async function batchDestroyEmails(
  client: JmapClient,
  ids: string[],
): Promise<{ destroyed: number; failed: number }> {
  const session = await client.getSession();
  const coreCapability = session.capabilities["urn:ietf:params:jmap:core"] as
    | { maxObjectsInSet?: number }
    | undefined;
  const maxObjects = coreCapability?.maxObjectsInSet ?? 500;

  let totalDestroyed = 0;
  let totalFailed = 0;

  for (let i = 0; i < ids.length; i += maxObjects) {
    const chunk = ids.slice(i, i + maxObjects);
    const result = await setEmails(client, { destroy: chunk });

    totalDestroyed += result.destroyed?.length ?? 0;
    totalFailed += Object.keys(result.notDestroyed ?? {}).length;
  }

  // Log summary if chunked
  if (ids.length > maxObjects) {
    console.error(
      `Processed ${ids.length} emails in ${Math.ceil(ids.length / maxObjects)} chunks`,
    );
  }

  return { destroyed: totalDestroyed, failed: totalFailed };
}

/**
 * Resolve email IDs from various sources.
 */
async function resolveEmailIds(
  client: JmapClient,
  parsed: ParsedArgs,
): Promise<string[]> {
  // Priority:
  // 1. Explicit IDs via positional args or --ids
  // 2. Mailbox via --mailbox
  // 3. Search query via --query

  if (parsed.positionals.length > 0) {
    return parsed.positionals;
  }

  const ids = getString(parsed, "ids");
  if (ids) {
    return ids.split(",").map((id) => id.trim());
  }

  const mailbox = getString(parsed, "mailbox");
  if (mailbox) {
    const mailboxId = await resolveMailboxId(client, mailbox);
    const limit = getNumber(parsed, "limit") ?? 1000;

    const result = await queryEmails(client, {
      filter: { inMailbox: mailboxId },
      limit,
    });
    return result.ids;
  }

  const query = getString(parsed, "query");
  if (query) {
    const limit = getNumber(parsed, "limit") ?? 1000;
    const filter: EmailFilter = { text: query };

    const inMailbox = getString(parsed, "in-mailbox");
    if (inMailbox) {
      const mailboxId = await resolveMailboxId(client, inMailbox);
      filter.inMailbox = mailboxId;
    }

    const result = await queryEmails(client, { filter, limit });
    return result.ids;
  }

  throw new Error(
    "No emails specified. Use positional IDs, --ids, --mailbox, or --query",
  );
}

/**
 * Mark emails as read.
 */
export async function markRead(args: string[]): Promise<void> {
  const parsed = parseArgs(args, BATCH_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail batch read [selection flags]

Mark emails as read.

Selection (one required):
  <id>...              Email IDs as positional arguments
  --ids <id,id,...>    Comma-separated email IDs
  --mailbox <name>     All emails in mailbox
  --query <text>       Emails matching search query
  --in-mailbox <name>  Restrict --query to mailbox

Options:
  --limit <n>          Max emails to process (default: 1000)
  --dry-run            Show what would be modified without doing it
  -h, --help           Show this help

Examples:
  fastmail batch read EMAIL_ID1 EMAIL_ID2
  fastmail batch read --mailbox Inbox --limit 100
  fastmail batch read --query "from:newsletter" --dry-run
`);
    return;
  }

  const client = await getClient();
  const ids = await resolveEmailIds(client, parsed);

  if (getBoolean(parsed, "dry-run")) {
    console.log(
      JSON.stringify({ action: "markRead", count: ids.length, ids }, null, 2),
    );
    return;
  }

  // Build update map: { "id1": { "keywords/$seen": true }, ... }
  const update: Record<string, Record<string, boolean>> = {};
  for (const id of ids) {
    update[id] = { "keywords/$seen": true };
  }

  const result = await batchSetEmails(client, update);
  console.log(
    JSON.stringify(
      {
        action: "markRead",
        updated: result.updated,
        failed: result.failed,
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) {
    process.exit(1);
  }
}

/**
 * Mark emails as unread.
 */
export async function markUnread(args: string[]): Promise<void> {
  const parsed = parseArgs(args, BATCH_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail batch unread [selection flags]

Mark emails as unread.

Selection (one required):
  <id>...              Email IDs as positional arguments
  --ids <id,id,...>    Comma-separated email IDs
  --mailbox <name>     All emails in mailbox
  --query <text>       Emails matching search query
  --in-mailbox <name>  Restrict --query to mailbox

Options:
  --limit <n>          Max emails to process (default: 1000)
  --dry-run            Show what would be modified without doing it
  -h, --help           Show this help

Examples:
  fastmail batch unread EMAIL_ID1 EMAIL_ID2
  fastmail batch unread --mailbox Inbox --limit 100
  fastmail batch unread --query "from:newsletter" --dry-run
`);
    return;
  }

  const client = await getClient();
  const ids = await resolveEmailIds(client, parsed);

  if (getBoolean(parsed, "dry-run")) {
    console.log(
      JSON.stringify({ action: "markUnread", count: ids.length, ids }, null, 2),
    );
    return;
  }

  // Build update map: remove $seen keyword (set to null)
  const update: Record<string, Record<string, boolean | null>> = {};
  for (const id of ids) {
    update[id] = { "keywords/$seen": null };
  }

  const result = await batchSetEmails(client, update);
  console.log(
    JSON.stringify(
      {
        action: "markUnread",
        updated: result.updated,
        failed: result.failed,
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) {
    process.exit(1);
  }
}

/**
 * Flag emails.
 */
export async function flagEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, BATCH_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail batch flag [selection flags]

Flag/star emails.

Selection (one required):
  <id>...              Email IDs as positional arguments
  --ids <id,id,...>    Comma-separated email IDs
  --mailbox <name>     All emails in mailbox
  --query <text>       Emails matching search query
  --in-mailbox <name>  Restrict --query to mailbox

Options:
  --limit <n>          Max emails to process (default: 1000)
  --dry-run            Show what would be modified without doing it
  -h, --help           Show this help

Examples:
  fastmail batch flag EMAIL_ID1 EMAIL_ID2
  fastmail batch flag --query "subject:important"
  fastmail batch flag --mailbox Inbox --dry-run
`);
    return;
  }

  const client = await getClient();
  const ids = await resolveEmailIds(client, parsed);

  if (getBoolean(parsed, "dry-run")) {
    console.log(
      JSON.stringify({ action: "flag", count: ids.length, ids }, null, 2),
    );
    return;
  }

  // Build update map: set $flagged keyword to true
  const update: Record<string, Record<string, boolean>> = {};
  for (const id of ids) {
    update[id] = { "keywords/$flagged": true };
  }

  const result = await batchSetEmails(client, update);
  console.log(
    JSON.stringify(
      {
        action: "flag",
        updated: result.updated,
        failed: result.failed,
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) {
    process.exit(1);
  }
}

/**
 * Unflag emails.
 */
export async function unflagEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, BATCH_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail batch unflag [selection flags]

Remove flag/star from emails.

Selection (one required):
  <id>...              Email IDs as positional arguments
  --ids <id,id,...>    Comma-separated email IDs
  --mailbox <name>     All emails in mailbox
  --query <text>       Emails matching search query
  --in-mailbox <name>  Restrict --query to mailbox

Options:
  --limit <n>          Max emails to process (default: 1000)
  --dry-run            Show what would be modified without doing it
  -h, --help           Show this help

Examples:
  fastmail batch unflag EMAIL_ID1 EMAIL_ID2
  fastmail batch unflag --query "subject:old"
  fastmail batch unflag --mailbox Archive --dry-run
`);
    return;
  }

  const client = await getClient();
  const ids = await resolveEmailIds(client, parsed);

  if (getBoolean(parsed, "dry-run")) {
    console.log(
      JSON.stringify({ action: "unflag", count: ids.length, ids }, null, 2),
    );
    return;
  }

  // Build update map: remove $flagged keyword (set to null)
  const update: Record<string, Record<string, boolean | null>> = {};
  for (const id of ids) {
    update[id] = { "keywords/$flagged": null };
  }

  const result = await batchSetEmails(client, update);
  console.log(
    JSON.stringify(
      {
        action: "unflag",
        updated: result.updated,
        failed: result.failed,
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) {
    process.exit(1);
  }
}

/**
 * Move emails to a mailbox.
 */
export async function moveEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, BATCH_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail batch move --to <mailbox> [selection flags]

Move emails to a mailbox.

Selection (one required):
  <id>...              Email IDs as positional arguments
  --ids <id,id,...>    Comma-separated email IDs
  --mailbox <name>     All emails in mailbox
  --query <text>       Emails matching search query
  --in-mailbox <name>  Restrict --query to mailbox

Options:
  --to <mailbox>       Destination mailbox (required)
  --from <mailbox>     Remove from this mailbox (optional; if not set, removes from all)
  --limit <n>          Max emails to process (default: 1000)
  --dry-run            Show what would be modified without doing it
  -h, --help           Show this help

Examples:
  fastmail batch move --to Archive --mailbox Inbox
  fastmail batch move --to Important --query "subject:urgent"
  fastmail batch move --to Archive --from Inbox EMAIL_ID1 EMAIL_ID2
`);
    return;
  }

  const to = getString(parsed, "to");
  if (!to) {
    console.error("Error: --to mailbox required");
    process.exit(1);
  }

  const client = await getClient();
  const toMailboxId = await resolveMailboxId(client, to);
  const ids = await resolveEmailIds(client, parsed);

  const from = getString(parsed, "from");

  if (getBoolean(parsed, "dry-run")) {
    console.log(
      JSON.stringify(
        {
          action: "move",
          destination: to,
          from,
          count: ids.length,
          ids,
        },
        null,
        2,
      ),
    );
    return;
  }

  const update: Record<string, Record<string, boolean | null>> = {};

  if (from) {
    // Simple case: remove from specific mailbox, add to new
    const fromMailboxId = await resolveMailboxId(client, from);
    for (const id of ids) {
      update[id] = {
        [`mailboxIds/${fromMailboxId}`]: null,
        [`mailboxIds/${toMailboxId}`]: true,
      };
    }
  } else {
    // Need to get current mailboxIds and replace all
    // This requires Email/get first
    const getResult = await getEmails(client, {
      ids,
      properties: ["mailboxIds"],
    });

    for (const email of getResult.list) {
      // Remove all current mailboxes, add destination
      const patches: Record<string, boolean | null> = {
        [`mailboxIds/${toMailboxId}`]: true,
      };
      for (const mbId of Object.keys(email.mailboxIds)) {
        if (mbId !== toMailboxId) {
          patches[`mailboxIds/${mbId}`] = null;
        }
      }
      update[email.id] = patches;
    }
  }

  const result = await batchSetEmails(client, update);
  console.log(
    JSON.stringify(
      {
        action: "move",
        destination: to,
        updated: result.updated,
        failed: result.failed,
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) {
    process.exit(1);
  }
}

/**
 * Delete emails (move to Trash or permanent).
 */
export async function deleteEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, BATCH_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail batch delete [selection flags]

Delete emails (move to Trash).

Selection (one required):
  <id>...              Email IDs as positional arguments
  --ids <id,id,...>    Comma-separated email IDs
  --mailbox <name>     All emails in mailbox
  --query <text>       Emails matching search query
  --in-mailbox <name>  Restrict --query to mailbox

Options:
  --permanent          Permanently delete (skip Trash)
  --limit <n>          Max emails to process (default: 1000)
  --dry-run            Show what would be modified without doing it
  -h, --help           Show this help

Examples:
  fastmail batch delete --query "from:spam@example.com"
  fastmail batch delete --mailbox Spam --permanent
  fastmail batch delete EMAIL_ID1 EMAIL_ID2 --dry-run
`);
    return;
  }

  const client = await getClient();
  const ids = await resolveEmailIds(client, parsed);
  const permanent = getBoolean(parsed, "permanent");

  if (getBoolean(parsed, "dry-run")) {
    console.log(
      JSON.stringify(
        {
          action: "delete",
          permanent,
          count: ids.length,
          ids,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (permanent) {
    // Email/set destroy
    const result = await batchDestroyEmails(client, ids);
    console.log(
      JSON.stringify(
        {
          action: "delete",
          permanent: true,
          destroyed: result.destroyed,
          failed: result.failed,
        },
        null,
        2,
      ),
    );

    if (result.failed > 0) {
      process.exit(1);
    }
  } else {
    // Move to Trash mailbox
    const trashId = await resolveMailboxId(client, "Trash");

    // Get current mailboxIds for each email
    const getResult = await getEmails(client, {
      ids,
      properties: ["mailboxIds"],
    });

    const update: Record<string, Record<string, boolean | null>> = {};
    for (const email of getResult.list) {
      // Remove all current mailboxes, add Trash
      const patches: Record<string, boolean | null> = {
        [`mailboxIds/${trashId}`]: true,
      };
      for (const mbId of Object.keys(email.mailboxIds)) {
        if (mbId !== trashId) {
          patches[`mailboxIds/${mbId}`] = null;
        }
      }
      update[email.id] = patches;
    }

    const result = await batchSetEmails(client, update);
    console.log(
      JSON.stringify(
        {
          action: "delete",
          permanent: false,
          destination: "Trash",
          updated: result.updated,
          failed: result.failed,
        },
        null,
        2,
      ),
    );

    if (result.failed > 0) {
      process.exit(1);
    }
  }
}

/**
 * Generic modify operation.
 */
export async function modifyEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, BATCH_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail batch modify [selection flags] [modification flags]

Generic email modification.

Selection (one required):
  <id>...              Email IDs as positional arguments
  --ids <id,id,...>    Comma-separated email IDs
  --mailbox <name>     All emails in mailbox
  --query <text>       Emails matching search query
  --in-mailbox <name>  Restrict --query to mailbox

Modification flags:
  --add-keyword <kw>        Add keyword
  --remove-keyword <kw>     Remove keyword
  --add-mailbox <name>      Add to mailbox
  --remove-mailbox <name>   Remove from mailbox

Options:
  --limit <n>          Max emails to process (default: 1000)
  --dry-run            Show what would be modified without doing it
  -h, --help           Show this help

Examples:
  fastmail batch modify --add-keyword "$flagged" EMAIL_ID1
  fastmail batch modify --remove-keyword "$seen" --query "from:spam"
  fastmail batch modify --add-mailbox Archive --mailbox Inbox
`);
    return;
  }

  const client = await getClient();
  const ids = await resolveEmailIds(client, parsed);

  // Build patches based on modification flags
  const patches: Record<string, boolean | null> = {};

  const addKeyword = getString(parsed, "add-keyword");
  if (addKeyword) {
    patches[`keywords/${addKeyword}`] = true;
  }

  const removeKeyword = getString(parsed, "remove-keyword");
  if (removeKeyword) {
    patches[`keywords/${removeKeyword}`] = null;
  }

  const addMailbox = getString(parsed, "add-mailbox");
  if (addMailbox) {
    const mailboxId = await resolveMailboxId(client, addMailbox);
    patches[`mailboxIds/${mailboxId}`] = true;
  }

  const removeMailbox = getString(parsed, "remove-mailbox");
  if (removeMailbox) {
    const mailboxId = await resolveMailboxId(client, removeMailbox);
    patches[`mailboxIds/${mailboxId}`] = null;
  }

  if (Object.keys(patches).length === 0) {
    console.error(
      "Error: At least one modification flag required (--add-keyword, --remove-keyword, --add-mailbox, --remove-mailbox)",
    );
    process.exit(1);
  }

  if (getBoolean(parsed, "dry-run")) {
    console.log(
      JSON.stringify(
        {
          action: "modify",
          patches,
          count: ids.length,
          ids,
        },
        null,
        2,
      ),
    );
    return;
  }

  // Apply same patches to all IDs
  const update: Record<string, Record<string, boolean | null>> = {};
  for (const id of ids) {
    update[id] = patches;
  }

  const result = await batchSetEmails(client, update);
  console.log(
    JSON.stringify(
      {
        action: "modify",
        patches,
        updated: result.updated,
        failed: result.failed,
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) {
    process.exit(1);
  }
}
