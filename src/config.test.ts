import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { chmod, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import * as configModule from "./config.ts";
import {
  checkConfigPermissions,
  getApiToken,
  getConfigDir,
  getConfigPath,
  loadConfig,
  saveConfig,
  updateConfig,
  validateConfig,
} from "./config.ts";

// Use a temp directory for tests
const TEST_CONFIG_DIR = join(import.meta.dir, "../.test-config");
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, "config.json");

describe("config", () => {
  // Mock the config paths for testing
  let getConfigDirSpy: ReturnType<typeof spyOn>;
  let getConfigPathSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // Clean up test directory
    await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    await mkdir(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(TEST_CONFIG_DIR, { recursive: true, force: true });

    // Restore spies
    getConfigDirSpy?.mockRestore();
    getConfigPathSpy?.mockRestore();

    // Clear env var
    delete process.env.FASTMAIL_API_TOKEN;
  });

  describe("getConfigDir", () => {
    test("returns path under home directory", () => {
      const dir = getConfigDir();
      expect(dir).toContain(".config/fastmail-cli");
    });
  });

  describe("getConfigPath", () => {
    test("returns path to config.json", () => {
      const path = getConfigPath();
      expect(path).toContain(".config/fastmail-cli/config.json");
    });
  });

  describe("validateConfig", () => {
    test("returns default config for null input", () => {
      const config = validateConfig(null);
      expect(config).toEqual({ outputFormat: "table" });
    });

    test("returns default config for undefined input", () => {
      const config = validateConfig(undefined);
      expect(config).toEqual({ outputFormat: "table" });
    });

    test("returns default config for non-object input", () => {
      const config = validateConfig("not an object");
      expect(config).toEqual({ outputFormat: "table" });
    });

    test("extracts valid apiToken", () => {
      const config = validateConfig({ apiToken: "test-token" });
      expect(config.apiToken).toBe("test-token");
    });

    test("ignores non-string apiToken", () => {
      const config = validateConfig({ apiToken: 12345 });
      expect(config.apiToken).toBeUndefined();
    });

    test("extracts valid defaultAccountId", () => {
      const config = validateConfig({ defaultAccountId: "account-123" });
      expect(config.defaultAccountId).toBe("account-123");
    });

    test("extracts valid outputFormat json", () => {
      const config = validateConfig({ outputFormat: "json" });
      expect(config.outputFormat).toBe("json");
    });

    test("extracts valid outputFormat table", () => {
      const config = validateConfig({ outputFormat: "table" });
      expect(config.outputFormat).toBe("table");
    });

    test("ignores invalid outputFormat", () => {
      const config = validateConfig({ outputFormat: "csv" });
      expect(config.outputFormat).toBe("table"); // default
    });

    test("strips unknown fields", () => {
      const config = validateConfig({
        apiToken: "token",
        unknownField: "value",
        anotherUnknown: 123,
      });
      expect(config).toEqual({
        apiToken: "token",
        outputFormat: "table",
      });
    });
  });

  describe("loadConfig", () => {
    test("returns default config when file does not exist", async () => {
      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        join(TEST_CONFIG_DIR, "nonexistent.json"),
      );

      const config = await loadConfig();
      expect(config).toEqual({ outputFormat: "table" });
    });

    test("loads config from file", async () => {
      // Write test config
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "saved-token", outputFormat: "json" }),
      );

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      const config = await loadConfig();
      expect(config.apiToken).toBe("saved-token");
      expect(config.outputFormat).toBe("json");
    });

    test("returns default config for invalid JSON", async () => {
      // Write invalid JSON
      await Bun.write(TEST_CONFIG_PATH, "not valid json {{{");

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      // Suppress console.error for this test
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(
        () => {},
      );

      const config = await loadConfig();
      expect(config).toEqual({ outputFormat: "table" });

      consoleErrorSpy.mockRestore();
    });
  });

  describe("saveConfig", () => {
    test("creates config file with proper permissions", async () => {
      const testPath = join(TEST_CONFIG_DIR, "subdir", "config.json");

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        testPath,
      );

      await saveConfig({ apiToken: "new-token", outputFormat: "json" });

      // Verify file was created
      const file = Bun.file(testPath);
      expect(await file.exists()).toBe(true);

      // Verify content
      const content = await file.json();
      expect(content.apiToken).toBe("new-token");

      // Verify permissions (0600 = owner read/write only)
      const stats = await stat(testPath);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    test("overwrites existing config", async () => {
      // Write initial config
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "old-token" }),
      );

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      await saveConfig({ apiToken: "new-token", outputFormat: "table" });

      const file = Bun.file(TEST_CONFIG_PATH);
      const content = await file.json();
      expect(content.apiToken).toBe("new-token");
    });
  });

  describe("updateConfig", () => {
    test("merges updates with existing config", async () => {
      // Write initial config
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "existing-token", outputFormat: "table" }),
      );

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      const updated = await updateConfig({ outputFormat: "json" });

      expect(updated.apiToken).toBe("existing-token"); // preserved
      expect(updated.outputFormat).toBe("json"); // updated

      // Verify persisted
      const file = Bun.file(TEST_CONFIG_PATH);
      const content = await file.json();
      expect(content.apiToken).toBe("existing-token");
      expect(content.outputFormat).toBe("json");
    });
  });

  describe("getApiToken", () => {
    test("returns env var when set", async () => {
      process.env.FASTMAIL_API_TOKEN = "env-token";

      // Mock to use test path (with no config file)
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        join(TEST_CONFIG_DIR, "nonexistent.json"),
      );

      const token = await getApiToken();
      expect(token).toBe("env-token");
    });

    test("returns config token when env not set", async () => {
      // Ensure env var is not set
      delete process.env.FASTMAIL_API_TOKEN;

      // Write config with token
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "config-token" }),
      );

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      const token = await getApiToken();
      expect(token).toBe("config-token");
    });

    test("env var takes precedence over config", async () => {
      process.env.FASTMAIL_API_TOKEN = "env-token";

      // Write config with different token
      await Bun.write(
        TEST_CONFIG_PATH,
        JSON.stringify({ apiToken: "config-token" }),
      );

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      const token = await getApiToken();
      expect(token).toBe("env-token");
    });

    test("returns undefined when no token available", async () => {
      delete process.env.FASTMAIL_API_TOKEN;

      // Mock to use test path (with no config file)
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        join(TEST_CONFIG_DIR, "nonexistent.json"),
      );

      const token = await getApiToken();
      expect(token).toBeUndefined();
    });
  });

  describe("checkConfigPermissions", () => {
    test("returns true for file with 0600 permissions", async () => {
      // Write config and set permissions
      await Bun.write(TEST_CONFIG_PATH, JSON.stringify({ apiToken: "token" }));
      await chmod(TEST_CONFIG_PATH, 0o600);

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      const result = await checkConfigPermissions();
      expect(result).toBe(true);
    });

    test("returns false and warns for world-readable file", async () => {
      // Write config and set unsafe permissions
      await Bun.write(TEST_CONFIG_PATH, JSON.stringify({ apiToken: "token" }));
      await chmod(TEST_CONFIG_PATH, 0o644);

      // Mock to use test path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        TEST_CONFIG_PATH,
      );

      // Capture console.error
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(
        () => {},
      );

      const result = await checkConfigPermissions();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test("returns true when file does not exist", async () => {
      // Mock to use nonexistent path
      getConfigPathSpy = spyOn(configModule, "getConfigPath").mockReturnValue(
        join(TEST_CONFIG_DIR, "nonexistent.json"),
      );

      const result = await checkConfigPermissions();
      expect(result).toBe(true);
    });
  });
});
