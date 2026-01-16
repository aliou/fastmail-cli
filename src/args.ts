/**
 * Shared argument parsing utilities using Bun's parseArgs.
 */

import { parseArgs as bunParseArgs } from "util";

export type ParsedArgs = {
  values: Record<string, string | boolean | string[] | undefined>;
  positionals: string[];
};

/**
 * Parse command-line arguments using Bun's parseArgs utility.
 *
 * Supports:
 * - Boolean flags: --flag, -f
 * - String options: --key value, --key=value
 * - Positional arguments
 *
 * All unknown flags are allowed (strict: false).
 */
export function parseArgs(
  args: string[],
  options?: Record<
    string,
    { type: "string" | "boolean"; short?: string; multiple?: boolean }
  >,
): ParsedArgs {
  // Default options that are common across commands
  const defaultOptions = {
    help: { type: "boolean" as const, short: "h" },
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    const result = bunParseArgs({
      args,
      options: mergedOptions,
      strict: false,
      allowPositionals: true,
    });

    return {
      values: result.values as Record<
        string,
        string | boolean | string[] | undefined
      >,
      positionals: result.positionals,
    };
  } catch {
    // Fallback for edge cases - return empty result
    return {
      values: { help: false },
      positionals: args.filter((a) => !a.startsWith("-")),
    };
  }
}

/**
 * Check if help flag is set.
 */
export function wantsHelp(parsed: ParsedArgs): boolean {
  return Boolean(parsed.values.help || parsed.values.h);
}

/**
 * Get a string value from parsed args.
 */
export function getString(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.values[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Get a boolean value from parsed args.
 */
export function getBoolean(parsed: ParsedArgs, key: string): boolean {
  return Boolean(parsed.values[key]);
}

/**
 * Get a number value from parsed args.
 */
export function getNumber(parsed: ParsedArgs, key: string): number | undefined {
  const value = parsed.values[key];
  if (typeof value === "string") {
    const num = Number.parseInt(value, 10);
    return Number.isNaN(num) ? undefined : num;
  }
  return undefined;
}

/**
 * Get positional argument by index.
 */
export function getPositional(
  parsed: ParsedArgs,
  index: number,
): string | undefined {
  return parsed.positionals[index];
}
