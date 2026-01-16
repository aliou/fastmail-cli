/**
 * Mailbox command handlers.
 */

import {
  getBoolean,
  getPositional,
  getString,
  parseArgs,
  wantsHelp,
} from "../args.ts";
import { loadConfig } from "../config.ts";
import { JmapClient } from "../jmap/client.ts";
import { getMailboxes, type Mailbox, setMailboxes } from "../jmap/mailbox.ts";

/** Common options for mailbox commands */
const MAILBOX_OPTIONS = {
  tree: { type: "boolean" as const },
  parent: { type: "string" as const },
  name: { type: "string" as const },
  force: { type: "boolean" as const },
};

/**
 * Get authenticated JMAP client.
 */
async function getClient(): Promise<JmapClient> {
  const envToken = process.env.FASTMAIL_API_TOKEN;
  const config = await loadConfig();

  const token = envToken || config.apiToken;
  if (!token) {
    console.error("Error: Not authenticated. Run 'fastmail auth login' first.");
    process.exit(1);
  }

  return new JmapClient({ token });
}

/**
 * Build tree structure from flat mailbox list.
 */
function buildTree(mailboxes: Mailbox[]): Mailbox[] {
  const map = new Map<string, Mailbox & { children?: Mailbox[] }>();
  const roots: Mailbox[] = [];

  // Build map
  for (const mailbox of mailboxes) {
    map.set(mailbox.id, { ...mailbox, children: [] });
  }

  // Build tree
  for (const mailbox of mailboxes) {
    const node = map.get(mailbox.id);
    if (!node) continue;

    if (mailbox.parentId) {
      const parent = map.get(mailbox.parentId);
      if (parent?.children) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Flatten tree structure for display.
 */
function flattenTree(
  nodes: (Mailbox & { children?: Mailbox[] })[],
  depth = 0,
): Array<Mailbox & { depth: number }> {
  const result: Array<Mailbox & { depth: number }> = [];

  for (const node of nodes) {
    const { children, ...mailbox } = node;
    result.push({ ...mailbox, depth });

    if (children && children.length > 0) {
      result.push(...flattenTree(children, depth + 1));
    }
  }

  return result;
}

/**
 * Format mailbox for display.
 */
function formatMailbox(mailbox: Mailbox & { depth?: number }): string {
  const indent = mailbox.depth ? "  ".repeat(mailbox.depth) : "";
  const role = mailbox.role ? ` (${mailbox.role})` : "";
  const unread = mailbox.unreadEmails > 0 ? ` [${mailbox.unreadEmails}]` : "";

  return `${indent}${mailbox.name}${role}${unread} - ${mailbox.totalEmails} emails`;
}

/**
 * List mailboxes.
 */
export async function listMailboxes(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MAILBOX_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail mailbox list [options]

List all mailboxes.

Options:
  --tree        Display as tree structure
  -h, --help    Show this help
`);
    return;
  }

  const client = await getClient();
  const result = await getMailboxes(client);

  if (getBoolean(parsed, "tree")) {
    const tree = buildTree(result.list);
    const flat = flattenTree(tree);

    for (const mailbox of flat) {
      console.log(formatMailbox(mailbox));
    }
  } else {
    console.log(JSON.stringify(result.list, null, 2));
  }
}

/**
 * Create a mailbox.
 */
export async function createMailbox(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MAILBOX_OPTIONS);
  const name = getPositional(parsed, 0);

  if (wantsHelp(parsed) || !name) {
    console.log(`Usage: fastmail mailbox create <name> [options]

Create a new mailbox.

Options:
  --parent <id>  Parent mailbox ID
  -h, --help     Show this help
`);
    return;
  }

  const parentId = getString(parsed, "parent");

  const client = await getClient();
  const result = await setMailboxes(client, {
    create: {
      new: {
        name,
        parentId: parentId || null,
      },
    },
  });

  if (result.created?.new) {
    console.log(`Created mailbox: ${result.created.new.id}`);
    console.log(JSON.stringify(result.created.new, null, 2));
  } else if (result.notCreated?.new) {
    console.error(`Failed to create mailbox: ${result.notCreated.new.type}`);
    if (result.notCreated.new.description) {
      console.error(result.notCreated.new.description);
    }
    process.exit(1);
  }
}

/**
 * Update a mailbox.
 */
export async function updateMailbox(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MAILBOX_OPTIONS);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed) || !id) {
    console.log(`Usage: fastmail mailbox update <id> [options]

Update mailbox properties.

Options:
  --name <name>     New name
  --parent <id>     New parent mailbox ID
  -h, --help        Show this help
`);
    return;
  }

  const updates: {
    name?: string;
    parentId?: string | null;
  } = {};

  const newName = getString(parsed, "name");
  if (newName) {
    updates.name = newName;
  }

  const parent = getString(parsed, "parent");
  if (parent !== undefined) {
    updates.parentId = parent === "null" ? null : parent;
  }

  if (Object.keys(updates).length === 0) {
    console.error("Error: No updates specified. Use --name or --parent.");
    process.exit(1);
  }

  const client = await getClient();
  const result = await setMailboxes(client, {
    update: {
      [id]: updates,
    },
  });

  if (result.updated?.[id] !== undefined) {
    console.log(`Updated mailbox: ${id}`);
  } else if (result.notUpdated?.[id]) {
    console.error(`Failed to update mailbox: ${result.notUpdated[id].type}`);
    if (result.notUpdated[id].description) {
      console.error(result.notUpdated[id].description);
    }
    process.exit(1);
  }
}

/**
 * Delete a mailbox.
 */
export async function deleteMailbox(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MAILBOX_OPTIONS);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed) || !id) {
    console.log(`Usage: fastmail mailbox delete <id> [options]

Delete a mailbox.

Options:
  --force        Remove emails from mailbox on delete
  -h, --help     Show this help
`);
    return;
  }

  const force = getBoolean(parsed, "force");

  const client = await getClient();
  const result = await setMailboxes(client, {
    destroy: [id],
    onDestroyRemoveEmails: force,
  });

  if (result.destroyed?.includes(id)) {
    console.log(`Deleted mailbox: ${id}`);
  } else if (result.notDestroyed?.[id]) {
    console.error(`Failed to delete mailbox: ${result.notDestroyed[id].type}`);
    if (result.notDestroyed[id].description) {
      console.error(result.notDestroyed[id].description);
    }
    process.exit(1);
  }
}
