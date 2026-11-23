/**
 * Masked email command handlers.
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
import type { JmapClient } from "../jmap/client.ts";
import {
  getMaskedEmails,
  MASKED_EMAIL_CAPABILITY,
  type MaskedEmailState,
  setMaskedEmails,
} from "../jmap/masked-email.ts";

/** Common options for masked email commands */
const MASKED_OPTIONS = {
  state: { type: "string" as const },
  description: { type: "string" as const },
  "for-domain": { type: "string" as const },
  prefix: { type: "string" as const },
  json: { type: "boolean" as const },
};

/**
 * Check if masked email capability is available.
 */
async function checkCapability(client: JmapClient): Promise<void> {
  try {
    const session = await client.getSession();
    if (!session.capabilities[MASKED_EMAIL_CAPABILITY]) {
      throw runtimeError("Masked Email is not available for this account");
    }
  } catch (error) {
    throw runtimeError(
      `Failed to check account capabilities: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * List masked email addresses.
 */
export async function listMaskedEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MASKED_OPTIONS, [0, 0]);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail masked list [options]

List all masked email addresses.

Options:
  --state <state>  Filter by state (enabled, disabled, pending, deleted, all)
                   Default: all
  -h, --help       Show this help
`);
    return;
  }

  const client = await getClient();
  await checkCapability(client);

  const result = await getMaskedEmails(client);

  // Filter by state if specified
  let filtered = result.list;
  const stateFilter = getString(parsed, "state");

  if (stateFilter && stateFilter !== "all") {
    filtered = filtered.filter((m) => m.state === stateFilter);
  }

  console.log(JSON.stringify(filtered, null, 2));
}

/**
 * Create a masked email address.
 */
export async function createMaskedEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MASKED_OPTIONS, [0, 0]);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail masked create [options]

Create a new masked email address.

Options:
  --for-domain <domain>    Domain to associate with (e.g., https://example.com)
  --description <text>     Description/note for this address
  --prefix <prefix>        Preferred email prefix (may not be honored if taken)
                           Max 64 chars, only a-z, 0-9, underscore
  -h, --help              Show this help

Example:
  fastmail masked create --for-domain https://example.com --description "Shopping site" --prefix shopping_site
`);
    return;
  }

  const client = await getClient();
  await checkCapability(client);

  const createObj: {
    emailPrefix?: string;
    forDomain?: string;
    description?: string;
    state?: MaskedEmailState;
  } = {
    state: "pending",
  };

  const forDomain = getString(parsed, "for-domain");
  if (forDomain) {
    createObj.forDomain = forDomain;
  }

  const description = getString(parsed, "description");
  createObj.description = description ?? "";

  const prefix = getString(parsed, "prefix");
  if (prefix) {
    createObj.emailPrefix = prefix;
  }

  const result = await setMaskedEmails(client, {
    create: {
      new: createObj,
    },
  });

  if (result.created?.new) {
    if (getBoolean(parsed, "json"))
      console.log(JSON.stringify(result.created.new, null, 2));
    else console.error(`Created masked email: ${result.created.new.id}`);
  } else {
    const error = result.notCreated?.new;
    throw runtimeError(
      `Failed to create masked email: ${error?.type ?? "unknown"}${error?.description ? ` - ${error.description}` : ""}`,
    );
  }
}

/**
 * Update a masked email address.
 */
export async function updateMaskedEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MASKED_OPTIONS, [1, 1]);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail masked update <id> [options]

Update a masked email address.

Options:
  --state <state>         New state (enabled, disabled)
  --description <text>    New description
  --for-domain <domain>   New domain
  -h, --help             Show this help

Example:
  fastmail masked update masked-123 --state disabled --description "No longer using"
`);
    return;
  }
  if (!id)
    throw usageError(
      "Masked email ID required. Usage: fastmail masked update <id>",
    );

  const updates: {
    state?: MaskedEmailState;
    description?: string;
    forDomain?: string;
  } = {};

  const state = getString(parsed, "state");
  if (state) {
    if (
      state !== "enabled" &&
      state !== "disabled" &&
      state !== "pending" &&
      state !== "deleted"
    ) {
      throw usageError(
        "Invalid state. Must be: enabled, disabled, pending, or deleted",
      );
    }
    updates.state = state as MaskedEmailState;
  }

  const description = getString(parsed, "description");
  if (description !== undefined) {
    updates.description = description;
  }

  const forDomain = getString(parsed, "for-domain");
  if (forDomain) {
    updates.forDomain = forDomain;
  }

  if (Object.keys(updates).length === 0) {
    throw usageError(
      "No updates specified. Use --state, --description, or --for-domain.",
    );
  }

  const client = await getClient();
  await checkCapability(client);
  const result = await setMaskedEmails(client, {
    update: {
      [id]: updates,
    },
  });

  if (result.updated?.[id] !== undefined) {
    if (getBoolean(parsed, "json"))
      console.log(
        JSON.stringify(result.updated[id] ?? { id, updated: true }, null, 2),
      );
    else console.error(`Updated masked email: ${id}`);
  } else {
    const error = result.notUpdated?.[id];
    throw runtimeError(
      `Failed to update masked email: ${error?.type ?? "unknown"}${error?.description ? ` - ${error.description}` : ""}`,
    );
  }
}

/**
 * Delete a masked email address.
 */
export async function deleteMaskedEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MASKED_OPTIONS, [1, 1]);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed)) {
    console.log(`Usage: fastmail masked delete <id>

Delete a masked email address (sets state to deleted).

Options:
  -h, --help  Show this help

Note: This sets the state to "deleted" but doesn't remove the address
from your account history.
`);
    return;
  }
  if (!id)
    throw usageError(
      "Masked email ID required. Usage: fastmail masked delete <id>",
    );

  const client = await getClient();
  await checkCapability(client);

  const result = await setMaskedEmails(client, {
    destroy: [id],
  });

  if (result.destroyed?.includes(id)) {
    if (getBoolean(parsed, "json"))
      console.log(JSON.stringify({ id, deleted: true }));
    else console.error(`Deleted masked email: ${id}`);
  } else {
    const error = result.notDestroyed?.[id];
    throw runtimeError(
      `Failed to delete masked email: ${error?.type ?? "unknown"}${error?.description ? ` - ${error.description}` : ""}`,
    );
  }
}
