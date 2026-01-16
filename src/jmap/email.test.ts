import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { JmapClient } from "./client.ts";
import { getEmails, queryEmails, setEmails } from "./email.ts";
import { JMAP_MAIL_CAPABILITY } from "./types.ts";

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
        [JMAP_MAIL_CAPABILITY]: {},
      },
    },
  },
  primaryAccounts: {
    [JMAP_MAIL_CAPABILITY]: "account-123",
  },
  capabilities: {
    [JMAP_MAIL_CAPABILITY]: {},
  },
};

function createMockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Email methods", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  describe("queryEmails", () => {
    test("queries emails with filter and sort", async () => {
      // Mock Email/query response based on JMAP Mail spec
      // See: https://jmap.io/spec-mail.html#email-query
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
              "Email/query",
              {
                accountId: "account-123",
                queryState: "09aa9a075588-780599:0",
                canCalculateChanges: true,
                position: 0,
                ids: ["email-1", "email-2", "email-3"],
                total: 3,
              },
              callId,
            ],
          ],
          sessionState: "cyrus-1;fsdb-2;vfs-3",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await queryEmails(client, {
        filter: { inMailbox: "mailbox-1" },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit: 10,
      });

      expect(result.accountId).toBe("account-123");
      expect(result.ids).toEqual(["email-1", "email-2", "email-3"]);
      expect(result.total).toBe(3);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("queries unread emails", async () => {
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
              "Email/query",
              {
                accountId: "account-123",
                queryState: "email-query-state-2",
                canCalculateChanges: true,
                position: 0,
                ids: ["email-4"],
                total: 1,
              },
              callId,
            ],
          ],
          sessionState: "session-state-123",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await queryEmails(client, {
        filter: { notKeyword: "$seen" },
      });

      expect(result.ids).toEqual(["email-4"]);
      expect(result.total).toBe(1);
    });
  });

  describe("getEmails", () => {
    test("gets emails by IDs with properties", async () => {
      // Mock Email/get response based on JMAP Mail spec
      // See: https://jmap.io/spec-mail.html#email-get
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
              "Email/get",
              {
                accountId: "account-123",
                state: "41234123231",
                list: [
                  {
                    id: "email-1",
                    blobId: "G40b5f831efa7233b9eb1c7f",
                    threadId: "thread-1",
                    mailboxIds: { "mailbox-1": true },
                    keywords: { $seen: true, $flagged: false },
                    size: 175047,
                    receivedAt: "2013-10-13T14:12:00Z",
                    sentAt: "2013-10-13T14:00:00Z",
                    subject: "Test Email",
                    from: [{ name: "Sender", email: "sender@example.com" }],
                    to: [{ name: "Recipient", email: "recipient@example.com" }],
                    preview: "This is a test email preview...",
                    hasAttachment: false,
                    messageId: ["<test-email-1@example.com>"],
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
      const result = await getEmails(client, {
        ids: ["email-1"],
        properties: ["id", "subject", "from", "receivedAt"],
      });

      expect(result.accountId).toBe("account-123");
      expect(result.list).toHaveLength(1);
      expect(result.list[0]?.subject).toBe("Test Email");
      expect(result.list[0]?.from?.[0]?.email).toBe("sender@example.com");
      expect(result.notFound).toEqual([]);
    });

    test("gets emails with body values", async () => {
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
              "Email/get",
              {
                accountId: "account-123",
                state: "41234123232",
                list: [
                  {
                    id: "email-2",
                    blobId: "G40b5f831efa7233b9eb1c7e",
                    threadId: "thread-2",
                    mailboxIds: { "mailbox-1": true },
                    keywords: { $seen: true },
                    size: 283331,
                    receivedAt: "2025-01-16T12:00:00Z",
                    sentAt: "2025-01-16T11:55:00Z",
                    subject: "Email with Body",
                    from: [{ name: "Alice", email: "alice@example.com" }],
                    to: [{ name: "Bob", email: "bob@example.com" }],
                    preview: "Hello, this is the email body preview...",
                    hasAttachment: false,
                    bodyValues: {
                      "1": {
                        value: "Hello, this is the email body.",
                        isEncodingProblem: false,
                        isTruncated: false,
                      },
                    },
                    textBody: [
                      {
                        partId: "1",
                        blobId: "B841623871",
                        size: 283331,
                        type: "text/plain",
                      },
                    ],
                    htmlBody: [
                      {
                        partId: "2",
                        blobId: "B841623872",
                        size: 283332,
                        type: "text/html",
                      },
                    ],
                  },
                ],
                notFound: [],
              },
              callId,
            ],
          ],
          sessionState: "75128aab4b1c",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getEmails(client, {
        ids: ["email-2"],
        fetchTextBodyValues: true,
      });

      expect(result.list[0]?.bodyValues?.["1"]?.value).toBe(
        "Hello, this is the email body.",
      );
      expect(result.list[0]?.textBody?.[0]?.partId).toBe("1");
    });

    test("returns notFound for missing emails", async () => {
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
              "Email/get",
              {
                accountId: "account-123",
                state: "email-state-3",
                list: [],
                notFound: ["email-999"],
              },
              callId,
            ],
          ],
          sessionState: "session-state-123",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getEmails(client, {
        ids: ["email-999"],
      });

      expect(result.list).toHaveLength(0);
      expect(result.notFound).toEqual(["email-999"]);
    });
  });

  describe("setEmails", () => {
    test("updates email keywords", async () => {
      // Mock Email/set response based on JMAP Mail spec
      // See: https://jmap.io/spec-mail.html#email-set
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
              "Email/set",
              {
                accountId: "account-123",
                oldState: "780823",
                newState: "780839",
                updated: {
                  "email-1": null, // null indicates success without returning full object
                },
                notUpdated: null,
                notDestroyed: null,
              },
              callId,
            ],
          ],
          sessionState: "78542",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setEmails(client, {
        update: {
          "email-1": {
            keywords: { $seen: true, $flagged: true },
          },
        },
      });

      expect(result.accountId).toBe("account-123");
      expect(result.updated?.["email-1"]).toBeDefined();
      expect(result.newState).toBe("780839");
    });

    test("creates draft email", async () => {
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
              "Email/set",
              {
                accountId: "account-123",
                oldState: "780823",
                newState: "780840",
                created: {
                  draft: {
                    id: "Mf40b5f831efa7233b9eb1c7f",
                    blobId: "Gf40b5f831efa7233b9eb1c7f8f97d84eeeee64f7",
                    threadId: "Td957e72e89f516dc",
                    size: 234,
                  },
                },
                notCreated: null,
                notUpdated: null,
                notDestroyed: null,
              },
              callId,
            ],
          ],
          sessionState: "78543",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setEmails(client, {
        create: {
          draft: {
            mailboxIds: { "drafts-mailbox": true },
            keywords: { $draft: true },
            from: [{ email: "me@example.com" }],
            to: [{ email: "you@example.com" }],
            subject: "Draft email",
          },
        },
      });

      expect(result.created?.draft?.id).toBe("Mf40b5f831efa7233b9eb1c7f");
      expect(result.newState).toBe("780840");
    });

    test("destroys emails", async () => {
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
              "Email/set",
              {
                accountId: "account-123",
                oldState: "780823",
                newState: "780841",
                destroyed: ["email-1", "email-2"],
                notCreated: null,
                notUpdated: null,
                notDestroyed: null,
              },
              callId,
            ],
          ],
          sessionState: "78544",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await setEmails(client, {
        destroy: ["email-1", "email-2"],
      });

      expect(result.destroyed).toEqual(["email-1", "email-2"]);
    });
  });
});
