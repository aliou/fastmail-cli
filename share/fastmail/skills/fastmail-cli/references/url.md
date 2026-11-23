# url

Generate FastMail web URLs. All subcommands support `--open` to open in the browser.

## email

```
fastmail url email <id>...
```

Generate URL(s) for one or more emails.

```sh
fastmail url email EMAIL_ID
fastmail url email EMAIL_ID1 EMAIL_ID2 --open
```

## mailbox

```
fastmail url mailbox <name>
```

```sh
fastmail url mailbox Inbox
```

## search

```
fastmail url search <query>
```

```sh
fastmail url search "from:alice"
```

## compose

```
fastmail url compose [options]
```

| Option | Description |
|--------|-------------|
| `--to <addr>` | Pre-fill recipient |
| `--subject <s>` | Pre-fill subject |
| `--body <text>` | Pre-fill body |

```sh
fastmail url compose --to bob@example.com --subject "Hello"
```
