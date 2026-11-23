---
"fastmail-cli": major
---

Enforce the CLI contract with strict flags, consistent help, usage exit code 2, runtime exit code 1, concise errors, registry-driven completions, and separate data and message streams.

Add token-file login, JSON output for structured commands, noninteractive unsubscribe safeguards, atomic config and attachment writes, and offline agent skill discovery.

Deprecate `--token`, `FASTMAIL_API_TOKEN`, `--completion`, attachment `-d`, and unsubscribe `-i`; their replacements are token files or stdin, `completion`, `--dir`, and `--interactive`.
