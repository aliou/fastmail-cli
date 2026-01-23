import { describe, expect, test } from "bun:test";
import type { EmailHeader } from "../jmap/email.ts";

/**
 * Unsubscribe method types.
 */
interface UnsubscribeMethod {
  type: "mailto" | "http" | "https";
  url: string;
  oneClick?: boolean;
}

/**
 * Parse List-Unsubscribe header.
 * (Copy of function from unsubscribe.ts for testing)
 */
function parseListUnsubscribe(headers: EmailHeader[]): UnsubscribeMethod[] {
  const unsubHeader = headers.find(
    (h) => h.name.toLowerCase() === "list-unsubscribe",
  );

  if (!unsubHeader) {
    return [];
  }

  const postHeader = headers.find(
    (h) => h.name.toLowerCase() === "list-unsubscribe-post",
  );
  const hasOneClick = postHeader?.value.toLowerCase().includes("one-click");

  // Parse <url>, <url> format
  const urlPattern = /<([^>]+)>/g;
  const methods: UnsubscribeMethod[] = [];

  for (const match of unsubHeader.value.matchAll(urlPattern)) {
    const url = match[1];
    if (!url) continue;

    let type: "mailto" | "http" | "https";

    if (url.startsWith("mailto:")) {
      type = "mailto";
    } else if (url.startsWith("https:")) {
      type = "https";
    } else if (url.startsWith("http:")) {
      type = "http";
    } else {
      continue; // Unknown protocol
    }

    const method: UnsubscribeMethod = { type, url };
    if (type === "https" && hasOneClick) {
      method.oneClick = true;
    }
    methods.push(method);
  }

  return methods;
}

describe("parseListUnsubscribe", () => {
  test("handles single mailto URL", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value: "<mailto:unsubscribe@example.com?subject=unsubscribe>",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "mailto",
        url: "mailto:unsubscribe@example.com?subject=unsubscribe",
      },
    ]);
  });

  test("handles single https URL", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value: "<https://example.com/unsubscribe?token=abc123>",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "https",
        url: "https://example.com/unsubscribe?token=abc123",
      },
    ]);
  });

  test("handles multiple URLs", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value: "<mailto:unsub@example.com>, <https://example.com/unsubscribe>",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "mailto",
        url: "mailto:unsub@example.com",
      },
      {
        type: "https",
        url: "https://example.com/unsubscribe",
      },
    ]);
  });

  test("detects one-click when List-Unsubscribe-Post is present", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value: "<https://example.com/unsubscribe?token=abc123>",
      },
      {
        name: "List-Unsubscribe-Post",
        value: "List-Unsubscribe=One-Click",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "https",
        url: "https://example.com/unsubscribe?token=abc123",
        oneClick: true,
      },
    ]);
  });

  test("one-click only applies to https URLs", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value: "<mailto:unsub@example.com>, <https://example.com/unsubscribe>",
      },
      {
        name: "List-Unsubscribe-Post",
        value: "List-Unsubscribe=One-Click",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "mailto",
        url: "mailto:unsub@example.com",
      },
      {
        type: "https",
        url: "https://example.com/unsubscribe",
        oneClick: true,
      },
    ]);
  });

  test("returns empty array when no List-Unsubscribe header", () => {
    const headers: EmailHeader[] = [
      {
        name: "From",
        value: "sender@example.com",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([]);
  });

  test("ignores unknown protocols", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value: "<ftp://example.com/unsub>, <https://example.com/unsub>",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "https",
        url: "https://example.com/unsub",
      },
    ]);
  });

  test("handles http URLs (non-secure)", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value: "<http://example.com/unsubscribe>",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "http",
        url: "http://example.com/unsubscribe",
      },
    ]);
  });

  test("handles case-insensitive header names", () => {
    const headers: EmailHeader[] = [
      {
        name: "list-unsubscribe",
        value: "<https://example.com/unsub>",
      },
      {
        name: "LIST-UNSUBSCRIBE-POST",
        value: "List-Unsubscribe=One-Click",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "https",
        url: "https://example.com/unsub",
        oneClick: true,
      },
    ]);
  });

  test("handles mailto with query parameters", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value:
          "<mailto:newsletter@example.com?subject=Unsubscribe&body=Please%20remove%20me>",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "mailto",
        url: "mailto:newsletter@example.com?subject=Unsubscribe&body=Please%20remove%20me",
      },
    ]);
  });

  test("handles multiple URLs with mixed protocols", () => {
    const headers: EmailHeader[] = [
      {
        name: "List-Unsubscribe",
        value:
          "<mailto:unsub@example.com?subject=unsubscribe>, <http://example.com/unsub>, <https://example.com/unsub>",
      },
    ];

    const result = parseListUnsubscribe(headers);

    expect(result).toEqual([
      {
        type: "mailto",
        url: "mailto:unsub@example.com?subject=unsubscribe",
      },
      {
        type: "http",
        url: "http://example.com/unsub",
      },
      {
        type: "https",
        url: "https://example.com/unsub",
      },
    ]);
  });
});
