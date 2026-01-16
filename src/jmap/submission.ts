/**
 * JMAP EmailSubmission methods (RFC 8621).
 * EmailSubmission/set for sending emails.
 */

import type { JmapClient } from "./client.ts";
import type { EmailAddress } from "./email.ts";
import { JMAP_MAIL_CAPABILITY, JMAP_SUBMISSION_CAPABILITY } from "./types.ts";

/**
 * Envelope address for email submission.
 */
export interface Envelope {
  mailFrom: EmailAddress;
  rcptTo: EmailAddress[];
}

/**
 * EmailSubmission object.
 */
export interface EmailSubmission {
  id?: string;
  identityId: string;
  emailId: string;
  threadId?: string;
  envelope?: Envelope;
  sendAt?: string;
  undoStatus?: "pending" | "final" | "canceled";
  deliveryStatus?: Record<string, unknown>;
  dsnBlobIds?: string[];
  mdnBlobIds?: string[];
}

/**
 * Arguments for EmailSubmission/set.
 */
export interface EmailSubmissionSetArgs {
  accountId: string;
  ifInState?: string;
  create?: Record<string, EmailSubmission>;
  update?: Record<string, Partial<EmailSubmission>>;
  destroy?: string[];
  onSuccessUpdateEmail?: Record<
    string,
    Record<string, Record<string, boolean> | null>
  >;
  onSuccessDestroyEmail?: string[];
}

/**
 * Response from EmailSubmission/set.
 */
export interface EmailSubmissionSetResponse extends Record<string, unknown> {
  accountId: string;
  oldState?: string;
  newState: string;
  created?: Record<string, EmailSubmission>;
  updated?: Record<string, EmailSubmission | null>;
  destroyed?: string[];
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
}

/**
 * Submit emails for sending.
 */
export async function setEmailSubmissions(
  client: JmapClient,
  args: Omit<EmailSubmissionSetArgs, "accountId">,
): Promise<EmailSubmissionSetResponse> {
  const accountId = await client.getPrimaryAccountId(
    JMAP_SUBMISSION_CAPABILITY,
  );

  // Include mail capability for onSuccess* options that affect Email objects
  return await client.call<EmailSubmissionSetResponse>(
    [JMAP_MAIL_CAPABILITY, JMAP_SUBMISSION_CAPABILITY],
    "EmailSubmission/set",
    {
      accountId,
      ...args,
    },
  );
}
