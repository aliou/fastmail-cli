# fastmail-cli

CLI for FastMail via JMAP.

## Installation

### Homebrew (macOS Apple Silicon)

```bash
brew tap aliou/toolbox
brew install fastmail-cli
```

### From source (requires Bun)

```bash
git clone https://github.com/aliou/fastmail-cli
cd fastmail-cli
bun install
bun run start
```

### Using Nix

```bash
nix run github:aliou/fastmail-cli
```

## Setup

1. Get an API token from FastMail under Settings > Privacy & Security > Integrations > API tokens.
2. Store the token without putting it in command arguments:

   ```bash
   fastmail auth login --token-file /path/to/token
   ```

   Or pipe it through stdin:

   ```bash
   fastmail auth login --token-file - < /path/to/token
   ```

Interactive login is available on a TTY with `fastmail auth login`. `--token` and `FASTMAIL_API_TOKEN` are deprecated; use token files or the stored config instead.

## Usage

```bash
fastmail auth status
fastmail email list --mailbox Inbox --limit 10
fastmail email get <id>
fastmail email send --to person@example.com --subject "Hello" --body "Hi"
fastmail email search "from:person@example.com" --after 7d
fastmail mailbox list
fastmail mailbox create <name>
fastmail masked create --for-domain example.com
fastmail unsubscribe execute <id> --auto
```

Run `fastmail help`, `fastmail help <command>`, or `fastmail help <command> <subcommand>` for help. Usage errors exit 2; runtime failures exit 1.

Structured commands accept `--json`. Stdout contains data such as JSON and URLs. Progress, confirmations, warnings, and errors go to stderr.

## Shell completion

```bash
# Bash
source <(fastmail completion bash)

# Zsh
source <(fastmail completion zsh)

# Fish
fastmail completion fish | source
```

## Agent instructions

```bash
fastmail skill path
```

Read the printed `SKILL.md` path for the bundled FastMail CLI agent instructions and command references.

## Configuration

Config file: `~/.config/fastmail-cli/config.json`

## Development

All commands run inside the Nix development shell:

```bash
nix develop
bun run start
bun test
bun run lint
bun run typecheck
bun run build
```

## License

MIT
