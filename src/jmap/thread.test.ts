import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { JmapClient } from "./client.ts";
import { getThreads } from "./thread.ts";
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

describe("Thread methods", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
  });

  describe("getThreads", () => {
    test("gets thread with emailIds", async () => {
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
              "Thread/get",
              {
                accountId: "account-123",
                state: "thread-state-1",
                list: [
                  {
                    id: "thread-1",
                    emailIds: ["email-1", "email-2", "email-3"],
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
      const result = await getThreads(client, { ids: ["thread-1"] });

      expect(result.accountId).toBe("account-123");
      expect(result.list).toHaveLength(1);
      expect(result.list[0]?.id).toBe("thread-1");
      expect(result.list[0]?.emailIds).toEqual([
        "email-1",
        "email-2",
        "email-3",
      ]);
      expect(result.notFound).toEqual([]);
    });

    test("handles notFound for missing threads", async () => {
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
              "Thread/get",
              {
                accountId: "account-123",
                state: "thread-state-2",
                list: [],
                notFound: ["thread-999"],
              },
              callId,
            ],
          ],
          sessionState: "session-state-123",
        });
      }) as unknown as typeof fetch);

      const client = new JmapClient({ token: "test-token" });
      const result = await getThreads(client, { ids: ["thread-999"] });

      expect(result.list).toHaveLength(0);
      expect(result.notFound).toEqual(["thread-999"]);
    });

    test("gets multiple threads", async () => {
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
              "Thread/get",
              {
                accountId: "account-123",
                state: "thread-state-3",
                list: [
                  {
                    id: "thread-1",
                    emailIds: ["email-1"],
                  },
                  {
                    id: "thread-2",
                    emailIds: ["email-2", "email-3"],
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
      const result = await getThreads(client, {
        ids: ["thread-1", "thread-2"],
      });

      expect(result.list).toHaveLength(2);
      expect(result.list[0]?.emailIds).toHaveLength(1);
      expect(result.list[1]?.emailIds).toHaveLength(2);
    });
  });
});
