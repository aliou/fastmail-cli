import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  getMethodResponse,
  isMethodError,
  JmapClient,
  JmapError,
  JmapMethodError,
} from "./client.ts";
import { JMAP_CORE_CAPABILITY, JMAP_MAIL_CAPABILITY } from "./types.ts";

// Mock session response based on JMAP spec
// See: https://jmap.io/spec-core.html#the-jmap-session-resource
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
        [JMAP_CORE_CAPABILITY]: {},
        [JMAP_MAIL_CAPABILITY]: {},
      },
    },
  },
  primaryAccounts: {
    [JMAP_CORE_CAPABILITY]: "account-123",
    [JMAP_MAIL_CAPABILITY]: "account-123",
  },
  capabilities: {
    [JMAP_CORE_CAPABILITY]: {
      maxSizeUpload: 50000000,
      maxConcurrentUpload: 4,
      maxSizeRequest: 10000000,
      maxConcurrentRequests: 8,
      maxCallsInRequest: 16,
      maxObjectsInGet: 4096,
      maxObjectsInSet: 4096,
    },
    [JMAP_MAIL_CAPABILITY]: {},
  },
};

function createMockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("JmapClient", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  describe("getSession", () => {
    test("fetches and returns session", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const client = new JmapClient({ token: "test-token" });
      const session = await client.getSession();

      expect(session.username).toBe("test@fastmail.com");
      expect(session.apiUrl).toBe("https://api.fastmail.com/jmap/api/");
      expect(session.accounts["account-123"]).toBeDefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("caches session on subsequent calls", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const client = new JmapClient({ token: "test-token" });
      const session1 = await client.getSession();
      const session2 = await client.getSession();

      // Should return same cached session
      expect(session1).toBe(session2);
      // Fetch should only be called once
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("throws JmapError on failed session fetch", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse({ error: "Unauthorized" }, 401),
      );

      const client = new JmapClient({ token: "invalid-token" });

      expect(client.getSession()).rejects.toThrow(JmapError);
    });

    test("sends authorization header", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const client = new JmapClient({ token: "my-secret-token" });
      await client.getSession();

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.fastmail.com/jmap/session",
        expect.objectContaining({
          headers: {
            Authorization: "Bearer my-secret-token",
          },
        }),
      );
    });
  });

  describe("getPrimaryAccountId", () => {
    test("returns primary account ID for capability", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const client = new JmapClient({ token: "test-token" });
      const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

      expect(accountId).toBe("account-123");
    });

    test("throws for unknown capability", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const client = new JmapClient({ token: "test-token" });

      expect(
        client.getPrimaryAccountId("urn:unknown:capability"),
      ).rejects.toThrow("No primary account for capability");
    });
  });

  describe("request", () => {
    test("sends batched method calls", async () => {
      const apiResponse = {
        methodResponses: [
          ["Mailbox/get", { list: [], notFound: [] }, "call-1"],
          ["Email/query", { ids: [] }, "call-2"],
        ],
        sessionState: "session-state-123",
      };

      fetchSpy = spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(createMockResponse(mockSession))
        .mockResolvedValueOnce(createMockResponse(apiResponse));

      const client = new JmapClient({ token: "test-token" });
      const response = await client.request(
        [JMAP_CORE_CAPABILITY, JMAP_MAIL_CAPABILITY],
        [
          ["Mailbox/get", { accountId: "account-123" }, "call-1"],
          ["Email/query", { accountId: "account-123" }, "call-2"],
        ],
      );

      expect(response.methodResponses).toHaveLength(2);
      expect(response.methodResponses[0]?.[0]).toBe("Mailbox/get");
      expect(response.methodResponses[1]?.[0]).toBe("Email/query");
    });

    test("invalidates session when state changes", async () => {
      const apiResponse = {
        methodResponses: [["Mailbox/get", { list: [] }, "call-1"]],
        sessionState: "new-state-456", // Different from session state
      };

      const newSession = { ...mockSession, state: "new-state-456" };

      fetchSpy = spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(createMockResponse(mockSession)) // Initial session
        .mockResolvedValueOnce(createMockResponse(apiResponse)) // API call
        .mockResolvedValueOnce(createMockResponse(newSession)); // New session fetch

      const client = new JmapClient({ token: "test-token" });

      // First call caches session
      await client.getSession();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // This should invalidate the cached session due to state change
      await client.request(
        [JMAP_CORE_CAPABILITY],
        [["Mailbox/get", { accountId: "account-123" }, "call-1"]],
      );
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Next getSession should fetch fresh (session was invalidated)
      const session = await client.getSession();
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(session.state).toBe("new-state-456");
    });

    test("throws JmapError on API error", async () => {
      fetchSpy = spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(createMockResponse(mockSession))
        .mockResolvedValueOnce(
          createMockResponse(
            { type: "serverFail", detail: "Internal error" },
            500,
          ),
        );

      const client = new JmapClient({ token: "test-token" });

      try {
        await client.request(
          [JMAP_CORE_CAPABILITY],
          [["Mailbox/get", { accountId: "account-123" }, "call-1"]],
        );
        expect(true).toBe(false); // Should not reach
      } catch (error) {
        expect(error).toBeInstanceOf(JmapError);
        expect((error as JmapError).type).toBe("serverFail");
        expect((error as JmapError).status).toBe(500);
      }
    });
  });

  describe("call", () => {
    test("makes single method call and returns result", async () => {
      // Mock response for Mailbox/get
      // See: https://jmap.io/spec-mail.html#mailbox-get
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
                state: "123",
                list: [
                  {
                    id: "mailbox1",
                    name: "Inbox",
                    parentId: null,
                    role: "inbox",
                    sortOrder: 0,
                    totalEmails: 100,
                    unreadEmails: 5,
                    totalThreads: 80,
                    unreadThreads: 3,
                    myRights: {
                      mayAddItems: true,
                      mayRemoveItems: true,
                      mayReadItems: true,
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
      const result = await client.call<{ list: unknown[] }>(
        [JMAP_CORE_CAPABILITY, JMAP_MAIL_CAPABILITY],
        "Mailbox/get",
        { accountId: "account-123" },
      );

      expect(result.list).toHaveLength(1);
    });

    test("throws JmapMethodError on method error response", async () => {
      // Mock error response
      // See: https://jmap.io/spec-core.html#errors
      let callCount = 0;
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
        _url: unknown,
        options: RequestInit | undefined,
      ) => {
        callCount++;
        if (callCount === 1) {
          // Session request
          return createMockResponse(mockSession);
        }
        // API request - extract call ID from request body
        const body = JSON.parse(options?.body as string);
        const callId = body.methodCalls[0][2];
        return createMockResponse({
          methodResponses: [
            [
              "error",
              {
                type: "accountNotFound",
                description: "Account not found",
              },
              callId,
            ],
          ],
          sessionState: "session-state-123",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });

      try {
        await client.call([JMAP_CORE_CAPABILITY], "Mailbox/get", {
          accountId: "invalid-account",
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(JmapMethodError);
        expect((error as JmapMethodError).type).toBe("accountNotFound");
      }
    });
  });

  describe("invalidateSession", () => {
    test("clears cached session", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () =>
        createMockResponse(mockSession)) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });

      // Cache session
      await client.getSession();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Invalidate
      client.invalidateSession();

      // Should fetch again
      await client.getSession();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe("helper functions", () => {
  describe("getMethodResponse", () => {
    test("finds response by call ID", () => {
      const response = {
        methodResponses: [
          ["Mailbox/get", { list: [] }, "call-1"],
          ["Email/query", { ids: ["a", "b"] }, "call-2"],
        ] as [string, Record<string, unknown>, string][],
        sessionState: "state-123",
      };

      const result = getMethodResponse(response, "call-2");
      expect(result).toBeDefined();
      expect(result?.[0]).toBe("Email/query");
    });

    test("returns undefined for missing call ID", () => {
      const response = {
        methodResponses: [["Mailbox/get", { list: [] }, "call-1"]] as [
          string,
          Record<string, unknown>,
          string,
        ][],
        sessionState: "state-123",
      };

      const result = getMethodResponse(response, "nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("isMethodError", () => {
    test("returns true for error response", () => {
      const errorResponse: [string, Record<string, unknown>, string] = [
        "error",
        { type: "serverFail" },
        "call-1",
      ];
      expect(isMethodError(errorResponse)).toBe(true);
    });

    test("returns false for success response", () => {
      const successResponse: [string, Record<string, unknown>, string] = [
        "Mailbox/get",
        { list: [] },
        "call-1",
      ];
      expect(isMethodError(successResponse)).toBe(false);
    });
  });
});

describe("error classes", () => {
  test("JmapError includes type and status", () => {
    const error = new JmapError("Request failed", "serverError", 500);

    expect(error.message).toBe("Request failed");
    expect(error.type).toBe("serverError");
    expect(error.status).toBe(500);
    expect(error.name).toBe("JmapError");
  });

  test("JmapMethodError includes type and callId", () => {
    const error = new JmapMethodError(
      "Account not found",
      "accountNotFound",
      "c1",
    );

    expect(error.message).toBe("Account not found");
    expect(error.type).toBe("accountNotFound");
    expect(error.callId).toBe("c1");
    expect(error.name).toBe("JmapMethodError");
  });
});
