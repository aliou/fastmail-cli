/**
 * Tests for JMAP MaskedEmail methods.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { JmapClient } from "./client.ts";
import {
  getMaskedEmails,
  MASKED_EMAIL_CAPABILITY,
  setMaskedEmails,
} from "./masked-email.ts";

// Mock session with MaskedEmail capability
const mockSession = {
  capabilities: {
    "urn:ietf:params:jmap:core": {
      maxSizeUpload: 50000000,
      maxConcurrentUpload: 8,
      maxSizeRequest: 10000000,
      maxConcurrentRequests: 8,
      maxCallsInRequest: 32,
      maxObjectsInGet: 500,
      maxObjectsInSet: 500,
      collationAlgorithms: ["i;ascii-casemap", "i;unicode-casemap"],
    },
    "urn:ietf:params:jmap:mail": {
      maxMailboxesPerEmail: 1000,
      maxMailboxDepth: 10,
      maxSizeMailboxName: 490,
      maxSizeAttachmentsPerEmail: 50000000,
      emailQuerySortOptions: [
        "receivedAt",
        "sentAt",
        "size",
        "from",
        "to",
        "subject",
      ],
      mayCreateTopLevelMailbox: true,
    },
    [MASKED_EMAIL_CAPABILITY]: {},
  },
  accounts: {
    "account-123": {
      name: "test@example.com",
      isPersonal: true,
      isReadOnly: false,
      accountCapabilities: {
        "urn:ietf:params:jmap:core": {},
        "urn:ietf:params:jmap:mail": {},
        [MASKED_EMAIL_CAPABILITY]: {},
      },
    },
  },
  primaryAccounts: {
    "urn:ietf:params:jmap:core": "account-123",
    "urn:ietf:params:jmap:mail": "account-123",
    [MASKED_EMAIL_CAPABILITY]: "account-123",
  },
  username: "test@example.com",
  apiUrl: "https://api.fastmail.com/jmap/api/",
  downloadUrl:
    "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}",
  uploadUrl: "https://api.fastmail.com/jmap/upload/{accountId}/",
  eventSourceUrl:
    "https://api.fastmail.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
  state: "session-state-123",
};

function createMockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  // Reset any previous spies
  fetchSpy?.mockRestore?.();
});

afterEach(() => {
  fetchSpy?.mockRestore?.();
});

describe("MaskedEmail methods", () => {
  describe("getMaskedEmails", () => {
    test("fetches all masked emails", async () => {
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
              "MaskedEmail/get",
              {
                accountId: "account-123",
                state: "cyrus-123;p-5",
                list: [
                  {
                    id: "masked-email-id-1",
                    email: "abc123_example@masked.fastmail.com",
                    state: "enabled",
                    forDomain: "https://www.example.com",
                    description: "Example signup",
                    lastMessageAt: "2024-01-15T10:30:00Z",
                    createdAt: "2024-01-10T14:22:00Z",
                    createdBy: "1Password",
                    url: "com.1password://item/masked-emails/id-1",
                  },
                  {
                    id: "masked-email-id-2",
                    email: "xyz789_test@masked.fastmail.com",
                    state: "pending",
                    forDomain: "https://test.org",
                    description: "Test account",
                    lastMessageAt: null,
                    createdAt: "2024-01-20T09:15:00Z",
                    createdBy: "My App",
                    url: null,
                  },
                ],
                notFound: [],
              },
              callId,
            ],
          ],
          sessionState: "session-state-123",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getMaskedEmails(client);

      expect(result.accountId).toBe("account-123");
      expect(result.state).toBe("cyrus-123;p-5");
      expect(result.list).toHaveLength(2);
      expect(result.list[0]?.email).toBe("abc123_example@masked.fastmail.com");
      expect(result.list[0]?.state).toBe("enabled");
      expect(result.list[0]?.forDomain).toBe("https://www.example.com");
      expect(result.list[1]?.state).toBe("pending");
      expect(result.list[1]?.lastMessageAt).toBeNull();
    });

    test("fetches specific masked emails by IDs", async () => {
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
              "MaskedEmail/get",
              {
                accountId: "account-123",
                state: "cyrus-123;p-6",
                list: [
                  {
                    id: "masked-email-id-1",
                    email: "abc123_example@masked.fastmail.com",
                    state: "enabled",
                    forDomain: "https://www.example.com",
                    description: "Example signup",
                    lastMessageAt: "2024-01-15T10:30:00Z",
                    createdAt: "2024-01-10T14:22:00Z",
                    createdBy: "1Password",
                    url: null,
                  },
                ],
                notFound: [],
              },
              callId,
            ],
          ],
          sessionState: "session-state-123",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getMaskedEmails(client, {
        ids: ["masked-email-id-1"],
      });

      expect(result.list).toHaveLength(1);
      expect(result.list[0]?.id).toBe("masked-email-id-1");
    });

    test("returns notFound for missing IDs", async () => {
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
              "MaskedEmail/get",
              {
                accountId: "account-123",
                state: "cyrus-123;p-7",
                list: [],
                notFound: ["masked-email-id-999"],
              },
              callId,
            ],
          ],
          sessionState: "session-state-123",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getMaskedEmails(client, {
        ids: ["masked-email-id-999"],
      });

      expect(result.list).toHaveLength(0);
      expect(result.notFound).toContain("masked-email-id-999");
    });
  });

  describe("setMaskedEmails", () => {
    test("creates a masked email", async () => {
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
              "MaskedEmail/set",
              {
                accountId: "account-123",
                oldState: "cyrus-123;p-5",
                newState: "cyrus-123;p-8",
                created: {
                  "new-masked-1": {
                    id: "masked-email-id-3",
                    email: "github_signup_abc123@masked.fastmail.com",
                    state: "pending",
                    forDomain: "https://github.com",
                    description: "GitHub account",
                    lastMessageAt: null,
                    createdAt: "2024-01-21T11:45:00Z",
                    createdBy: "FastMail CLI",
                    url: null,
                  },
                },
                updated: {},
                destroyed: [],
                notCreated: {},
                notUpdated: {},
                notDestroyed: {},
              },
              callId,
            ],
          ],
          sessionState: "session-state-124",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setMaskedEmails(client, {
        create: {
          "new-masked-1": {
            emailPrefix: "github_signup",
            state: "pending",
            forDomain: "https://github.com",
            description: "GitHub account",
          },
        },
      });

      expect(result.created?.["new-masked-1"]?.id).toBe("masked-email-id-3");
      expect(result.created?.["new-masked-1"]?.email).toBe(
        "github_signup_abc123@masked.fastmail.com",
      );
      expect(result.created?.["new-masked-1"]?.state).toBe("pending");
      expect(result.newState).toBe("cyrus-123;p-8");
    });

    test("updates a masked email", async () => {
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
              "MaskedEmail/set",
              {
                accountId: "account-123",
                oldState: "cyrus-123;p-8",
                newState: "cyrus-123;p-9",
                created: {},
                updated: {
                  "masked-email-id-1": {},
                },
                destroyed: [],
                notCreated: {},
                notUpdated: {},
                notDestroyed: {},
              },
              callId,
            ],
          ],
          sessionState: "session-state-125",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setMaskedEmails(client, {
        update: {
          "masked-email-id-1": {
            state: "disabled",
            description: "Updated description",
          },
        },
      });

      expect(result.updated?.["masked-email-id-1"]).toBeDefined();
      expect(result.newState).toBe("cyrus-123;p-9");
    });

    test("destroys a masked email", async () => {
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
              "MaskedEmail/set",
              {
                accountId: "account-123",
                oldState: "cyrus-123;p-9",
                newState: "cyrus-123;p-10",
                created: {},
                updated: {},
                destroyed: ["masked-email-id-2"],
                notCreated: {},
                notUpdated: {},
                notDestroyed: {},
              },
              callId,
            ],
          ],
          sessionState: "session-state-126",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setMaskedEmails(client, {
        destroy: ["masked-email-id-2"],
      });

      expect(result.destroyed).toContain("masked-email-id-2");
      expect(result.newState).toBe("cyrus-123;p-10");
    });

    test("handles rate limit error", async () => {
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
              "MaskedEmail/set",
              {
                accountId: "account-123",
                oldState: "cyrus-123;p-10",
                newState: "cyrus-123;p-10",
                created: {},
                updated: {},
                destroyed: [],
                notCreated: {
                  "new-masked-2": {
                    type: "rateLimit",
                    description:
                      "Rate limit exceeded. Please wait before creating more masked emails.",
                  },
                },
                notUpdated: {},
                notDestroyed: {},
              },
              callId,
            ],
          ],
          sessionState: "session-state-127",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setMaskedEmails(client, {
        create: {
          "new-masked-2": {
            forDomain: "https://example.com",
            description: "Test",
          },
        },
      });

      expect(result.notCreated?.["new-masked-2"]?.type).toBe("rateLimit");
      expect(result.notCreated?.["new-masked-2"]?.description).toContain(
        "Rate limit",
      );
    });
  });

  describe("capability checking", () => {
    test("throws error when masked email capability not available", async () => {
      // Mock session without masked email capability
      const sessionWithoutMasked = {
        ...mockSession,
        capabilities: {
          "urn:ietf:params:jmap:core":
            mockSession.capabilities["urn:ietf:params:jmap:core"],
          "urn:ietf:params:jmap:mail":
            mockSession.capabilities["urn:ietf:params:jmap:mail"],
          // Note: no MASKED_EMAIL_CAPABILITY
        },
        accounts: {
          "account-123": {
            ...mockSession.accounts["account-123"],
            accountCapabilities: {
              "urn:ietf:params:jmap:core": {},
              "urn:ietf:params:jmap:mail": {},
              // Note: no MASKED_EMAIL_CAPABILITY
            },
          },
        },
        primaryAccounts: {
          "urn:ietf:params:jmap:core": "account-123",
          "urn:ietf:params:jmap:mail": "account-123",
          // Note: no MASKED_EMAIL_CAPABILITY
        },
      };

      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
        return createMockResponse(sessionWithoutMasked);
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });

      // getPrimaryAccountId should throw when capability is missing
      await expect(
        client.getPrimaryAccountId(MASKED_EMAIL_CAPABILITY),
      ).rejects.toThrow();
    });
  });
});
