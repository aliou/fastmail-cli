import { parseArgs, wantsHelp } from "../args.ts";
import { printCompletion } from "../cli.ts";
import { usageError } from "../error.ts";

async function completion(shell: string, args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (wantsHelp(parsed)) {
    console.log(
      `Examples:\n  fastmail completion ${shell}\n\nUsage: fastmail completion ${shell}`,
    );
    return;
  }
  if (parsed.positionals.length > 0)
    throw usageError(`completion ${shell} accepts no positional arguments`);
  printCompletion(shell);
}

export function bashCompletionCommand(args: string[]): Promise<void> {
  return completion("bash", args);
}

export function zshCompletionCommand(args: string[]): Promise<void> {
  return completion("zsh", args);
}

export function fishCompletionCommand(args: string[]): Promise<void> {
  return completion("fish", args);
}
