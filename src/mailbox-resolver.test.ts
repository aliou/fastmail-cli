import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { JmapClient } from "./jmap/client.ts";
import { resolveMailboxId } from "./mailbox-resolver.ts";

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

const mailboxes = [
  { id: "Inbox", name: "Other", role: null },
  { id: "mailbox-inbox", name: "Inbox", role: "inbox" },
  { id: "mailbox-archive", name: "Archive", role: "archive" },
  { id: "duplicate-1", name: "Receipts", role: null },
  { id: "duplicate-2", name: "Receipts", role: null },
];

let fetchSpy: ReturnType<typeof spyOn> | undefined;

beforeEach(() => {
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
              list: mailboxes,
              notFound: [],
            },
            body.methodCalls[0][2],
          ],
        ],
      }),
    );
  }) as typeof fetch);
});

afterEach(() => fetchSpy?.mockRestore());

describe("resolveMailboxId", () => {
  test("resolves an ID before a conflicting name", async () => {
    expect(
      await resolveMailboxId(new JmapClient({ token: "token" }), "Inbox"),
    ).toBe("Inbox");
  });

  test("resolves an exact name case-insensitively", async () => {
    expect(
      await resolveMailboxId(new JmapClient({ token: "token" }), "inbox"),
    ).toBe("mailbox-inbox");
  });

  test("resolves a role", async () => {
    expect(
      await resolveMailboxId(new JmapClient({ token: "token" }), "archive"),
    ).toBe("mailbox-archive");
  });

  test("rejects a missing mailbox", async () => {
    expect(
      resolveMailboxId(new JmapClient({ token: "token" }), "missing"),
    ).rejects.toThrow("Mailbox not found");
  });

  test("rejects ambiguous names", async () => {
    expect(
      resolveMailboxId(new JmapClient({ token: "token" }), "receipts"),
    ).rejects.toThrow("Mailbox is ambiguous");
  });
});
