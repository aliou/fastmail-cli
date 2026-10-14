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

| Key | Description |
| --- | --- |
| `apiToken` | FastMail API token |
| `defaultAccountId` | Default account ID (if multiple accounts) |
| `proxyUrl` | Base URL of an HTTP proxy for the FastMail API (see below) |
| `outputFormat` | Default output format (`table` or `json`) |

Environment variables override the config file:

- `FASTMAIL_API_TOKEN` — API token
- `FASTMAIL_PROXY_URL` — proxy base URL

### HTTP proxy

All requests normally go directly to `https://api.fastmail.com`. To route
them through an HTTP API proxy (e.g. an API gateway that fronts the FastMail
API), set the proxy base URL:

```bash
export FASTMAIL_PROXY_URL="https://proxy.example.com/fastmail"
fastmail email list
```

or persist it in the config file:

```json
{
  "proxyUrl": "https://proxy.example.com/fastmail"
}
```

The proxy base replaces `https://api.fastmail.com`, and the rest of each path
is preserved, so every JMAP endpoint (session discovery, API calls, blob
upload/download) stays on the proxy:

```text
direct:  https://api.fastmail.com/jmap/session
proxy:   https://proxy.example.com/fastmail/jmap/session
```

The URLs advertised by the JMAP session response (`apiUrl`, `uploadUrl`,
`downloadUrl`) are rewritten the same way, so nothing bypasses the proxy.
The proxy must therefore forward to `https://api.fastmail.com` as its
upstream, preserving the `/jmap/...` paths.

Authentication normally uses your FastMail API token (`Authorization: Bearer
...`). When a proxy is configured, the token becomes optional: it is still
sent when present, but a proxy that injects its own credentials will replace
or ignore it — so with such a proxy no token is needed at all.

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
