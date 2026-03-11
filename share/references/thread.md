# thread

## get

```
fastmail thread get <threadId> [options]
```

| Option | Description |
|--------|-------------|
| `--body-type <t>` | Body format: `text`, `html`, or `none` (default: `none`) |

## modify

```
fastmail thread modify <threadId> [options]
```

Modifies labels/keywords on all emails in a thread.

| Option | Description |
|--------|-------------|
| `--add-mailbox <id\|name>` | Add to mailbox |
| `--remove-mailbox <id\|name>` | Remove from mailbox |
| `--add-keyword <kw>` | Add keyword (e.g., `$flagged`, `$seen`) |
| `--remove-keyword <kw>` | Remove keyword |

```sh
fastmail thread modify THREAD_ID --add-keyword '$flagged'
fastmail thread modify THREAD_ID --add-mailbox Archive --remove-mailbox Inbox
```

## attachments

```
fastmail thread attachments <threadId>
```

Lists all attachments across all emails in a thread.
