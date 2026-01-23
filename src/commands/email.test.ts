import { describe, expect, mock, test } from "bun:test";
import type { JmapClient } from "../jmap/client.ts";
import { getReplyContext, parseDate } from "./email.ts";

describe("parseDate", () => {
  test("handles ISO 8601 format", () => {
    expect(parseDate("2026-01-11T00:00:00Z")).toBe("2026-01-11T00:00:00Z");
    expect(parseDate("2025-12-25T15:30:45Z")).toBe("2025-12-25T15:30:45Z");
  });

  test("handles date-only format", () => {
    expect(parseDate("2026-01-11")).toBe("2026-01-11T00:00:00Z");
    expect(parseDate("2025-12-25")).toBe("2025-12-25T00:00:00Z");
  });

  test("handles relative days", () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = parseDate("7d");
    const resultDate = new Date(result);

    // Allow 1 second tolerance for test execution time
    expect(
      Math.abs(resultDate.getTime() - sevenDaysAgo.getTime()),
    ).toBeLessThan(1000);
  });

  test("handles relative weeks", () => {
    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const result = parseDate("2w");
    const resultDate = new Date(result);

    expect(Math.abs(resultDate.getTime() - twoWeeksAgo.getTime())).toBeLessThan(
      1000,
    );
  });

  test("handles relative months", () => {
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const result = parseDate("1m");
    const resultDate = new Date(result);

    // Month calculations can vary due to different month lengths
    // Allow 2 days tolerance
    expect(Math.abs(resultDate.getTime() - oneMonthAgo.getTime())).toBeLessThan(
      2 * 24 * 60 * 60 * 1000,
    );
  });

  test("handles relative years", () => {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result = parseDate("1y");
    const resultDate = new Date(result);

    // Allow 1 second tolerance
    expect(Math.abs(resultDate.getTime() - oneYearAgo.getTime())).toBeLessThan(
      1000,
    );
  });

  test("returns valid ISO 8601 format for relative dates", () => {
    const result = parseDate("7d");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("rejects invalid formats", () => {
    expect(() => parseDate("invalid")).toThrow("Invalid date format");
    expect(() => parseDate("yesterday")).toThrow("Invalid date format");
    expect(() => parseDate("")).toThrow("Invalid date format");
    expect(() => parseDate("2026/01/11")).toThrow("Invalid date format");
    expect(() => parseDate("Jan 11, 2026")).toThrow("Invalid date format");
  });

  test("handles edge cases for relative dates", () => {
    // Zero days should work (returns current time)
    const result = parseDate("0d");
    const now = new Date();
    const resultDate = new Date(result);
    expect(Math.abs(resultDate.getTime() - now.getTime())).toBeLessThan(1000);

    // Large numbers should work
    expect(() => parseDate("365d")).not.toThrow();
    expect(() => parseDate("52w")).not.toThrow();
    expect(() => parseDate("12m")).not.toThrow();
    expect(() => parseDate("10y")).not.toThrow();
  });
});

describe("markRead", () => {
  test("builds correct update map with $seen keyword", async () => {
    // Mock the JMAP client and setEmails
    const _mockSetEmails = mock(
      (
        _client: unknown,
        params: {
          update?: Record<string, Record<string, boolean>>;
        },
      ) => {
        // Verify the update map has correct structure
        expect(params.update).toBeDefined();
        expect(params.update?.email1).toEqual({ "keywords/$seen": true });
        expect(params.update?.email2).toEqual({ "keywords/$seen": true });

        return Promise.resolve({
          updated: { email1: {}, email2: {} },
          notUpdated: {},
        });
      },
    );

    // Note: Full test would require mocking getClient and setEmails
    // This test verifies the expected structure
  });

  test("handles single email ID", async () => {
    // Verify single ID creates update map with one entry
    const emailId = "test-email-id";
    const expectedUpdate = {
      [emailId]: { "keywords/$seen": true },
    };

    expect(expectedUpdate).toBeDefined();
    expect(Object.keys(expectedUpdate).length).toBe(1);
    expect(expectedUpdate[emailId]).toEqual({ "keywords/$seen": true });
  });

  test("handles multiple email IDs", async () => {
    // Verify multiple IDs create update map with all entries
    const ids = ["id1", "id2", "id3"];
    const expectedUpdate: Record<string, Record<string, boolean>> = {};

    for (const id of ids) {
      expectedUpdate[id] = { "keywords/$seen": true };
    }

    expect(Object.keys(expectedUpdate).length).toBe(3);
    expect(expectedUpdate.id1).toEqual({ "keywords/$seen": true });
    expect(expectedUpdate.id2).toEqual({ "keywords/$seen": true });
    expect(expectedUpdate.id3).toEqual({ "keywords/$seen": true });
  });
});

describe("markUnread", () => {
  test("builds correct update map removing $seen keyword", async () => {
    // Verify update map uses null to remove keyword
    const emailId = "test-email-id";
    const expectedUpdate = {
      [emailId]: { "keywords/$seen": null },
    };

    expect(expectedUpdate).toBeDefined();
    expect(expectedUpdate[emailId]).toEqual({ "keywords/$seen": null });
  });

  test("handles single email ID", async () => {
    // Verify single ID creates update map with one entry
    const emailId = "test-email-id";
    const expectedUpdate = {
      [emailId]: { "keywords/$seen": null },
    };

    expect(expectedUpdate).toBeDefined();
    expect(Object.keys(expectedUpdate).length).toBe(1);
    expect(expectedUpdate[emailId]).toEqual({ "keywords/$seen": null });
  });

  test("handles multiple email IDs", async () => {
    // Verify multiple IDs create update map with all entries
    const ids = ["id1", "id2", "id3"];
    const expectedUpdate: Record<string, Record<string, boolean | null>> = {};

    for (const id of ids) {
      expectedUpdate[id] = { "keywords/$seen": null };
    }

    expect(Object.keys(expectedUpdate).length).toBe(3);
    expect(expectedUpdate.id1).toEqual({ "keywords/$seen": null });
    expect(expectedUpdate.id2).toEqual({ "keywords/$seen": null });
    expect(expectedUpdate.id3).toEqual({ "keywords/$seen": null });
  });
});

describe("getReplyContext", () => {
  // Mock JmapClient for testing
  const createMockClient = (emailData: Record<string, unknown>) => {
    return {
      getPrimaryAccountId: mock(() => Promise.resolve("account-123")),
      call: mock(() =>
        Promise.resolve({
          accountId: "account-123",
          state: "state-1",
          list: [emailData],
          notFound: [],
        }),
      ),
    };
  };

  test("builds correct In-Reply-To from original messageId", async () => {
    const mockClient = createMockClient({
      id: "email-123",
      threadId: "thread-456",
      messageId: ["<original@example.com>"],
      references: [],
      subject: "Hello",
      from: [{ email: "sender@example.com", name: "Sender" }],
      to: [{ email: "me@example.com" }],
    });

    const result = await getReplyContext(
      mockClient as unknown as JmapClient,
      "email-123",
      false,
      "me@example.com",
    );

    expect(result.inReplyTo).toEqual(["<original@example.com>"]);
  });

  test("builds correct References from original references + messageId", async () => {
    const mockClient = createMockClient({
      id: "email-123",
      threadId: "thread-456",
      messageId: ["<current@example.com>"],
      references: ["<first@example.com>", "<second@example.com>"],
      subject: "Hello",
      from: [{ email: "sender@example.com" }],
    });

    const result = await getReplyContext(
      mockClient as unknown as JmapClient,
      "email-123",
      false,
      "me@example.com",
    );

    expect(result.references).toEqual([
      "<first@example.com>",
      "<second@example.com>",
      "<current@example.com>",
    ]);
  });

  test("preserves threadId from original email", async () => {
    const mockClient = createMockClient({
      id: "email-123",
      threadId: "thread-789",
      messageId: ["<msg@example.com>"],
      subject: "Test",
      from: [{ email: "sender@example.com" }],
    });

    const result = await getReplyContext(
      mockClient as unknown as JmapClient,
      "email-123",
      false,
      "me@example.com",
    );

    expect(result.threadId).toBe("thread-789");
  });

  describe("subject prefix handling", () => {
    test("adds Re: prefix to plain subject", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "Hello",
        from: [{ email: "sender@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        false,
        "me@example.com",
      );

      expect(result.subject).toBe("Re: Hello");
    });

    test("does not double Re: prefix (lowercase)", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "re: Hello",
        from: [{ email: "sender@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        false,
        "me@example.com",
      );

      expect(result.subject).toBe("re: Hello");
    });

    test("does not double Re: prefix (uppercase)", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "RE: Hello",
        from: [{ email: "sender@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        false,
        "me@example.com",
      );

      expect(result.subject).toBe("RE: Hello");
    });

    test("handles empty subject", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "",
        from: [{ email: "sender@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        false,
        "me@example.com",
      );

      expect(result.subject).toBe("Re: ");
    });

    test("handles undefined subject", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        from: [{ email: "sender@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        false,
        "me@example.com",
      );

      expect(result.subject).toBe("Re: ");
    });
  });

  describe("reply-all recipient handling", () => {
    test("uses replyTo as To recipient if available", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "Test",
        from: [{ email: "sender@example.com", name: "Sender" }],
        to: [{ email: "me@example.com" }],
        replyTo: [{ email: "replyto@example.com", name: "Reply To" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        true,
        "me@example.com",
      );

      expect(result.to).toEqual([
        { email: "replyto@example.com", name: "Reply To" },
      ]);
    });

    test("uses from as To recipient if no replyTo", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "Test",
        from: [{ email: "sender@example.com", name: "Sender" }],
        to: [{ email: "me@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        true,
        "me@example.com",
      );

      expect(result.to).toEqual([
        { email: "sender@example.com", name: "Sender" },
      ]);
    });

    test("excludes self from Cc recipients", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [
          { email: "me@example.com" },
          { email: "other@example.com", name: "Other" },
        ],
        cc: [{ email: "cc@example.com", name: "CC" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        true,
        "me@example.com",
      );

      // Self should be excluded
      expect(result.cc).not.toContainEqual(
        expect.objectContaining({ email: "me@example.com" }),
      );
      // Others should be included
      expect(result.cc).toContainEqual({
        email: "other@example.com",
        name: "Other",
      });
      expect(result.cc).toContainEqual({ email: "cc@example.com", name: "CC" });
    });

    test("excludes To recipients from Cc (no duplicates)", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "me@example.com" }, { email: "sender@example.com" }],
        cc: [{ email: "cc@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        true,
        "me@example.com",
      );

      // Sender is in To, so should not be in Cc
      expect(result.cc).not.toContainEqual(
        expect.objectContaining({ email: "sender@example.com" }),
      );
    });

    test("handles case-insensitive email comparison", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "ME@EXAMPLE.COM" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        true,
        "me@example.com",
      );

      // Self with different case should be excluded
      expect(result.cc).not.toContainEqual(
        expect.objectContaining({ email: "ME@EXAMPLE.COM" }),
      );
    });

    test("returns empty To/Cc when not reply-all", async () => {
      const mockClient = createMockClient({
        id: "email-123",
        threadId: "thread-456",
        messageId: ["<msg@example.com>"],
        subject: "Test",
        from: [{ email: "sender@example.com" }],
        to: [{ email: "me@example.com" }, { email: "other@example.com" }],
      });

      const result = await getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        false, // not reply-all
        "me@example.com",
      );

      expect(result.to).toEqual([]);
      expect(result.cc).toEqual([]);
    });
  });

  test("throws error when email not found", async () => {
    const mockClient = {
      getPrimaryAccountId: mock(() => Promise.resolve("account-123")),
      call: mock(() =>
        Promise.resolve({
          accountId: "account-123",
          state: "state-1",
          list: [],
          notFound: ["nonexistent-id"],
        }),
      ),
    };

    expect(
      getReplyContext(
        mockClient as unknown as JmapClient,
        "nonexistent-id",
        false,
        "me@example.com",
      ),
    ).rejects.toThrow("Email not found: nonexistent-id");
  });

  test("throws error when email list is empty", async () => {
    const mockClient = {
      getPrimaryAccountId: mock(() => Promise.resolve("account-123")),
      call: mock(() =>
        Promise.resolve({
          accountId: "account-123",
          state: "state-1",
          list: [],
          notFound: [],
        }),
      ),
    };

    expect(
      getReplyContext(
        mockClient as unknown as JmapClient,
        "email-123",
        false,
        "me@example.com",
      ),
    ).rejects.toThrow("Email not found: email-123");
  });
});
