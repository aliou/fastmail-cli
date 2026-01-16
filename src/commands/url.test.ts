/**
 * Tests for URL command handlers.
 */

import { describe, expect, test } from "bun:test";
import {
  getComposeUrl,
  getEmailUrl,
  getMailboxUrl,
  getSearchUrl,
} from "./url.ts";

describe("getEmailUrl", () => {
  test("generates correct URL for email", () => {
    expect(getEmailUrl("mb1", "em1")).toBe(
      "https://app.fastmail.com/mail/mb1/em1",
    );
  });

  test("handles special characters in IDs", () => {
    expect(getEmailUrl("Mf2f7e13a", "Me3cd9c65d12")).toBe(
      "https://app.fastmail.com/mail/Mf2f7e13a/Me3cd9c65d12",
    );
  });
});

describe("getMailboxUrl", () => {
  test("generates correct URL for mailbox", () => {
    expect(getMailboxUrl("mb1")).toBe("https://app.fastmail.com/mail/mb1/");
  });

  test("handles mailbox ID with special characters", () => {
    expect(getMailboxUrl("Mf2f7e13a")).toBe(
      "https://app.fastmail.com/mail/Mf2f7e13a/",
    );
  });
});

describe("getSearchUrl", () => {
  test("encodes simple query", () => {
    expect(getSearchUrl("hello")).toBe(
      "https://app.fastmail.com/mail/search:hello",
    );
  });

  test("encodes query with special characters", () => {
    expect(getSearchUrl("from:test@example.com")).toBe(
      "https://app.fastmail.com/mail/search:from%3Atest%40example.com",
    );
  });

  test("encodes query with spaces", () => {
    expect(getSearchUrl("hello world")).toBe(
      "https://app.fastmail.com/mail/search:hello%20world",
    );
  });
});

describe("getComposeUrl", () => {
  test("generates base compose URL without options", () => {
    expect(getComposeUrl()).toBe("https://app.fastmail.com/mail/compose");
  });

  test("generates compose URL with empty options", () => {
    expect(getComposeUrl({})).toBe("https://app.fastmail.com/mail/compose");
  });

  test("handles to option", () => {
    const url = getComposeUrl({ to: "bob@example.com" });
    expect(url).toBe(
      "https://app.fastmail.com/mail/compose?to=bob%40example.com",
    );
  });

  test("handles subject option", () => {
    const url = getComposeUrl({ subject: "Hello World" });
    expect(url).toBe(
      "https://app.fastmail.com/mail/compose?subject=Hello+World",
    );
  });

  test("handles body option", () => {
    const url = getComposeUrl({ body: "Hello there!" });
    expect(url).toBe(
      "https://app.fastmail.com/mail/compose?body=Hello+there%21",
    );
  });

  test("handles multiple options", () => {
    const url = getComposeUrl({
      to: "bob@example.com",
      subject: "Test",
      body: "Hi!",
    });
    expect(url).toContain("to=bob%40example.com");
    expect(url).toContain("subject=Test");
    expect(url).toContain("body=Hi%21");
  });
});
