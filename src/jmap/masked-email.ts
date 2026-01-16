/**
 * JMAP MaskedEmail methods (FastMail-specific extension).
 * See: https://www.fastmail.com/for-developers/masked-email/
 */

import type { JmapClient } from "./client.ts";

/**
 * FastMail MaskedEmail capability.
 */
export const MASKED_EMAIL_CAPABILITY =
  "https://www.fastmail.com/dev/maskedemail";

/**
 * MaskedEmail state values.
 */
export type MaskedEmailState = "pending" | "enabled" | "disabled" | "deleted";

/**
 * MaskedEmail object.
 */
export interface MaskedEmail {
  id: string;
  email: string;
  state: MaskedEmailState;
  forDomain: string;
  description: string;
  lastMessageAt: string | null;
  createdAt: string;
  createdBy: string;
  url: string | null;
}

/**
 * MaskedEmail/get arguments.
 */
export interface MaskedEmailGetArgs {
  accountId?: string;
  ids?: string[] | null;
  properties?: string[];
}

/**
 * MaskedEmail/get response.
 */
export interface MaskedEmailGetResponse extends Record<string, unknown> {
  accountId: string;
  state: string;
  list: MaskedEmail[];
  notFound: string[];
}

/**
 * MaskedEmail/set arguments.
 */
export interface MaskedEmailSetArgs {
  accountId?: string;
  ifInState?: string;
  create?: Record<
    string,
    {
      emailPrefix?: string;
      state?: MaskedEmailState;
      forDomain?: string;
      description?: string;
      url?: string | null;
    }
  >;
  update?: Record<
    string,
    {
      state?: MaskedEmailState;
      description?: string;
      forDomain?: string;
      url?: string | null;
    }
  >;
  destroy?: string[];
}

/**
 * MaskedEmail/set response.
 */
export interface MaskedEmailSetResponse extends Record<string, unknown> {
  accountId: string;
  oldState?: string;
  newState?: string;
  created?: Record<string, MaskedEmail>;
  updated?: Record<string, Partial<MaskedEmail> | null>;
  destroyed?: string[];
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
}

/**
 * Fetch masked email addresses.
 */
export async function getMaskedEmails(
  client: JmapClient,
  args: MaskedEmailGetArgs = {},
): Promise<MaskedEmailGetResponse> {
  const accountId =
    args.accountId ??
    (await client.getPrimaryAccountId(MASKED_EMAIL_CAPABILITY));

  return await client.call<MaskedEmailGetResponse>(
    [MASKED_EMAIL_CAPABILITY],
    "MaskedEmail/get",
    {
      accountId,
      ids: args.ids,
      properties: args.properties,
    },
  );
}

/**
 * Create, update, or destroy masked email addresses.
 */
export async function setMaskedEmails(
  client: JmapClient,
  args: MaskedEmailSetArgs,
): Promise<MaskedEmailSetResponse> {
  const accountId =
    args.accountId ??
    (await client.getPrimaryAccountId(MASKED_EMAIL_CAPABILITY));

  return await client.call<MaskedEmailSetResponse>(
    [MASKED_EMAIL_CAPABILITY],
    "MaskedEmail/set",
    {
      accountId,
      ifInState: args.ifInState,
      create: args.create,
      update: args.update,
      destroy: args.destroy,
    },
  );
}
