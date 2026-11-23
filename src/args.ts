import { parseArgs as bunParseArgs } from "node:util";
import { usageError } from "./error.ts";

export type ParsedArgs = {
  values: Record<string, string | boolean | string[] | undefined>;
  positionals: string[];
};

type Options = Record<
  string,
  { type: "string" | "boolean"; short?: string; multiple?: boolean }
>;

export function hasHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

export function parseArgs(
  args: string[],
  options: Options = {},
  arity: [min: number, max: number | null] = [0, null],
): ParsedArgs {
  if (hasHelp(args)) {
    return { values: { help: true }, positionals: [] };
  }

  try {
    const result = bunParseArgs({
      args,
      options: {
        help: { type: "boolean", short: "h" },
        ...options,
      },
      strict: true,
      allowPositionals: true,
    });
    const [min, max] = arity;
    const count = result.positionals.length;
    if (count < min || (max !== null && count > max)) {
      const expected =
        max === null
          ? `at least ${min}`
          : min === max
            ? `${min}`
            : `${min}-${max}`;
      throw usageError(
        `Expected ${expected} positional arguments; received ${count}`,
      );
    }
    return {
      values: result.values as ParsedArgs["values"],
      positionals: result.positionals,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid arguments";
    const concise =
      message
        .replace(/^ERR_PARSE_ARGS_[A-Z_]+: /, "")
        .split(". To specify")[0] ?? message;
    throw usageError(concise);
  }
}

export function wantsHelp(parsed: ParsedArgs): boolean {
  return Boolean(parsed.values.help);
}

export function getString(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.values[key];
  return typeof value === "string" ? value : undefined;
}

export function getBoolean(parsed: ParsedArgs, key: string): boolean {
  return Boolean(parsed.values[key]);
}

export function getNumber(parsed: ParsedArgs, key: string): number | undefined {
  const value = getString(parsed, key);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw usageError(
      `Option '--${key} <value>' must be a non-negative integer`,
    );
  }
  return number;
}

export function getPositional(
  parsed: ParsedArgs,
  index: number,
): string | undefined {
  return parsed.positionals[index];
}
