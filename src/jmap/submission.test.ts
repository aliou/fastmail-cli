import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { JmapClient } from "./client.ts";
import { setEmailSubmissions } from "./submission.ts";
import { JMAP_SUBMISSION_CAPABILITY } from "./types.ts";

// Mock session based on JMAP spec
const mockSession = {
  username: "test@fastmail.com",
  apiUrl: "https://api.fastmail.com/jmap/api/",
  downloadUrl:
    "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}",
  uploadUrl: "https://api.fastmail.com/jmap/upload/{accountId}/",
  eventSourceUrl: "https://api.fastmail.com/jmap/eventsource/",
  state: "session-state-123",
  accounts: {
    "account-123": {
      name: "test@fastmail.com",
      isPersonal: true,
      isReadOnly: false,
      accountCapabilities: {
        [JMAP_SUBMISSION_CAPABILITY]: {},
      },
    },
  },
  primaryAccounts: {
    [JMAP_SUBMISSION_CAPABILITY]: "account-123",
  },
  capabilities: {
    [JMAP_SUBMISSION_CAPABILITY]: {},
  },
};

function createMockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EmailSubmission methods", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  describe("setEmailSubmissions", () => {
    test("submits email for sending", async () => {
      // Mock EmailSubmission/set response based on JMAP Mail spec
      // See: https://jmap.io/spec-mail.html#emailsubmission-set
      let callCount = 0;
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
        _url: unknown,
        options: RequestInit | undefined,
      ) => {
        callCount++;
        if (callCount === 1) {
          return createMockResponse(mockSession);
        }
        const body = JSON.parse(options?.body as string);
        const callId = body.methodCalls[0][2];
        return createMockResponse({
          methodResponses: [
            [
              "EmailSubmission/set",
              {
                accountId: "account-123",
                oldState: "012421s6-8nrq-4ps4-n0p4-9330r951ns21",
                newState: "355421f6-8aed-4cf4-a0c4-7377e951af36",
                created: {
                  send: {
                    id: "ES-3bab7f9a-623e-4acf-99a5-2e67facb02a0",
                    identityId: "identity-1",
                    emailId: "email-1",
                    threadId: "thread-1",
                    undoStatus: "final",
                    sendAt: "2025-01-16T14:00:00Z",
                  },
                },
                notCreated: null,
              },
              callId,
            ],
            [
              "Email/set",
              {
                accountId: "account-123",
                oldState: "778193",
                newState: "778197",
                updated: {
                  "email-1": null,
                },
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1b",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setEmailSubmissions(client, {
        create: {
          send: {
            identityId: "identity-1",
            emailId: "email-1",
          },
        },
      });

      expect(result.accountId).toBe("account-123");
      expect(result.created?.send?.id).toBe(
        "ES-3bab7f9a-623e-4acf-99a5-2e67facb02a0",
      );
      expect(result.created?.send?.emailId).toBe("email-1");
      expect(result.created?.send?.undoStatus).toBe("final");
    });

    test("submits email and destroys draft on success", async () => {
      let callCount = 0;
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
        _url: unknown,
        options: RequestInit | undefined,
      ) => {
        callCount++;
        if (callCount === 1) {
          return createMockResponse(mockSession);
        }
        const body = JSON.parse(options?.body as string);
        const callId = body.methodCalls[0][2];
        return createMockResponse({
          methodResponses: [
            [
              "EmailSubmission/set",
              {
                accountId: "account-123",
                oldState: "012421s6-8nrq-4ps4-n0p4-9330r951ns22",
                newState: "355421f6-8aed-4cf4-a0c4-7377e951af37",
                created: {
                  send: {
                    id: "ES-3bab7f9a-623e-4acf-99a5-2e67facb02a1",
                    identityId: "identity-1",
                    emailId: "draft-email",
                    threadId: "thread-2",
                    undoStatus: "final",
                    sendAt: "2025-01-16T14:05:00Z",
                  },
                },
                notCreated: null,
              },
              callId,
            ],
            [
              "Email/set",
              {
                accountId: "account-123",
                oldState: "778194",
                newState: "778198",
                updated: {
                  "draft-email": null,
                },
                destroyed: ["draft-email"],
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1c",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setEmailSubmissions(client, {
        create: {
          send: {
            identityId: "identity-1",
            emailId: "draft-email",
          },
        },
        onSuccessDestroyEmail: ["draft-email"],
      });

      expect(result.created?.send?.emailId).toBe("draft-email");
    });

    test("handles submission failure", async () => {
      let callCount = 0;
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
        _url: unknown,
        options: RequestInit | undefined,
      ) => {
        callCount++;
        if (callCount === 1) {
          return createMockResponse(mockSession);
        }
        const body = JSON.parse(options?.body as string);
        const callId = body.methodCalls[0][2];
        return createMockResponse({
          methodResponses: [
            [
              "EmailSubmission/set",
              {
                accountId: "account-123",
                oldState: "012421s6-8nrq-4ps4-n0p4-9330r951ns23",
                newState: "355421f6-8aed-4cf4-a0c4-7377e951af38",
                notCreated: {
                  send: {
                    type: "invalidEmail",
                    description: "Email does not exist",
                    properties: ["emailId"],
                  },
                },
                notUpdated: null,
                notDestroyed: null,
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1d",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setEmailSubmissions(client, {
        create: {
          send: {
            identityId: "identity-1",
            emailId: "nonexistent-email",
          },
        },
      });

      expect(result.notCreated?.send?.type).toBe("invalidEmail");
      expect(result.notCreated?.send?.description).toBe("Email does not exist");
    });

    test("cancels email submission", async () => {
      let callCount = 0;
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
        _url: unknown,
        options: RequestInit | undefined,
      ) => {
        callCount++;
        if (callCount === 1) {
          return createMockResponse(mockSession);
        }
        const body = JSON.parse(options?.body as string);
        const callId = body.methodCalls[0][2];
        return createMockResponse({
          methodResponses: [
            [
              "EmailSubmission/set",
              {
                accountId: "account-123",
                oldState: "012421s6-8nrq-4ps4-n0p4-9330r951ns24",
                newState: "355421f6-8aed-4cf4-a0c4-7377e951af39",
                updated: {
                  "submission-1": {
                    undoStatus: "canceled",
                  },
                },
                notUpdated: null,
                notCreated: null,
                notDestroyed: null,
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1e",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setEmailSubmissions(client, {
        update: {
          "submission-1": {
            undoStatus: "canceled",
          },
        },
      });

      expect(result.updated?.["submission-1"]?.undoStatus).toBe("canceled");
    });
  });
});
