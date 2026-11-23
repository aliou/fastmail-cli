# draft

## list

```
fastmail draft list [options]
```

| Option | Description |
|--------|-------------|
| `--limit <n>` | Max results (default: 20) |

## get

```
fastmail draft get <id> [options]
```

| Option | Description |
|--------|-------------|
| `--body-type <t>` | Body format: `text` (default) or `html` |

## create

```
fastmail draft create [options]
```

| Option | Description |
|--------|-------------|
| `--to <addr>` | Recipient (comma-separated) |
| `--cc <addr>` | CC recipient (comma-separated) |
| `--bcc <addr>` | BCC recipient (comma-separated) |
| `--subject <text>` | Subject line |
| `--body <text>` | Body text |
| `--body-file <path>` | Read body from file |
| `--stdin` | Read body from stdin |
| `--html` | Body is HTML |

```sh
fastmail draft create --to bob@example.com --subject "Hello" --body "Draft content"
```

## update

```
fastmail draft update <id> [options]
```

Same options as `create`. Returns a new draft ID because JMAP emails are immutable.

```sh
fastmail draft update DRAFT_ID --subject "Updated subject"
```

## delete

```
fastmail draft delete <id>
```

## send

```
fastmail draft send <id>
```
