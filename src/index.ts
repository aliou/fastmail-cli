#!/usr/bin/env bun
import { hasHelp } from "./args.ts";
import {
  leafHelp,
  printCompletion,
  printConciseHelp,
  printGroupHelp,
  printHelp,
  printVersion,
} from "./cli.ts";
import { commands, findCommand, findSubcommand } from "./commands/registry.ts";
import { APP_NAME } from "./constants.ts";
import { CliError, usageError } from "./error.ts";
import { invocationArgs } from "./runtime.ts";

function distance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const saved = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = saved;
    }
  }
  return row[right.length] ?? 0;
}

function suggestion(input: string, candidates: string[]): string {
  const closest = candidates
    .map((name) => ({ name, score: distance(input, name) }))
    .sort((a, b) => a.score - b.score)[0];
  return closest && closest.score <= 3
    ? ` Did you mean '${closest.name}'?`
    : "";
}

async function showHelp(args: string[]): Promise<void> {
  if (args.length === 0) {
    printHelp();
    return;
  }
  const command = findCommand(args[0] ?? "");
  if (!command) {
    throw usageError(
      `Unknown command: ${args[0]}.${suggestion(
        args[0] ?? "",
        commands.map((item) => item.name),
      )}`,
    );
  }
  if (args.length === 1) {
    printGroupHelp(command);
    return;
  }
  const subcommand = findSubcommand(command, args[1] ?? "");
  if (!subcommand) {
    throw usageError(
      `Unknown subcommand: ${args[1]}.${suggestion(
        args[1] ?? "",
        command.subcommands.map((item) => item.name),
      )}`,
    );
  }
  if (args.length > 2)
    throw usageError("help accepts at most a command and subcommand");
  await leafHelp(subcommand);
}

async function showInlineHelp(args: string[]): Promise<void> {
  const command = args.map(findCommand).find((item) => item !== undefined);
  if (!command) {
    printHelp();
    return;
  }
  const commandIndex = args.findIndex((arg) => findCommand(arg) === command);
  const subcommandName = args
    .slice(commandIndex + 1)
    .find((arg) => findSubcommand(command, arg));
  if (!subcommandName) {
    printGroupHelp(command);
    return;
  }
  const subcommand = findSubcommand(command, subcommandName);
  if (subcommand) await leafHelp(subcommand);
}

async function dispatch(args: string[]): Promise<void> {
  if (args.length === 0) {
    printConciseHelp();
    return;
  }
  if (hasHelp(args)) {
    if (args[0] === "help")
      await showHelp(
        args.slice(1).filter((arg) => arg !== "--help" && arg !== "-h"),
      );
    else await showInlineHelp(args);
    return;
  }
  const separator = args.indexOf("--");
  const globalArgs = separator === -1 ? args : args.slice(0, separator);
  if (globalArgs.includes("--version") || globalArgs.includes("-v")) {
    printVersion();
    return;
  }
  if (args[0] === "help") {
    await showHelp(args.slice(1));
    return;
  }
  if (args[0] === "--completion" || args[0]?.startsWith("--completion=")) {
    const shell = args[0].includes("=")
      ? args[0].slice("--completion=".length)
      : args[1];
    if (!shell || args.length > 2)
      throw usageError("Usage: fastmail --completion <bash|zsh|fish>");
    console.error(
      "fastmail: --completion is deprecated; use 'fastmail completion <shell>' instead",
    );
    printCompletion(shell);
    return;
  }

  const commandName = args[0];
  if (!commandName || commandName.startsWith("-"))
    throw usageError(`Unknown option: ${commandName}`);
  const command = findCommand(commandName);
  if (!command) {
    throw usageError(
      `Unknown command: ${commandName}.${suggestion(
        commandName,
        commands.map((item) => item.name),
      )}`,
    );
  }
  const subcommandName = args[1];
  if (!subcommandName)
    throw usageError(
      `Missing subcommand for '${command.name}'. Run 'fastmail help ${command.name}'.`,
    );
  const subcommand = findSubcommand(command, subcommandName);
  if (!subcommand) {
    if (subcommandName.startsWith("-"))
      throw usageError(`Unknown option: ${subcommandName}`);
    throw usageError(
      `Unknown subcommand: ${subcommandName}.${suggestion(
        subcommandName,
        command.subcommands.map((item) => item.name),
      )}`,
    );
  }
  if (!subcommand.load)
    throw usageError(`Command not available: ${commandName} ${subcommandName}`);
  const run = await subcommand.load();
  await run(args.slice(2));
}

export async function main(args: string[]): Promise<number> {
  const separator = args.indexOf("--");
  const globalArgs = separator === -1 ? args : args.slice(0, separator);
  const verbose = globalArgs.includes("--verbose");
  const cleanArgs = args.filter(
    (arg, index) =>
      arg !== "--verbose" || (separator !== -1 && index > separator),
  );
  try {
    await dispatch(cleanArgs);
    return 0;
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    if (verbose || process.env.FASTMAIL_DEBUG === "1") console.error(error);
    else
      console.error(
        `${APP_NAME}: ${error instanceof Error ? error.message : String(error)}`,
      );
    return exitCode;
  }
}

if (import.meta.main) {
  process.exitCode = await main(invocationArgs());
}
