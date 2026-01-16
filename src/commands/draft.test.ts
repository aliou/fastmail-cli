/**
 * Tests for draft command argument parsing.
 *
 * Note: Full integration tests require mocking the JMAP client which causes
 * test pollution in Bun. These tests focus on argument parsing only.
 */

import { describe, expect, it } from "bun:test";
import { getPositional, getString, parseArgs, wantsHelp } from "../args.ts";

const DRAFT_OPTIONS = {
  to: { type: "string" as const },
  cc: { type: "string" as const },
  bcc: { type: "string" as const },
  subject: { type: "string" as const },
  body: { type: "string" as const },
  html: { type: "boolean" as const },
  limit: { type: "string" as const },
};

describe("draft commands", () => {
  describe("parseArgs", () => {
    it("parses --to flag", () => {
      const parsed = parseArgs(["--to", "bob@example.com"], DRAFT_OPTIONS);
      expect(getString(parsed, "to")).toBe("bob@example.com");
    });

    it("parses --subject flag", () => {
      const parsed = parseArgs(["--subject", "Hello World"], DRAFT_OPTIONS);
      expect(getString(parsed, "subject")).toBe("Hello World");
    });

    it("parses --body flag", () => {
      const parsed = parseArgs(["--body", "Email content"], DRAFT_OPTIONS);
      expect(getString(parsed, "body")).toBe("Email content");
    });

    it("parses positional draft ID", () => {
      const parsed = parseArgs(["draft-123"], DRAFT_OPTIONS);
      expect(getPositional(parsed, 0)).toBe("draft-123");
    });

    it("parses multiple flags together", () => {
      const parsed = parseArgs(
        [
          "--to",
          "bob@example.com",
          "--cc",
          "alice@example.com",
          "--subject",
          "Test",
          "--body",
          "Content",
        ],
        DRAFT_OPTIONS,
      );

      expect(getString(parsed, "to")).toBe("bob@example.com");
      expect(getString(parsed, "cc")).toBe("alice@example.com");
      expect(getString(parsed, "subject")).toBe("Test");
      expect(getString(parsed, "body")).toBe("Content");
    });

    it("handles help flag", () => {
      const parsed = parseArgs(["--help"], DRAFT_OPTIONS);
      expect(wantsHelp(parsed)).toBe(true);
    });

    it("handles short help flag", () => {
      const parsed = parseArgs(["-h"], DRAFT_OPTIONS);
      expect(wantsHelp(parsed)).toBe(true);
    });

    it("parses --limit flag", () => {
      const parsed = parseArgs(["--limit", "50"], DRAFT_OPTIONS);
      expect(getString(parsed, "limit")).toBe("50");
    });

    it("parses draft ID with update flags", () => {
      const parsed = parseArgs(
        ["draft-123", "--subject", "Updated Subject"],
        DRAFT_OPTIONS,
      );

      expect(getPositional(parsed, 0)).toBe("draft-123");
      expect(getString(parsed, "subject")).toBe("Updated Subject");
    });
  });
});
