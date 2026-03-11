# masked

## list

```
fastmail masked list [options]
```

| Option | Description |
|--------|-------------|
| `--state <state>` | Filter by state: `enabled`, `disabled`, `pending`, `deleted`, `all` (default: `all`) |

## create

```
fastmail masked create [options]
```

| Option | Description |
|--------|-------------|
| `--for-domain <domain>` | Domain to associate with (e.g., `https://example.com`) |
| `--description <text>` | Description/note for this address |
| `--prefix <prefix>` | Preferred email prefix (max 64 chars, a-z/0-9/underscore only) |

```sh
fastmail masked create --for-domain https://example.com --description "Shopping site" --prefix shopping_site
```

## update

```
fastmail masked update <id> [options]
```

| Option | Description |
|--------|-------------|
| `--state <state>` | New state: `enabled` or `disabled` |
| `--description <text>` | New description |
| `--for-domain <domain>` | New domain |

```sh
fastmail masked update masked-123 --state disabled --description "No longer using"
```

## delete

```
fastmail masked delete <id>
```

Sets state to `deleted`. Does not remove the address from account history.
