---
name: fastmail-cli
description: "Use the fastmail-cli to manage FastMail email, mailboxes, masked addresses, drafts, attachments, threads, and batch operations from the terminal. Use when performing any FastMail task via CLI: reading/sending email, managing mailboxes, creating masked addresses, batch modifications, downloading attachments, or generating web URLs."
---

# fastmail-cli

A CLI for FastMail built on the JMAP protocol.

## Setup

```sh
fastmail auth login
```

Provide an API token from FastMail Settings > Privacy & Security > API tokens. The token can be passed via `--token`, piped through stdin, or entered interactively.

Token resolution order: `FASTMAIL_API_TOKEN` env var, then `~/.config/fastmail-cli/config.json`.

## Commands

```
fastmail <command> [subcommand] [flags]
```

All commands support `--help` and `--json` flags.

| Command      | Subcommands                                         | Description                |
|--------------|-----------------------------------------------------|----------------------------|
| `auth`       | `login`, `logout`, `status`                         | Authentication             |
| `email`      | `list`, `get`, `send`, `search`, `mark-read`, `mark-unread` | Email operations  |
| `mailbox`    | `list`, `create`, `update`, `delete`                | Mailbox management         |
| `masked`     | `list`, `create`, `update`, `delete`                | Masked email addresses     |
| `batch`      | `read`, `unread`, `flag`, `unflag`, `move`, `delete`, `modify` | Bulk operations |
| `draft`      | `list`, `get`, `create`, `update`, `delete`, `send` | Draft management           |
| `attachment`  | `list`, `get`, `download`                          | Attachment operations      |
| `thread`     | `get`, `modify`, `attachments`                      | Thread operations          |
| `url`        | `email`, `mailbox`, `search`, `compose`             | Generate FastMail web URLs |
| `unsubscribe`| `show`, `execute`, `batch`                          | Newsletter unsubscribe     |

## Common workflows

```sh
# List recent unread emails
fastmail email list --unread --limit 10

# Search emails from the last week
fastmail email search "from:alice" --after 7d

# Send an email with attachment
fastmail email send --to bob@example.com --subject "Report" --body-file report.txt --attach data.csv

# Reply to an email
fastmail email send --reply-to EMAIL_ID --body "Thanks!"

# Batch archive old inbox emails
fastmail batch move --to Archive --mailbox Inbox --query "before:2025-01-01"

# Create a masked email for a website
fastmail masked create --for-domain https://example.com --description "Shopping"

# Download all attachments from an email
fastmail attachment download EMAIL_ID --dir ./downloads

# Batch unsubscribe from newsletters
fastmail unsubscribe batch --query "from:newsletter" --one-click-only --dry-run
```

## Detailed command reference

Each command's full options and examples are documented in the references directory:

- **Email**: See [references/email.md](references/email.md) for list, get, send, search, mark-read, mark-unread
- **Batch**: See [references/batch.md](references/batch.md) for bulk read, unread, flag, unflag, move, delete, modify
- **Mailbox**: See [references/mailbox.md](references/mailbox.md) for list, create, update, delete
- **Masked**: See [references/masked.md](references/masked.md) for list, create, update, delete
- **Draft**: See [references/draft.md](references/draft.md) for list, get, create, update, delete, send
- **Attachment**: See [references/attachment.md](references/attachment.md) for list, get, download
- **Thread**: See [references/thread.md](references/thread.md) for get, modify, attachments
- **URL**: See [references/url.md](references/url.md) for email, mailbox, search, compose
- **Unsubscribe**: See [references/unsubscribe.md](references/unsubscribe.md) for show, execute, batch

## Shell completions

```sh
# bash
source <(fastmail --completion bash)

# zsh
source <(fastmail --completion zsh)

# fish
fastmail --completion fish | source
```
