# fastmail-cli

CLI for FastMail via JMAP.

## Installation

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

1. Get an API token from FastMail:
   - Go to Settings > Privacy & Security > Integrations > API tokens
   - Create a new token with the scopes you need

2. Configure the CLI:
   ```bash
   fastmail auth login
   ```

## Usage

```bash
# Authentication
fastmail auth login      # Store API token
fastmail auth logout     # Remove credentials
fastmail auth status     # Check auth status

# Email
fastmail email list               # List recent emails
fastmail email get <id>           # Get email by ID
fastmail email send               # Send an email
fastmail email search <query>     # Search emails

# Mailboxes
fastmail mailbox list             # List mailboxes
fastmail mailbox create <name>    # Create mailbox
fastmail mailbox delete <id>      # Delete mailbox

# Masked Email
fastmail masked list              # List masked addresses
fastmail masked create            # Create masked address
fastmail masked delete <id>       # Delete masked address
```

## Shell Completions

```bash
# Bash
source <(fastmail --completion bash)

# Zsh
source <(fastmail --completion zsh)

# Fish
fastmail --completion fish | source
```

## Configuration

Config file: `~/.config/fastmail-cli/config.json`

## Development

```bash
# Enter dev shell
nix develop

# Run
bun run start

# Lint
bun run lint

# Format
bun run format

# Type check
bun run typecheck
```

## License

MIT
