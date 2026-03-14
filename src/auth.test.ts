import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { chmod, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  fetchSession,
  getAuthStatus,
  login,
  logout,
  validateToken,
} from "./auth.ts";
import * as configModule from "./config.ts";
import { JMAP_CORE_CAPABILITY, JMAP_MAIL_CAPABILITY } from "./jmap/types.ts";

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
      name: "Test Account",
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
    [JMAP_CORE_CAPABILITY]: {},
    [JMAP_MAIL_CAPABILITY]: {},
  },
};

function createMockResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Use a temp directory for tests
const TEST_CONFIG_DIR = join(import.meta.dir, "../.test-config-auth");
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, "config.json");

describe("auth", () => {
  let fetchSpy: ReturnType<typeof spyOn>;
  let getConfigPathSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // Clean up test directory
    await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    await mkdir(TEST_CONFIG_DIR, { recursive: true });

    // Mock config path
    getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
      TEST_CONFIG_PATH,
    );
  });

  afterEach(async () => {
    // Clean up
    fetchSpy?.mockRestore();
    getConfigPathSpy?.mockRestore();

    await rm(TEST_CONFIG_DIR, { recursive: true, force: true });

    // Clear env var
    delete process.env.FASTMAIL_API_TOKEN;
  });

  describe("fetchSession", () => {
    test("fetches and returns session for valid token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const session = await fetchSession("valid-token");

      expect(session.username).toBe("test@fastmail.com");
      expect(session.apiUrl).toBe("https://api.fastmail.com/jmap/api/");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.fastmail.com/jmap/session",
        expect.objectContaining({
          headers: {
            Authorization: "Bearer valid-token",
          },
        }),
      );
    });

    test("throws error for 401 unauthorized", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse({ error: "Unauthorized" }, 401),
      );

      expect(fetchSession("invalid-token")).rejects.toThrow(
        "Invalid API token",
      );
    });

    test("throws error for other failures", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse({ error: "Server Error" }, 500),
      );

      expect(fetchSession("token")).rejects.toThrow("Failed to authenticate");
    });
  });

  describe("validateToken", () => {
    test("returns true for valid token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const isValid = await validateToken("valid-token");
      expect(isValid).toBe(true);
    });

    test("returns false for invalid token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse({ error: "Unauthorized" }, 401),
      );

      const isValid = await validateToken("invalid-token");
      expect(isValid).toBe(false);
    });
  });

  describe("login", () => {
    test("stores token and returns success for valid token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      const result = await login("valid-token");

      expect(result.success).toBe(true);
      expect(result.username).toBe("test@fastmail.com");
      expect(result.primaryAccountId).toBe("account-123");
      expect(result.accountName).toBe("Test Account");

      // Verify token was saved
      const configFile = Bun.file(TEST_CONFIG_PATH);
      const savedConfig = await configFile.json();
      expect(savedConfig.apiToken).toBe("valid-token");
      expect(savedConfig.defaultAccountId).toBe("account-123");
    });

    test("returns error for invalid token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse({ error: "Unauthorized" }, 401),
      );

      const result = await login("invalid-token");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid API token");

      // Verify no config was saved
      const configFile = Bun.file(TEST_CONFIG_PATH);
      expect(await configFile.exists()).toBe(false);
    });
  });

  describe("logout", () => {
    test("removes token from config", async () => {
      // Setup: save a config with token
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({
          apiToken: "existing-token",
          defaultAccountId: "account-123",
          outputFormat: "table",
        }),
      );
      await chmod(TEST_CONFIG_PATH, 0o600);

      await logout();

      // Verify token was removed
      const configFile = Bun.file(TEST_CONFIG_PATH);
      const savedConfig = await configFile.json();
      expect(savedConfig.apiToken).toBeUndefined();
      expect(savedConfig.defaultAccountId).toBeUndefined();
      expect(savedConfig.outputFormat).toBe("table"); // preserved
    });
  });

  describe("getAuthStatus", () => {
    test("returns authenticated status for valid config token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      // Setup config with token
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "config-token" }),
      );
      await chmod(TEST_CONFIG_PATH, 0o600);

      const status = await getAuthStatus();

      expect(status.authenticated).toBe(true);
      expect(status.username).toBe("test@fastmail.com");
      expect(status.primaryAccountId).toBe("account-123");
      expect(status.accountName).toBe("Test Account");
      expect(status.tokenSource).toBe("config");
    });

    test("returns authenticated status for valid env token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      process.env.FASTMAIL_API_TOKEN = "env-token";

      const status = await getAuthStatus();

      expect(status.authenticated).toBe(true);
      expect(status.tokenSource).toBe("env");
    });

    test("returns not authenticated when no token", async () => {
      delete process.env.FASTMAIL_API_TOKEN;
      // No config file

      const status = await getAuthStatus();

      expect(status.authenticated).toBe(false);
      expect(status.error).toBe("No API token configured");
    });

    test("returns not authenticated for invalid token", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse({ error: "Unauthorized" }, 401),
      );

      // Setup config with invalid token
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "invalid-token" }),
      );
      await chmod(TEST_CONFIG_PATH, 0o600);

      const status = await getAuthStatus();

      expect(status.authenticated).toBe(false);
      expect(status.tokenSource).toBe("config");
      expect(status.error).toBe("Invalid API token");
    });

    test("env token takes precedence over config", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        createMockResponse(mockSession),
      );

      process.env.FASTMAIL_API_TOKEN = "env-token";

      // Setup config with different token
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "config-token" }),
      );
      await chmod(TEST_CONFIG_PATH, 0o600);

      const status = await getAuthStatus();

      expect(status.tokenSource).toBe("env");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer env-token",
          },
        }),
      );
    });
  });
});
