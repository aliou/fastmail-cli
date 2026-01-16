/**
 * Masked email command handlers.
 */

import { getPositional, getString, parseArgs, wantsHelp } from "../args.ts";
import { loadConfig } from "../config.ts";
import { JmapClient } from "../jmap/client.ts";
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
 * Check if masked email capability is available.
 */
async function checkCapability(client: JmapClient): Promise<void> {
  try {
    const session = await client.getSession();
    if (!session.capabilities[MASKED_EMAIL_CAPABILITY]) {
      console.error(
        "Error: Masked Email feature is not available for this account.",
      );
      console.error(
        "This is a FastMail-specific feature that may require a paid account.",
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("Error: Failed to check account capabilities.");
    throw error;
  }
}

/**
 * List masked email addresses.
 */
export async function listMaskedEmails(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MASKED_OPTIONS);

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
  const parsed = parseArgs(args, MASKED_OPTIONS);

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
    console.log("Created masked email:");
    console.log(JSON.stringify(result.created.new, null, 2));
  } else if (result.notCreated?.new) {
    console.error(
      `Failed to create masked email: ${result.notCreated.new.type}`,
    );
    if (result.notCreated.new.description) {
      console.error(result.notCreated.new.description);
    }
    process.exit(1);
  }
}

/**
 * Update a masked email address.
 */
export async function updateMaskedEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MASKED_OPTIONS);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed) || !id) {
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

  const client = await getClient();
  await checkCapability(client);

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
      console.error(
        "Error: Invalid state. Must be: enabled, disabled, pending, or deleted",
      );
      process.exit(1);
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
    console.error(
      "Error: No updates specified. Use --state, --description, or --for-domain.",
    );
    process.exit(1);
  }

  const result = await setMaskedEmails(client, {
    update: {
      [id]: updates,
    },
  });

  if (result.updated?.[id] !== undefined) {
    console.log(`Updated masked email: ${id}`);
    if (result.updated[id]) {
      console.log(JSON.stringify(result.updated[id], null, 2));
    }
  } else if (result.notUpdated?.[id]) {
    console.error(
      `Failed to update masked email: ${result.notUpdated[id].type}`,
    );
    if (result.notUpdated[id].description) {
      console.error(result.notUpdated[id].description);
    }
    process.exit(1);
  }
}

/**
 * Delete a masked email address.
 */
export async function deleteMaskedEmail(args: string[]): Promise<void> {
  const parsed = parseArgs(args, MASKED_OPTIONS);
  const id = getPositional(parsed, 0);

  if (wantsHelp(parsed) || !id) {
    console.log(`Usage: fastmail masked delete <id>

Delete a masked email address (sets state to deleted).

Options:
  -h, --help  Show this help

Note: This sets the state to "deleted" but doesn't remove the address
from your account history.
`);
    return;
  }

  const client = await getClient();
  await checkCapability(client);

  const result = await setMaskedEmails(client, {
    destroy: [id],
  });

  if (result.destroyed?.includes(id)) {
    console.log(`Deleted masked email: ${id}`);
  } else if (result.notDestroyed?.[id]) {
    console.error(
      `Failed to delete masked email: ${result.notDestroyed[id].type}`,
    );
    if (result.notDestroyed[id].description) {
      console.error(result.notDestroyed[id].description);
    }
    process.exit(1);
  }
}
