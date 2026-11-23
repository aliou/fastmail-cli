# batch

All batch subcommands share the same selection and common options.

## Selection flags (one required)

| Flag | Description |
|------|-------------|
| `<id>...` | Email IDs as positional arguments |
| `--ids <id,id,...>` | Comma-separated email IDs |
| `--mailbox <name>` | All emails in mailbox |
| `--query <text>` | Emails matching search query |
| `--in-mailbox <name>` | Restrict `--query` to mailbox |

## Common options

| Option | Description |
|--------|-------------|
| `--limit <n>` | Max emails to process (default: 1000) |
| `--dry-run` | Show what would be modified without doing it |

## read / unread

Mark emails as read or unread.

```sh
fastmail batch read EMAIL_ID1 EMAIL_ID2
fastmail batch read --mailbox Inbox --limit 100
fastmail batch unread --query "from:newsletter" --dry-run
```

## flag / unflag

Add or remove flag/star on emails.

```sh
fastmail batch flag --query "subject:important"
fastmail batch unflag --mailbox Archive --dry-run
```

## move

```
fastmail batch move --to <mailbox> [selection flags]
```

| Option | Description |
|--------|-------------|
| `--to <mailbox>` | Destination mailbox (required) |
| `--from <mailbox>` | Remove from this mailbox (optional; if not set, removes from all) |

```sh
fastmail batch move --to Archive --mailbox Inbox
fastmail batch move --to Important --query "subject:urgent"
```

## delete

| Option | Description |
|--------|-------------|
| `--permanent` | Permanently delete (skip Trash) |

```sh
fastmail batch delete --query "from:spam@example.com"
fastmail batch delete --mailbox Spam --permanent
```

## modify

Generic email modification with keyword and mailbox changes.

| Flag | Description |
|------|-------------|
| `--add-keyword <kw>` | Add keyword |
| `--remove-keyword <kw>` | Remove keyword |
| `--add-mailbox <name>` | Add to mailbox |
| `--remove-mailbox <name>` | Remove from mailbox |

```sh
fastmail batch modify --add-keyword "$flagged" EMAIL_ID1
fastmail batch modify --add-mailbox Archive --mailbox Inbox
```
