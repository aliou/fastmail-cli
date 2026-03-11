# email

## list

```
fastmail email list [options]
```

| Option | Description |
|--------|-------------|
| `--mailbox <name>` | Mailbox name or ID (default: Inbox) |
| `--limit <n>` | Max results (default: 20) |
| `--unread` | Only unread emails |
| `--flagged` | Only flagged emails |
| `--after <date>` | Received on or after date (ISO 8601, YYYY-MM-DD, or relative like `7d`) |
| `--before <date>` | Received before date |

```sh
fastmail email list --after "7d" --unread
fastmail email list --mailbox Archive --limit 50
```

## get

```
fastmail email get <id> [options]
```

| Option | Description |
|--------|-------------|
| `--raw` | Output raw RFC5322 message |
| `--body-type <t>` | Body format: `text` (default) or `html` |

## send

```
fastmail email send [options]
```

| Option | Description |
|--------|-------------|
| `--to <addr>` | Recipient (comma-separated for multiple) |
| `--cc <addr>` | CC recipient |
| `--bcc <addr>` | BCC recipient |
| `--subject <text>` | Subject line |
| `--body <text>` | Body text |
| `--body-file <path>` | Read body from file |
| `--stdin` | Read body from stdin |
| `--html` | Body is HTML |
| `--from <identity>` | From identity (if multiple) |
| `--attach <path>` | Attach file (comma-separated for multiple) |
| `--reply-to <emailId>` | Reply to email ID (sets In-Reply-To/References/thread) |
| `--reply-all` | Auto-populate To/Cc from original (requires `--reply-to`) |

```sh
fastmail email send --to bob@example.com --subject "Hello" --body "Hi there"
fastmail email send --to bob@example.com --subject "Report" --body-file report.txt
cat body.txt | fastmail email send --to bob@example.com --subject "Data" --stdin
fastmail email send --reply-to EMAIL_ID --reply-all --body "Thanks everyone!"
```

## search

```
fastmail email search <query> [options]
```

| Option | Description |
|--------|-------------|
| `--limit <n>` | Max results (default: 20) |
| `--mailbox <name>` | Restrict to mailbox |
| `--after <date>` | Received on or after date |
| `--before <date>` | Received before date |

```sh
fastmail email search "from:newsletter" --after "7d"
fastmail email search "project update" --after "2026-01-01" --before "2026-01-15"
```

## mark-read

```
fastmail email mark-read <id1> [id2] ...
```

## mark-unread

```
fastmail email mark-unread <id1> [id2] ...
```
