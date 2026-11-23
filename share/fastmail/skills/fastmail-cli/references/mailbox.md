# mailbox

## list

```
fastmail mailbox list [options]
```

| Option | Description |
|--------|-------------|
| `--tree` | Display as tree structure |

## create

```
fastmail mailbox create <name> [options]
```

| Option | Description |
|--------|-------------|
| `--parent <id>` | Parent mailbox ID |

## update

```
fastmail mailbox update <id> [options]
```

| Option | Description |
|--------|-------------|
| `--name <name>` | New name |
| `--parent <id>` | New parent mailbox ID |

## delete

```
fastmail mailbox delete <id> [options]
```

| Option | Description |
|--------|-------------|
| `--force` | Remove emails from mailbox on delete |
