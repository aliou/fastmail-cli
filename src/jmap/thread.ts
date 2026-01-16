/**
 * JMAP Thread methods (RFC 8621).
 * Thread/get, Thread/changes.
 */

import type { JmapClient } from "./client.ts";
import { JMAP_MAIL_CAPABILITY } from "./types.ts";

/**
 * Thread object from JMAP.
 */
export interface Thread {
  id: string;
  emailIds: string[];
}

/**
 * Arguments for Thread/get.
 */
export interface ThreadGetArgs {
  accountId?: string;
  ids: string[];
  properties?: string[];
}

/**
 * Response from Thread/get.
 */
export interface ThreadGetResponse extends Record<string, unknown> {
  accountId: string;
  state: string;
  list: Thread[];
  notFound: string[];
}

/**
 * Get threads by IDs.
 */
export async function getThreads(
  client: JmapClient,
  args: Omit<ThreadGetArgs, "accountId">,
): Promise<ThreadGetResponse> {
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  return await client.call<ThreadGetResponse>(
    [JMAP_MAIL_CAPABILITY],
    "Thread/get",
    {
      accountId,
      ...args,
    },
  );
}
