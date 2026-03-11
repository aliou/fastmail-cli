# attachment

## list

```
fastmail attachment list <emailId>
```

Lists all attachments on an email.

## get

```
fastmail attachment get <emailId> <blobId> [options]
```

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output file path (default: original filename in current dir) |

## download

```
fastmail attachment download <emailId> [options]
```

Downloads all attachments from an email.

| Option | Description |
|--------|-------------|
| `-d, --dir <path>` | Output directory (default: current directory) |
