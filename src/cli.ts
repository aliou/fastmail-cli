import { parseArgs as bunParseArgs } from "node:util";
import { APP_NAME, VERSION } from "./constants.js";

export interface CliOptions {
  help: boolean;
  version: boolean;
  completion: string | null;
  command: string | null;
  subcommand: string | null;
  args: string[];
}

export function parseArgs(args: string[]): CliOptions {
  // Extract global flags using bunParseArgs
  const result = bunParseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      completion: { type: "string" },
    },
    strict: false,
    allowPositionals: true,
  });

  // Find command and subcommand from positionals
  const positionals = result.positionals;
  const command = positionals[0] ?? null;
  const subcommand = positionals[1] ?? null;

  // Collect all args after subcommand position for the subcommand handler
  const subcommandArgs: string[] = [];
  let foundSubcommand = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    // Skip until we've passed command and subcommand
    if (arg === command && !foundSubcommand) {
      continue;
    }
    if (arg === subcommand && !foundSubcommand) {
      foundSubcommand = true;
      continue;
    }

    if (foundSubcommand) {
      // Skip global flags (but pass --help to subcommand too)
      if (arg === "-v" || arg === "--version") {
        continue;
      }
      if (arg === "--completion" || arg.startsWith("--completion=")) {
        continue;
      }
      subcommandArgs.push(arg);
    }
  }

  return {
    help: Boolean(result.values.help),
    version: Boolean(result.values.version),
    completion:
      typeof result.values.completion === "string"
        ? result.values.completion
        : null,
    command,
    subcommand,
    args: subcommandArgs,
  };
}

export function printVersion(): void {
  console.log(`${APP_NAME} version ${VERSION}`);
}

export function printHelp(): void {
  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

  console.log(`
${bold("FastMail CLI")} - Access FastMail from your terminal via JMAP

${bold("Usage:")}
  ${APP_NAME} <command> [subcommand] [flags]

${bold("Commands:")}
  attachment  Attachment operations ${dim("(list, get, download)")}
  auth        Manage authentication ${dim("(login, logout, status)")}
  batch       Batch operations ${dim("(read, unread, flag, unflag, move, delete, modify)")}
  draft       Draft management ${dim("(list, get, create, update, delete, send)")}
  email       Email operations ${dim("(list, get, send, search, mark-read, mark-unread)")}
  mailbox     Mailbox management ${dim("(list, create, update, delete)")}
  masked      Masked email addresses ${dim("(list, create, update, delete)")}
  thread      Thread operations ${dim("(get, modify, attachments)")}
  url         Generate web URLs ${dim("(email, mailbox, search, compose)")}

${bold("Flags:")}
  -h, --help       Show help
  -v, --version    Show version
  --completion     Generate shell completion ${dim("(bash, zsh, fish)")}

${bold("Examples:")}
  ${APP_NAME} auth login
  ${APP_NAME} email list --mailbox inbox --limit 10
  ${APP_NAME} email get <id>
  ${APP_NAME} email mark-read <id1> <id2>
  ${APP_NAME} batch read --mailbox Inbox --limit 100
  ${APP_NAME} batch move --to Archive --query "before:2025-01-01"
  ${APP_NAME} mailbox list
  ${APP_NAME} masked create --for-url example.com

${bold("Configuration:")}
  Config file: ~/.config/fastmail-cli/config.json
  API token:   Get from FastMail Settings > Privacy & Security > API tokens

Use "${APP_NAME} <command> --help" for more information about a command.
`);
}

export function generateBashCompletion(): string {
  return `# ${APP_NAME} bash completion
# Add to .bashrc: source <(${APP_NAME} --completion bash)

_${APP_NAME}_completions() {
    local cur prev words cword
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    local commands="attachment auth batch draft email mailbox masked thread url"
    local attachment_cmds="list get download"
    local auth_cmds="login logout status"
    local batch_cmds="read unread flag unflag move delete modify"
    local draft_cmds="list get create update delete send"
    local email_cmds="list get send search mark-read mark-unread"
    local mailbox_cmds="list create update delete"
    local masked_cmds="list create update delete"
    local thread_cmds="get modify attachments"
    local url_cmds="email mailbox search compose"

    case "\${COMP_CWORD}" in
        1)
            COMPREPLY=( $(compgen -W "\${commands} --help --version --completion" -- "\${cur}") )
            ;;
        2)
            case "\${prev}" in
                attachment)
                    COMPREPLY=( $(compgen -W "\${attachment_cmds}" -- "\${cur}") )
                    ;;
                auth)
                    COMPREPLY=( $(compgen -W "\${auth_cmds}" -- "\${cur}") )
                    ;;
                batch)
                    COMPREPLY=( $(compgen -W "\${batch_cmds}" -- "\${cur}") )
                    ;;
                draft)
                    COMPREPLY=( $(compgen -W "\${draft_cmds}" -- "\${cur}") )
                    ;;
                email)
                    COMPREPLY=( $(compgen -W "\${email_cmds}" -- "\${cur}") )
                    ;;
                mailbox)
                    COMPREPLY=( $(compgen -W "\${mailbox_cmds}" -- "\${cur}") )
                    ;;
                masked)
                    COMPREPLY=( $(compgen -W "\${masked_cmds}" -- "\${cur}") )
                    ;;
                thread)
                    COMPREPLY=( $(compgen -W "\${thread_cmds}" -- "\${cur}") )
                    ;;
                url)
                    COMPREPLY=( $(compgen -W "\${url_cmds}" -- "\${cur}") )
                    ;;
                --completion)
                    COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
                    ;;
            esac
            ;;
    esac
    return 0
}

complete -F _${APP_NAME}_completions ${APP_NAME}
`;
}

export function generateZshCompletion(): string {
  return `#compdef ${APP_NAME}
# ${APP_NAME} zsh completion
# Add to .zshrc: source <(${APP_NAME} --completion zsh)

_${APP_NAME}() {
    local -a commands attachment_cmds auth_cmds batch_cmds draft_cmds email_cmds mailbox_cmds masked_cmds

    commands=(
        'attachment:Attachment operations'
        'auth:Manage authentication'
        'batch:Batch operations'
        'draft:Draft management'
        'email:Email operations'
        'mailbox:Mailbox management'
        'masked:Masked email addresses'
        'thread:Thread operations'
        'url:Generate web URLs'
    )

    attachment_cmds=('list:List attachments on an email' 'get:Download a specific attachment' 'download:Download all attachments')
    auth_cmds=('login:Authenticate with API token' 'logout:Remove stored credentials' 'status:Show auth status')
    batch_cmds=('read:Mark emails as read' 'unread:Mark emails as unread' 'flag:Flag emails' 'unflag:Unflag emails' 'move:Move emails' 'delete:Delete emails' 'modify:Modify emails')
    draft_cmds=('list:List drafts' 'get:Get draft by ID' 'create:Create a draft' 'update:Update a draft' 'delete:Delete a draft' 'send:Send a draft')
    email_cmds=('list:List emails' 'get:Get email by ID' 'send:Send an email' 'search:Search emails' 'mark-read:Mark emails as read' 'mark-unread:Mark emails as unread')
    mailbox_cmds=('list:List mailboxes' 'create:Create mailbox' 'update:Update mailbox' 'delete:Delete mailbox')
    masked_cmds=('list:List masked emails' 'create:Create masked email' 'update:Update masked email' 'delete:Delete masked email')
    thread_cmds=('get:Get a thread with all messages' 'modify:Modify labels/keywords' 'attachments:List thread attachments')
    url_cmds=('email:Generate URL for email(s)' 'mailbox:Generate URL for mailbox' 'search:Generate search URL' 'compose:Generate compose URL')

    _arguments -s \\
        '-h[Show help]' \\
        '--help[Show help]' \\
        '-v[Show version]' \\
        '--version[Show version]' \\
        '--completion[Generate completion]:shell:(bash zsh fish)' \\
        '1:command:->command' \\
        '2:subcommand:->subcommand' \\
        '*::args:->args'

    case "$state" in
        command)
            _describe 'command' commands
            ;;
        subcommand)
            case "$words[1]" in
                attachment) _describe 'subcommand' attachment_cmds ;;
                auth) _describe 'subcommand' auth_cmds ;;
                batch) _describe 'subcommand' batch_cmds ;;
                draft) _describe 'subcommand' draft_cmds ;;
                email) _describe 'subcommand' email_cmds ;;
                mailbox) _describe 'subcommand' mailbox_cmds ;;
                masked) _describe 'subcommand' masked_cmds ;;
                thread) _describe 'subcommand' thread_cmds ;;
                url) _describe 'subcommand' url_cmds ;;
            esac
            ;;
    esac
}

compdef _${APP_NAME} ${APP_NAME}
`;
}

export function generateFishCompletion(): string {
  return `# ${APP_NAME} fish completion
# Add to fish: ${APP_NAME} --completion fish | source

# Disable file completion by default
complete -c ${APP_NAME} -f

# Global flags
complete -c ${APP_NAME} -s h -l help -d 'Show help'
complete -c ${APP_NAME} -s v -l version -d 'Show version'
complete -c ${APP_NAME} -l completion -d 'Generate completion' -xa 'bash zsh fish'

# Commands
complete -c ${APP_NAME} -n __fish_use_subcommand -a attachment -d 'Attachment operations'
complete -c ${APP_NAME} -n __fish_use_subcommand -a auth -d 'Manage authentication'
complete -c ${APP_NAME} -n __fish_use_subcommand -a batch -d 'Batch operations'
complete -c ${APP_NAME} -n __fish_use_subcommand -a draft -d 'Draft management'
complete -c ${APP_NAME} -n __fish_use_subcommand -a email -d 'Email operations'
complete -c ${APP_NAME} -n __fish_use_subcommand -a mailbox -d 'Mailbox management'
complete -c ${APP_NAME} -n __fish_use_subcommand -a masked -d 'Masked email addresses'
complete -c ${APP_NAME} -n __fish_use_subcommand -a thread -d 'Thread operations'
complete -c ${APP_NAME} -n __fish_use_subcommand -a url -d 'Generate web URLs'

# attachment subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from attachment' -a list -d 'List attachments on an email'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from attachment' -a get -d 'Download a specific attachment'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from attachment' -a download -d 'Download all attachments'

# auth subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from auth' -a login -d 'Authenticate with API token'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from auth' -a logout -d 'Remove stored credentials'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from auth' -a status -d 'Show auth status'

# batch subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from batch' -a read -d 'Mark emails as read'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from batch' -a unread -d 'Mark emails as unread'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from batch' -a flag -d 'Flag emails'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from batch' -a unflag -d 'Unflag emails'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from batch' -a move -d 'Move emails'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from batch' -a delete -d 'Delete emails'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from batch' -a modify -d 'Modify emails'

# draft subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from draft' -a list -d 'List drafts'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from draft' -a get -d 'Get draft by ID'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from draft' -a create -d 'Create a draft'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from draft' -a update -d 'Update a draft'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from draft' -a delete -d 'Delete a draft'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from draft' -a send -d 'Send a draft'

# email subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from email' -a list -d 'List emails'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from email' -a get -d 'Get email by ID'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from email' -a send -d 'Send an email'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from email' -a search -d 'Search emails'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from email' -a mark-read -d 'Mark emails as read'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from email' -a mark-unread -d 'Mark emails as unread'

# mailbox subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from mailbox' -a list -d 'List mailboxes'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from mailbox' -a create -d 'Create mailbox'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from mailbox' -a update -d 'Update mailbox'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from mailbox' -a delete -d 'Delete mailbox'

# masked subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from masked' -a list -d 'List masked emails'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from masked' -a create -d 'Create masked email'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from masked' -a update -d 'Update masked email'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from masked' -a delete -d 'Delete masked email'

# thread subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from thread' -a get -d 'Get a thread with all messages'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from thread' -a modify -d 'Modify labels/keywords'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from thread' -a attachments -d 'List thread attachments'

# url subcommands
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from url' -a email -d 'Generate URL for email(s)'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from url' -a mailbox -d 'Generate URL for mailbox'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from url' -a search -d 'Generate search URL'
complete -c ${APP_NAME} -n '__fish_seen_subcommand_from url' -a compose -d 'Generate compose URL'
`;
}

export function printCompletion(shell: string): boolean {
  switch (shell.toLowerCase()) {
    case "bash":
      console.log(generateBashCompletion());
      return true;
    case "zsh":
      console.log(generateZshCompletion());
      return true;
    case "fish":
      console.log(generateFishCompletion());
      return true;
    default:
      console.error(`Unknown shell: ${shell}`);
      console.error("Supported shells: bash, zsh, fish");
      return false;
  }
}
