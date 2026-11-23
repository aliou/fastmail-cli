import {
  type Command,
  commands,
  type Subcommand,
} from "./commands/registry.ts";
import { APP_NAME, VERSION } from "./constants.ts";
import { usageError } from "./error.ts";

function style(text: string, code: string): string {
  if (process.env.NO_COLOR !== undefined || !process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

const bold = (text: string) => style(text, "1");

function examples(lines: string[]): string {
  return `${bold("Examples:")}\n${lines.map((line) => `  ${line}`).join("\n")}`;
}

export function printVersion(): void {
  console.log(`${APP_NAME} version ${VERSION}`);
}

export function printConciseHelp(): void {
  console.log(`${examples(["fastmail email list", "fastmail auth login --token-file ./token"])}

${APP_NAME} accesses FastMail through JMAP.

Common commands: auth, email, mailbox, draft, help
Run '${APP_NAME} --help' for all commands.`);
}

export function printHelp(): void {
  const lines = commands.map((command) => {
    const alias =
      command.aliases.length > 0 ? ` (${command.aliases.join(", ")})` : "";
    return `  ${command.name}${alias}\t${command.summary}`;
  });
  console.log(`${examples(["fastmail email list --mailbox Inbox --limit 10", "fastmail email get EMAIL_ID", "fastmail batch read --mailbox Inbox", "fastmail masked create --for-domain example.com"])}

${bold("FastMail CLI")} - Access FastMail from your terminal via JMAP

${bold("Usage:")}
  ${APP_NAME} <command> [subcommand] [flags]

${bold("Commands:")}
${lines.join("\n")}

${bold("Flags:")}
  -h, --help       Show help
  -v, --version    Show version
  --completion     Generate shell completion (deprecated; use completion)
  --verbose        Show error stacks

For AI agents: run fastmail skill path, then read the printed SKILL.md.
Use '${APP_NAME} help <command> [subcommand]' for command help.`);
}

export function printGroupHelp(command: Command): void {
  const aliases =
    command.aliases.length > 0
      ? `\nAliases: ${command.aliases.join(", ")}`
      : "";
  const subcommands = command.subcommands
    .map((item) => `  ${item.name}\t${item.summary}`)
    .join("\n");
  console.log(`${examples(command.examples)}

${bold("Usage:")}
  ${APP_NAME} ${command.name} <subcommand> [flags]${aliases}

${bold(command.summary)}

${bold("Subcommands:")}
${subcommands || "  (none)"}

Use '${APP_NAME} help ${command.name} <subcommand>' for detailed help.`);
}

export function printLeafHelp(text: string): void {
  const trimmed = text.trim();
  const match = trimmed.match(/(?:^|\n)(Examples?:\n[\s\S]*)/);
  if (!match || match.index === undefined) {
    console.log(trimmed);
    return;
  }
  const examplesText = match[1] ?? "";
  const remainder =
    `${trimmed.slice(0, match.index)}\n${trimmed.slice((match.index ?? 0) + match[0].length)}`.trim();
  console.log(`${examplesText.trim()}\n\n${remainder}`);
}

export async function leafHelp(subcommand: Subcommand): Promise<void> {
  if (!subcommand.load) return;
  const run = await subcommand.load();
  const output: string[] = [];
  const log = console.log;
  console.log = (...values: unknown[]) =>
    output.push(values.map(String).join(" "));
  try {
    await run(["--help"]);
  } finally {
    console.log = log;
  }
  const text = output.join("\n");
  const withExamples = /(?:^|\n)Examples?:/.test(text)
    ? text
    : `Examples:\n${subcommand.examples.map((line) => `  ${line}`).join("\n")}\n\n${text}`;
  printLeafHelp(withExamples);
}

export function generateBashCompletion(): string {
  const names = commands
    .flatMap((command) => [command.name, ...command.aliases])
    .join(" ");
  const variables = commands
    .map(
      (command) =>
        `    local ${command.name}_cmds="${command.subcommands.map((item) => item.name).join(" ")}"`,
    )
    .join("\n");
  const cases = commands
    .map((command) => {
      const namesPattern = [command.name, ...command.aliases].join("|");
      return `                ${namesPattern}) COMPREPLY=( $(compgen -W "\${${command.name}_cmds} --help" -- "\${cur}") ) ;;`;
    })
    .join("\n");
  const flagCases = commands
    .flatMap((command) =>
      [command.name, ...command.aliases].flatMap((commandName) =>
        command.subcommands.map(
          (item) =>
            `                ${commandName}:${item.name}) COMPREPLY=( $(compgen -W "${item.flags.join(" ")}" -- "\${cur}") ) ;;`,
        ),
      ),
    )
    .join("\n");
  return `# ${APP_NAME} bash completion
_${APP_NAME}_completions() {
    local cur prev
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    local commands="${names}"
${variables}
    case "\${COMP_CWORD}" in
        1) COMPREPLY=( $(compgen -W "\${commands} --help --version --verbose" -- "\${cur}") ) ;;
        2)
            case "\${prev}" in
${cases}
                completion) COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") ) ;;
            esac ;;
        *)
            case "\${COMP_WORDS[1]}:\${COMP_WORDS[2]}" in
${flagCases}
                *) COMPREPLY=( $(compgen -W "--help" -- "\${cur}") ) ;;
            esac ;;
    esac
}
complete -F _${APP_NAME}_completions ${APP_NAME}
`;
}

export function generateZshCompletion(): string {
  const commandValues = commands
    .map((command) => `        '${command.name}:${command.summary}'`)
    .join("\n");
  const variables = commands
    .map(
      (command) =>
        `    ${command.name}_cmds=(${command.subcommands.map((item) => `'${item.name}:${item.summary}'`).join(" ")})`,
    )
    .join("\n");
  const cases = commands
    .map((command) => {
      const pattern = [command.name, ...command.aliases].join("|");
      return `                ${pattern}) _describe 'subcommand' ${command.name}_cmds ;;`;
    })
    .join("\n");
  const flagCases = commands
    .flatMap((command) =>
      [command.name, ...command.aliases].flatMap((commandName) =>
        command.subcommands.map(
          (item) =>
            `                ${commandName}:${item.name}) _values 'flag' ${item.flags.map((flag) => `'${flag}'`).join(" ")} ;;`,
        ),
      ),
    )
    .join("\n");
  return `#compdef ${APP_NAME}
_${APP_NAME}() {
    local -a commands
    commands=(
${commandValues}
    )
${variables}
    _arguments -s '-h[Show help]' '--help[Show help]' '-v[Show version]' '--version[Show version]' '--verbose[Show error stacks]' '1:command:->command' '2:subcommand:->subcommand' '*::args:->args'
    case "$state" in
        command) _describe 'command' commands ;;
        subcommand)
            case "$words[2]" in
${cases}
            esac ;;
        args)
            case "$words[2]:$words[3]" in
${flagCases}
                *) _values 'flag' '--help[Show help]' ;;
            esac ;;
    esac
}
compdef _${APP_NAME} ${APP_NAME}
`;
}

export function generateFishCompletion(): string {
  const lines = [
    `# ${APP_NAME} fish completion`,
    `complete -c ${APP_NAME} -f`,
    `complete -c ${APP_NAME} -s h -l help -d 'Show help'`,
    `complete -c ${APP_NAME} -s v -l version -d 'Show version'`,
    `complete -c ${APP_NAME} -l verbose -d 'Show error stacks'`,
  ];
  for (const command of commands) {
    for (const name of [command.name, ...command.aliases]) {
      lines.push(
        `complete -c ${APP_NAME} -n __fish_use_subcommand -a ${name} -d '${command.summary}'`,
      );
    }
    const condition = `__fish_seen_subcommand_from ${[command.name, ...command.aliases].join(" ")}`;
    for (const item of command.subcommands) {
      lines.push(
        `complete -c ${APP_NAME} -n '${condition}' -a ${item.name} -d '${item.summary}'`,
      );
      for (const flag of item.flags) {
        const long = flag.replace(/^-+/, "");
        const short =
          flag.startsWith("-") && !flag.startsWith("--") ? ` -s ${long}` : "";
        const longFlag = flag.startsWith("--") ? ` -l ${long}` : "";
        lines.push(
          `complete -c ${APP_NAME} -n '${condition}; and __fish_seen_subcommand_from ${item.name}'${longFlag}${short} -d '${item.summary}'`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function printCompletion(shell: string): void {
  switch (shell) {
    case "bash":
      console.log(generateBashCompletion());
      return;
    case "zsh":
      console.log(generateZshCompletion());
      return;
    case "fish":
      console.log(generateFishCompletion());
      return;
    default:
      throw usageError(
        `Unknown shell: ${shell}. Supported shells: bash, zsh, fish`,
      );
  }
}
