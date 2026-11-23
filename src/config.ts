import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_FILE } from "./constants.ts";
import { atomicWriteFile } from "./files.ts";

export interface Config {
  apiToken?: string;
  defaultAccountId?: string;
}

export type TokenSource = "env" | "config";

export function getConfigDir(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "fastmail-cli");
}

export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE);
}

export function validateConfig(data: unknown): Config {
  if (!data || typeof data !== "object") return {};
  const object = data as Record<string, unknown>;
  return {
    ...(typeof object.apiToken === "string" && { apiToken: object.apiToken }),
    ...(typeof object.defaultAccountId === "string" && {
      defaultAccountId: object.defaultAccountId,
    }),
  };
}

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();
  const file = Bun.file(configPath);
  if (!(await file.exists())) return {};
  try {
    return validateConfig(JSON.parse(await file.text()));
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(
        `fastmail: invalid config file at ${configPath}; using defaults`,
      );
      return {};
    }
    throw error;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await atomicWriteFile(
    configPath,
    `${JSON.stringify(config, null, 2)}\n`,
    0o600,
  );
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const updated = { ...(await loadConfig()), ...updates };
  await saveConfig(updated);
  return updated;
}

export async function getToken(): Promise<
  | { token: string; source: TokenSource }
  | { token: undefined; source: undefined }
> {
  const envToken = process.env.FASTMAIL_API_TOKEN;
  if (envToken) {
    console.error(
      "fastmail: FASTMAIL_API_TOKEN is deprecated; use 'fastmail auth login --token-file <path>' instead",
    );
    return { token: envToken, source: "env" };
  }
  const token = (await loadConfig()).apiToken;
  return token
    ? { token, source: "config" }
    : { token: undefined, source: undefined };
}

export async function getApiToken(): Promise<string | undefined> {
  return (await getToken()).token;
}

export async function checkConfigPermissions(): Promise<boolean> {
  const configPath = getConfigPath();
  try {
    const mode = (await stat(configPath)).mode & 0o777;
    if (mode & 0o077) {
      console.error(
        `fastmail: config file ${configPath} has unsafe permissions (${mode.toString(8)}); run chmod 600 ${configPath}`,
      );
      return false;
    }
    return true;
  } catch {
    return true;
  }
}
