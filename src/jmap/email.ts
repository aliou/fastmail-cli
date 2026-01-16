/**
 * JMAP Email methods (RFC 8621).
 * Email/query, Email/get, Email/set.
 */

import type { JmapClient } from "./client.ts";
import { JMAP_MAIL_CAPABILITY } from "./types.ts";

/**
 * Email address object.
 */
export interface EmailAddress {
  name?: string;
  email: string;
}

/**
 * Email header.
 */
export interface EmailHeader {
  name: string;
  value: string;
}

/**
 * Email body part.
 */
export interface EmailBodyPart {
  partId?: string;
  blobId?: string;
  size?: number;
  name?: string;
  type?: string;
  charset?: string;
  disposition?: string;
  cid?: string;
  language?: string[];
  location?: string;
  subParts?: EmailBodyPart[];
}

/**
 * Email body value.
 */
export interface EmailBodyValue {
  value: string;
  isEncodingProblem?: boolean;
  isTruncated?: boolean;
}

/**
 * Email object from JMAP.
 */
export interface Email {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  size: number;
  receivedAt: string;
  messageId?: string[];
  inReplyTo?: string[];
  references?: string[];
  sender?: EmailAddress[];
  from?: EmailAddress[];
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress[];
  subject?: string;
  sentAt?: string;
  hasAttachment?: boolean;
  preview?: string;
  bodyStructure?: EmailBodyPart;
  bodyValues?: Record<string, EmailBodyValue>;
  textBody?: EmailBodyPart[];
  htmlBody?: EmailBodyPart[];
  attachments?: EmailBodyPart[];
  headers?: EmailHeader[];
}

/**
 * Filter condition for Email/query.
 */
export interface EmailFilterCondition {
  inMailbox?: string;
  inMailboxOtherThan?: string[];
  before?: string;
  after?: string;
  minSize?: number;
  maxSize?: number;
  allInThreadHaveKeyword?: string;
  someInThreadHaveKeyword?: string;
  noneInThreadHaveKeyword?: string;
  hasKeyword?: string;
  notKeyword?: string;
  hasAttachment?: boolean;
  text?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  header?: string[];
}

/**
 * Composite filter operator.
 */
export interface EmailFilterOperator {
  operator: "AND" | "OR" | "NOT";
  conditions: (EmailFilterCondition | EmailFilterOperator)[];
}

export type EmailFilter = EmailFilterCondition | EmailFilterOperator;

/**
 * Comparator for Email/query sort.
 */
export interface Comparator {
  property: string;
  isAscending?: boolean;
  collation?: string;
}

/**
 * Arguments for Email/query.
 */
export interface EmailQueryArgs {
  accountId: string;
  filter?: EmailFilter;
  sort?: Comparator[];
  position?: number;
  anchor?: string;
  anchorOffset?: number;
  limit?: number;
  calculateTotal?: boolean;
}

/**
 * Response from Email/query.
 */
export interface EmailQueryResponse extends Record<string, unknown> {
  accountId: string;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: string[];
  total?: number;
  limit?: number;
}

/**
 * Arguments for Email/get.
 */
export interface EmailGetArgs {
  accountId: string;
  ids?: string[];
  properties?: string[];
  bodyProperties?: string[];
  fetchTextBodyValues?: boolean;
  fetchHTMLBodyValues?: boolean;
  fetchAllBodyValues?: boolean;
  maxBodyValueBytes?: number;
}

/**
 * Response from Email/get.
 */
export interface EmailGetResponse extends Record<string, unknown> {
  accountId: string;
  state: string;
  list: Email[];
  notFound: string[];
}

/**
 * Arguments for Email/set.
 */
export interface EmailSetArgs {
  accountId: string;
  ifInState?: string;
  create?: Record<string, Partial<Email>>;
  update?: Record<string, Partial<Email>>;
  destroy?: string[];
}

/**
 * Response from Email/set.
 */
export interface EmailSetResponse extends Record<string, unknown> {
  accountId: string;
  oldState?: string;
  newState: string;
  created?: Record<string, Email>;
  updated?: Record<string, Email | null>;
  destroyed?: string[];
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
}

/**
 * Query emails with filter and sort options.
 */
export async function queryEmails(
  client: JmapClient,
  args: Omit<EmailQueryArgs, "accountId">,
): Promise<EmailQueryResponse> {
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  return await client.call<EmailQueryResponse>(
    [JMAP_MAIL_CAPABILITY],
    "Email/query",
    {
      accountId,
      ...args,
    },
  );
}

/**
 * Get email details by IDs.
 */
export async function getEmails(
  client: JmapClient,
  args: Omit<EmailGetArgs, "accountId">,
): Promise<EmailGetResponse> {
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  return await client.call<EmailGetResponse>(
    [JMAP_MAIL_CAPABILITY],
    "Email/get",
    {
      accountId,
      ...args,
    },
  );
}

/**
 * Create, update, or delete emails.
 */
export async function setEmails(
  client: JmapClient,
  args: Omit<EmailSetArgs, "accountId">,
): Promise<EmailSetResponse> {
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  return await client.call<EmailSetResponse>(
    [JMAP_MAIL_CAPABILITY],
    "Email/set",
    {
      accountId,
      ...args,
    },
  );
}
