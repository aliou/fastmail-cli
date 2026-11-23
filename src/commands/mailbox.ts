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
import { getClient } from "../client.ts";
import { runtimeError, usageError } from "../error.ts";
import { getMailboxes, type Mailbox, setMailboxes } from "../jmap/mailbox.ts";

/** Common options for mailbox commands */
const MAILBOX_OPTIONS = {
  tree: { type: "boolean" as const },
  parent: { type: "string" as const },
  name: { type: "string" as const },
  force: { type: "boolean" as const },
  json: { type: "boolean" as const },
};

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

  return `${indent}${mailbox.name}${role}${unread} - ${mailbox.totalEmails} emails [${mailbox.id}]`;
}

/**
 * List mailboxes.
 */
export async function listMailboxes(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MAILBOX_OPTIONS, [0, 0]);

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

  if (getBoolean(parsed, "tree") && !getBoolean(parsed, "json")) {
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
  const parsed = parseArgs(args, MAILBOX_OPTIONS, [1, 1]);
  const name = getPositional(parsed, 0);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail mailbox create <name> [options]

Create a new mailbox.

Options:
  --parent <id>  Parent mailbox ID
  -h, --help     Show this help
`);
    return;
  }
  if (!name)
    throw usageError(
      "Mailbox name required. Usage: fastmail mailbox create <name>",
    );

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
    if (getBoolean(parsed, "json")) {
      console.log(JSON.stringify(result.created.new, null, 2));
    } else {
      console.error(`Created mailbox: ${result.created.new.id}`);
    }
  } else {
    const error = result.notCreated?.new;
    throw runtimeError(
      `Failed to create mailbox: ${error?.type ?? "unknown"}${error?.description ? ` - ${error.description}` : ""}`,
    );
  }
}

/**
 * Update a mailbox.
 */
export async function updateMailbox(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MAILBOX_OPTIONS, [1, 1]);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail mailbox update <id> [options]

Update mailbox properties.

Options:
  --name <name>     New name
  --parent <id>     New parent mailbox ID
  -h, --help        Show this help
`);
    return;
  }
  if (!id)
    throw usageError(
      "Mailbox ID required. Usage: fastmail mailbox update <id>",
    );

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
    throw usageError("No updates specified. Use --name or --parent.");
  }

  const client = await getClient();
  const result = await setMailboxes(client, {
    update: {
      [id]: updates,
    },
  });

  if (result.updated?.[id] !== undefined) {
    if (getBoolean(parsed, "json"))
      console.log(JSON.stringify({ id, updated: true }));
    else console.error(`Updated mailbox: ${id}`);
  } else {
    const error = result.notUpdated?.[id];
    throw runtimeError(
      `Failed to update mailbox: ${error?.type ?? "unknown"}${error?.description ? ` - ${error.description}` : ""}`,
    );
  }
}

/**
 * Delete a mailbox.
 */
export async function deleteMailbox(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MAILBOX_OPTIONS, [1, 1]);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail mailbox delete <id> [options]

Delete a mailbox.

Options:
  --force        Remove emails from mailbox on delete
  -h, --help     Show this help
`);
    return;
  }
  if (!id)
    throw usageError(
      "Mailbox ID required. Usage: fastmail mailbox delete <id>",
    );

  const force = getBoolean(parsed, "force");

  const client = await getClient();
  const result = await setMailboxes(client, {
    destroy: [id],
    onDestroyRemoveEmails: force,
  });

  if (result.destroyed?.includes(id)) {
    if (getBoolean(parsed, "json"))
      console.log(JSON.stringify({ id, deleted: true }));
    else console.error(`Deleted mailbox: ${id}`);
  } else {
    const error = result.notDestroyed?.[id];
    throw runtimeError(
      `Failed to delete mailbox: ${error?.type ?? "unknown"}${error?.description ? ` - ${error.description}` : ""}`,
    );
  }
}
