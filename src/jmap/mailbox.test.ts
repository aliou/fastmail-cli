/**
 * Tests for JMAP Mailbox methods.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { JmapClient } from "./client.ts";
import { getMailboxes, queryMailboxes, setMailboxes } from "./mailbox.ts";

// Mock session
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
  },
  accounts: {
    "account-123": {
      name: "test@example.com",
      isPersonal: true,
      isReadOnly: false,
      accountCapabilities: {
        "urn:ietf:params:jmap:core": {},
        "urn:ietf:params:jmap:mail": {},
      },
    },
  },
  primaryAccounts: {
    "urn:ietf:params:jmap:core": "account-123",
    "urn:ietf:params:jmap:mail": "account-123",
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

describe("Mailbox methods", () => {
  describe("getMailboxes", () => {
    test("fetches all mailboxes", async () => {
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
              "Mailbox/get",
              {
                accountId: "account-123",
                state: "78540",
                list: [
                  {
                    id: "MB23cfa8094c0f41e6",
                    name: "Inbox",
                    parentId: null,
                    role: "inbox",
                    sortOrder: 10,
                    totalEmails: 16307,
                    unreadEmails: 13905,
                    totalThreads: 5833,
                    unreadThreads: 5128,
                    myRights: {
                      mayReadItems: true,
                      mayAddItems: true,
                      mayRemoveItems: true,
                      maySetSeen: true,
                      maySetKeywords: true,
                      mayCreateChild: true,
                      mayRename: false,
                      mayDelete: false,
                      maySubmit: true,
                    },
                    isSubscribed: true,
                  },
                  {
                    id: "MB674cc24095db49ce",
                    name: "Sent",
                    parentId: null,
                    role: "sent",
                    sortOrder: 20,
                    totalEmails: 1234,
                    unreadEmails: 0,
                    totalThreads: 1234,
                    unreadThreads: 0,
                    myRights: {
                      mayReadItems: true,
                      mayAddItems: true,
                      mayRemoveItems: true,
                      maySetSeen: true,
                      maySetKeywords: true,
                      mayCreateChild: true,
                      mayRename: false,
                      mayDelete: false,
                      maySubmit: true,
                    },
                    isSubscribed: true,
                  },
                ],
                notFound: [],
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1b",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getMailboxes(client);

      expect(result.accountId).toBe("account-123");
      expect(result.state).toBe("78540");
      expect(result.list).toHaveLength(2);
      expect(result.list[0]?.name).toBe("Inbox");
      expect(result.list[0]?.role).toBe("inbox");
      expect(result.list[0]?.totalEmails).toBe(16307);
      expect(result.list[0]?.unreadEmails).toBe(13905);
    });

    test("fetches specific mailboxes by IDs", async () => {
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
              "Mailbox/get",
              {
                accountId: "account-123",
                state: "78540",
                list: [
                  {
                    id: "MB23cfa8094c0f41e6",
                    name: "Inbox",
                    parentId: null,
                    role: "inbox",
                    sortOrder: 10,
                    totalEmails: 100,
                    unreadEmails: 5,
                    totalThreads: 80,
                    unreadThreads: 3,
                    myRights: {
                      mayReadItems: true,
                      mayAddItems: true,
                      mayRemoveItems: true,
                      maySetSeen: true,
                      maySetKeywords: true,
                      mayCreateChild: true,
                      mayRename: false,
                      mayDelete: false,
                      maySubmit: true,
                    },
                    isSubscribed: true,
                  },
                ],
                notFound: [],
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1b",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getMailboxes(client, {
        ids: ["MB23cfa8094c0f41e6"],
      });

      expect(result.list).toHaveLength(1);
      expect(result.list[0]?.id).toBe("MB23cfa8094c0f41e6");
    });
  });

  describe("queryMailboxes", () => {
    test("queries mailboxes with filter", async () => {
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
              "Mailbox/query",
              {
                accountId: "account-123",
                queryState: "780545",
                canCalculateChanges: true,
                position: 0,
                total: 2,
                ids: ["MB23cfa8094c0f41e6", "MB674cc24095db49ce"],
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1b",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await queryMailboxes(client, {
        filter: { isSubscribed: true },
      });

      expect(result.accountId).toBe("account-123");
      expect(result.queryState).toBe("780545");
      expect(result.ids).toHaveLength(2);
    });

    test("queries mailboxes with sort", async () => {
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
              "Mailbox/query",
              {
                accountId: "account-123",
                queryState: "780546",
                canCalculateChanges: true,
                position: 0,
                ids: ["MB674cc24095db49ce", "MB23cfa8094c0f41e6"],
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1b",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await queryMailboxes(client, {
        sort: [{ property: "name", isAscending: true }],
      });

      expect(result.ids).toHaveLength(2);
    });
  });

  describe("setMailboxes", () => {
    test("creates a mailbox", async () => {
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
              "Mailbox/set",
              {
                accountId: "account-123",
                oldState: "78542",
                newState: "78549",
                created: {
                  newMailbox: {
                    id: "MB99newid123",
                  },
                },
                notCreated: null,
                notUpdated: null,
                notDestroyed: null,
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1c",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setMailboxes(client, {
        create: {
          newMailbox: {
            name: "Project X",
            sortOrder: 20,
          },
        },
      });

      expect(result.created?.newMailbox?.id).toBe("MB99newid123");
      expect(result.newState).toBe("78549");
    });

    test("updates a mailbox", async () => {
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
              "Mailbox/set",
              {
                accountId: "account-123",
                oldState: "78542",
                newState: "78543",
                updated: {
                  MB674cc24095db49ce: null,
                },
                notCreated: null,
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
      const result = await setMailboxes(client, {
        update: {
          MB674cc24095db49ce: {
            name: "Updated Name",
          },
        },
      });

      expect(result.updated?.MB674cc24095db49ce).toBeDefined();
      expect(result.newState).toBe("78543");
    });

    test("destroys a mailbox", async () => {
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
              "Mailbox/set",
              {
                accountId: "account-123",
                oldState: "78542",
                newState: "78544",
                destroyed: ["MB674cc24095db49ce"],
                notCreated: null,
                notUpdated: null,
                notDestroyed: null,
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1e",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setMailboxes(client, {
        destroy: ["MB674cc24095db49ce"],
      });

      expect(result.destroyed).toContain("MB674cc24095db49ce");
      expect(result.newState).toBe("78544");
    });

    test("handles mailboxHasEmail error", async () => {
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
              "Mailbox/set",
              {
                accountId: "account-123",
                oldState: "78542",
                newState: "78542",
                notDestroyed: {
                  MB23cfa8094c0f41e6: {
                    type: "mailboxHasEmail",
                    description: "Mailbox contains emails",
                  },
                },
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1f",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setMailboxes(client, {
        destroy: ["MB23cfa8094c0f41e6"],
        onDestroyRemoveEmails: false,
      });

      expect(result.notDestroyed?.MB23cfa8094c0f41e6?.type).toBe(
        "mailboxHasEmail",
      );
    });
  });
});
