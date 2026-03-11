# unsubscribe

## show

```
fastmail unsubscribe show <emailId>
```

Shows available unsubscribe methods for an email.

## execute

```
fastmail unsubscribe execute <emailId> [options]
```

| Option | Description |
|--------|-------------|
| `--method <type>` | Prefer method: `http` or `mailto` (default: `https`) |
| `--auto` | Skip confirmation prompt |

## batch

```
fastmail unsubscribe batch [options]
```

| Option | Description |
|--------|-------------|
| `--query <text>` | Search query for newsletters |
| `--mailbox <name>` | Mailbox to process |
| `--limit <n>` | Max emails to process (default: 50) |
| `--dry-run` | Show what would be unsubscribed |
| `--one-click-only` | Only unsubscribe if one-click available |

```sh
fastmail unsubscribe batch --query "from:newsletter"
fastmail unsubscribe batch --mailbox Newsletters --one-click-only --dry-run
```
