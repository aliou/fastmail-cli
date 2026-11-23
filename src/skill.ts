import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getPositional, parseArgs, wantsHelp } from "./args.ts";
import { runtimeError, usageError } from "./error.ts";
import { entrypointPath } from "./runtime.ts";

const skillName = "fastmail-cli";

export async function getSkillPath(entryPath: string): Promise<string> {
  const realEntryPath = await realpath(entryPath);
  const prefix = dirname(dirname(realEntryPath));
  const path = resolve(
    join(prefix, "share", "fastmail", "skills", skillName, "SKILL.md"),
  );
  try {
    await access(path, constants.R_OK);
  } catch {
    throw runtimeError(`Bundled skill not found: ${path}`);
  }
  return path;
}

export async function skillCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail skill path\n  fastmail skill path fastmail-cli\n\nUsage: fastmail skill path [fastmail-cli]`,
    );
    return;
  }
  const name = getPositional(parsed, 0) ?? skillName;
  if (name !== skillName || parsed.positionals.length > 1) {
    throw usageError(`Unknown skill: ${name}. Available skills: ${skillName}`);
  }
  const entryPath = entrypointPath();
  if (!entryPath) throw runtimeError("Cannot determine the executable path");
  console.log(await getSkillPath(entryPath));
}
