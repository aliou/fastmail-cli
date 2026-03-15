# fastmail-cli

## 0.2.0

### Minor Changes

- 05776ba: Add shareable CLI usage skill in share/ directory with full command reference documentation.

### Patch Changes

- 06d23fe: Fix `email search` to parse fielded query operators.

  Previously, `fastmail email search "from:alice@example.com"` sent the
  entire string as a plain text search, so sender-based searches would
  never return results. The CLI now parses field operators before building
  the JMAP filter:

  - `from:<value>` maps to `filter.from`
  - `to:<value>` maps to `filter.to`
  - `cc:<value>` maps to `filter.cc`
  - `bcc:<value>` maps to `filter.bcc`
  - `subject:<value>` maps to `filter.subject` (supports quoted values: `subject:"hello world"`)
  - `body:<value>` maps to `filter.body`
  - Any remaining text is passed as `filter.text` for full-text search

## 0.1.1

### Patch Changes

- 2908249: Add SKILL.md, Homebrew tap auto-update on release, include SKILL.md in release assets

## 0.1.0

### Minor Changes

- 704d1b5: Initial release of fastmail-cli with full JMAP support.

  Features:

  - Authentication with FastMail API tokens
  - Email management (list, get, send, search, mark read/unread)
  - Mailbox operations (list, create, update, delete)
  - Masked email support (list, create, update, delete)
  - Batch operations (read, unread, flag, unflag, move, delete)
  - Thread handling (get, modify, attachments)
  - Draft management (list, get, create, update, delete, send)
  - Attachment downloading
  - Unsubscribe detection and execution
  - Shell completions (bash, zsh, fish)
  - Nix flake for installation and development
