/**
 * Configuration management for fastmail-cli.
 * Handles loading, saving, and validating config from ~/.config/fastmail-cli/config.json
 */

import { chmod, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_FILE } from "./constants.ts";

export interface Config {
  // API token from FastMail settings
  apiToken?: string;

  // Default account ID (if multiple accounts)
  defaultAccountId?: string;

  // Output preferences
  outputFormat?: "json" | "table";
}

const DEFAULT_CONFIG: Config = {
  outputFormat: "table",
};

/**
 * Get the path to the config directory.
 * Respects XDG_CONFIG_HOME, falls back to ~/.config
 */
export function getConfigDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "fastmail-cli");
}

/**
 * Get the path to the config file.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE);
}

/**
 * Validate config object structure.
 * Returns a valid Config object, stripping unknown fields.
 */
export function validateConfig(data: unknown): Config {
  if (!data || typeof data !== "object") {
    return { ...DEFAULT_CONFIG };
  }

  const obj = data as Record<string, unknown>;
  const config: Config = { ...DEFAULT_CONFIG };

  if (typeof obj.apiToken === "string") {
    config.apiToken = obj.apiToken;
  }

  if (typeof obj.defaultAccountId === "string") {
    config.defaultAccountId = obj.defaultAccountId;
  }

  if (obj.outputFormat === "json" || obj.outputFormat === "table") {
    config.outputFormat = obj.outputFormat;
  }

  return config;
}

/**
 * Load config from disk.
 * Returns default config if file doesn't exist.
 */
export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();

  try {
    const file = Bun.file(configPath);
    const exists = await file.exists();

    if (!exists) {
      return { ...DEFAULT_CONFIG };
    }

    const content = await file.text();
    const data = JSON.parse(content);
    return validateConfig(data);
  } catch (error) {
    // If JSON parsing fails, return default config
    if (error instanceof SyntaxError) {
      console.error(
        `Warning: Invalid config file at ${configPath}, using defaults`,
      );
      return { ...DEFAULT_CONFIG };
    }
    throw error;
  }
}

/**
 * Save config to disk.
 * Creates directory with 0700 and file with 0600 permissions.
 */
export async function saveConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  // Create directory with restricted permissions (owner only)
  await mkdir(configDir, { recursive: true, mode: 0o700 });

  // Write config file
  const content = `${JSON.stringify(config, null, 2)}\n`;
  await Bun.write(configPath, content);

  // Set file permissions (owner read/write only)
  await chmod(configPath, 0o600);
}

/**
 * Update specific config fields without overwriting the entire config.
 */
export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const updated = { ...current, ...updates };
  await saveConfig(updated);
  return updated;
}

/**
 * Get the API token, checking env var first, then config file.
 */
export async function getApiToken(): Promise<string | undefined> {
  // Environment variable takes precedence
  const envToken = process.env.FASTMAIL_API_TOKEN;
  if (envToken) {
    return envToken;
  }

  const config = await loadConfig();
  return config.apiToken;
}

/**
 * Check file permissions and warn if too open.
 * Returns true if permissions are safe (owner-only).
 */
export async function checkConfigPermissions(): Promise<boolean> {
  const configPath = getConfigPath();

  try {
    const stats = await stat(configPath);
    const mode = stats.mode & 0o777;

    // Warn if group or others can read
    if (mode & 0o077) {
      console.error(
        `Warning: Config file ${configPath} has unsafe permissions (${mode.toString(8)}).`,
      );
      console.error(`Consider running: chmod 600 ${configPath}`);
      return false;
    }

    return true;
  } catch {
    // File doesn't exist yet, that's fine
    return true;
  }
}
