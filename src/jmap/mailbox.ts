/**
 * JMAP Mailbox methods.
 * See: https://jmap.io/spec-mail.html#mailboxes
 */

import type { JmapClient } from "./client.ts";
import { JMAP_MAIL_CAPABILITY } from "./types.ts";

/**
 * Mailbox rights (ACL permissions).
 */
export interface MailboxRights {
  mayReadItems: boolean;
  mayAddItems: boolean;
  mayRemoveItems: boolean;
  maySetSeen: boolean;
  maySetKeywords: boolean;
  mayCreateChild: boolean;
  mayRename: boolean;
  mayDelete: boolean;
  maySubmit: boolean;
}

/**
 * Mailbox object.
 */
export interface Mailbox {
  id: string;
  name: string;
  parentId: string | null;
  role: string | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  myRights: MailboxRights;
  isSubscribed: boolean;
}

/**
 * Mailbox/query filter.
 */
export interface MailboxFilter {
  parentId?: string | null;
  name?: string;
  role?: string;
  hasAnyRole?: boolean;
  isSubscribed?: boolean;
}

/**
 * Mailbox/get arguments.
 */
export interface MailboxGetArgs {
  accountId?: string;
  ids?: string[] | null;
  properties?: string[];
}

/**
 * Mailbox/get response.
 */
export interface MailboxGetResponse extends Record<string, unknown> {
  accountId: string;
  state: string;
  list: Mailbox[];
  notFound: string[];
}

/**
 * Mailbox/query arguments.
 */
export interface MailboxQueryArgs {
  accountId?: string;
  filter?: MailboxFilter;
  sort?: Array<{ property: string; isAscending?: boolean }>;
  position?: number;
  limit?: number;
  calculateTotal?: boolean;
  sortAsTree?: boolean;
  filterAsTree?: boolean;
}

/**
 * Mailbox/query response.
 */
export interface MailboxQueryResponse extends Record<string, unknown> {
  accountId: string;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: string[];
  total?: number;
}

/**
 * Mailbox/set arguments.
 */
export interface MailboxSetArgs {
  accountId?: string;
  ifInState?: string;
  create?: Record<
    string,
    {
      name: string;
      parentId?: string | null;
      sortOrder?: number;
      isSubscribed?: boolean;
    }
  >;
  update?: Record<
    string,
    {
      name?: string;
      parentId?: string | null;
      sortOrder?: number;
      isSubscribed?: boolean;
    }
  >;
  destroy?: string[];
  onDestroyRemoveEmails?: boolean;
}

/**
 * Mailbox/set response.
 */
export interface MailboxSetResponse extends Record<string, unknown> {
  accountId: string;
  oldState: string;
  newState: string;
  created?: Record<string, { id: string } & Partial<Mailbox>>;
  updated?: Record<string, Partial<Mailbox> | null>;
  destroyed?: string[];
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
}

/**
 * Fetch mailboxes.
 * See: https://jmap.io/spec-mail.html#mailboxget
 */
export async function getMailboxes(
  client: JmapClient,
  args: MailboxGetArgs = {},
): Promise<MailboxGetResponse> {
  const accountId =
    args.accountId ?? (await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY));

  return await client.call<MailboxGetResponse>(
    [JMAP_MAIL_CAPABILITY],
    "Mailbox/get",
    {
      accountId,
      ids: args.ids,
      properties: args.properties,
    },
  );
}

/**
 * Query mailboxes with filter and sort.
 * See: https://jmap.io/spec-mail.html#mailboxquery
 */
export async function queryMailboxes(
  client: JmapClient,
  args: MailboxQueryArgs = {},
): Promise<MailboxQueryResponse> {
  const accountId =
    args.accountId ?? (await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY));

  return await client.call<MailboxQueryResponse>(
    [JMAP_MAIL_CAPABILITY],
    "Mailbox/query",
    {
      accountId,
      filter: args.filter,
      sort: args.sort,
      position: args.position,
      limit: args.limit,
      calculateTotal: args.calculateTotal,
      sortAsTree: args.sortAsTree,
      filterAsTree: args.filterAsTree,
    },
  );
}

/**
 * Create, update, or destroy mailboxes.
 * See: https://jmap.io/spec-mail.html#mailboxset
 */
export async function setMailboxes(
  client: JmapClient,
  args: MailboxSetArgs,
): Promise<MailboxSetResponse> {
  const accountId =
    args.accountId ?? (await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY));

  return await client.call<MailboxSetResponse>(
    [JMAP_MAIL_CAPABILITY],
    "Mailbox/set",
    {
      accountId,
      ifInState: args.ifInState,
      create: args.create,
      update: args.update,
      destroy: args.destroy,
      onDestroyRemoveEmails: args.onDestroyRemoveEmails,
    },
  );
}
