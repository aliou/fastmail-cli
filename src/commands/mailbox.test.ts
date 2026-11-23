import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { listMailboxes } from "./mailbox.ts";

const session = {
  capabilities: { "urn:ietf:params:jmap:mail": {} },
  accounts: {},
  primaryAccounts: { "urn:ietf:params:jmap:mail": "account-1" },
  username: "person@example.com",
  apiUrl: "https://api.fastmail.com/jmap/api/",
  downloadUrl:
    "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}",
  uploadUrl: "https://api.fastmail.com/jmap/upload/{accountId}/",
  eventSourceUrl: "https://api.fastmail.com/jmap/eventsource/",
  state: "state-1",
};

let fetchSpy: ReturnType<typeof spyOn> | undefined;
let logSpy: ReturnType<typeof spyOn> | undefined;

beforeEach(() => {
  process.env.FASTMAIL_API_TOKEN = "token";
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
    _url: unknown,
    init: RequestInit | undefined,
  ) => {
    if (!init?.body) return new Response(JSON.stringify(session));
    const body = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        methodResponses: [
          [
            "Mailbox/get",
            {
              accountId: "account-1",
              state: "state-1",
              list: [
                {
                  id: "mailbox-1",
                  name: "Inbox",
                  role: "inbox",
                  parentId: null,
                  totalEmails: 0,
                  unreadEmails: 0,
                },
              ],
              notFound: [],
            },
            body.methodCalls[0][2],
          ],
        ],
      }),
    );
  }) as typeof fetch);
});

afterEach(() => {
  delete process.env.FASTMAIL_API_TOKEN;
  fetchSpy?.mockRestore();
  logSpy?.mockRestore();
});

describe("mailbox list output", () => {
  test("--json takes precedence over --tree", async () => {
    const output: string[] = [];
    logSpy = spyOn(console, "log").mockImplementation((value) =>
      output.push(String(value)),
    );
    await listMailboxes(["--tree", "--json"]);
    const result = JSON.parse(output.join("\n"));
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].id).toBe("mailbox-1");
  });
});
