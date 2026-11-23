---
name: developing-fastmail-cli
description: "Develops and maintains the fastmail-cli project. Use when adding commands, fixing bugs, or modifying the CLI codebase."
---

# Developing fastmail-cli

A CLI for FastMail built with Bun + TypeScript, using the JMAP protocol against `https://api.fastmail.com/jmap/session`.

## Running

```sh
bun run src/index.ts <command> <subcommand> [flags]
bun run typecheck    # type checking
bun run lint         # lint (biome)
bun run format       # auto-fix formatting
bun run test         # tests
bun run build        # compile binaries for all platforms
```

## Architecture

- `src/index.ts` - Entry point. Routes commands to handler functions. Uses `.js` import extensions for dynamic imports.
- `src/cli.ts` - Top-level arg parsing, help text, shell completions (bash/zsh/fish).
- `src/jmap/client.ts` - `JmapClient` class handling session discovery, request batching, and response parsing.
- `src/jmap/types.ts` - JMAP protocol types and capability constants.
- `src/jmap/*.ts` - JMAP method wrappers per resource (email, mailbox, masked-email, thread, blob, submission).
- `src/args.ts` - Shared `parseArgs()` helper wrapping `node:util` parseArgs. Provides `wantsHelp()`, `getString()`, `getNumber()`, `getBoolean()`, `getPositional()`.
- `src/config.ts` - Config loading/saving. Global config at `~/.config/fastmail-cli/config.json` with `0600` permissions. `getApiToken()` checks env var `FASTMAIL_API_TOKEN` first, then config file.
- `src/auth.ts` - Auth functions: `login()`, `logout()`, `getAuthStatus()`, `readTokenFromStdin()`, `promptForToken()`. Validates tokens via JMAP session fetch.
- `src/constants.ts` - `APP_NAME`, `VERSION`, `JMAP_SESSION_URL`, `CONFIG_FILE`.
- `src/commands/` - One file per command resource. Each exports named handler functions.

## Adding a New Command

1. If the command needs new JMAP methods, create or extend `src/jmap/<resource>.ts`.
2. Create `src/commands/<resource>.ts`.
3. Define options object, import helpers from `../args.ts`.
4. Export named async functions (`listX`, `getX`, `createX`, etc.) that take `args: string[]`.
5. Each function should parse args, check `wantsHelp()`, validate input, then call `getClient()` from `src/client.ts`.
6. Register the command, subcommands, aliases, examples, flags, and lazy handler in `src/commands/registry.ts`. Routing, help, and completions consume this registry.
7. Use `resolveMailboxId()` from `src/mailbox-resolver.ts` for mailbox names, roles, and IDs.
8. Add handler tests with `bun-bagel` and entrypoint tests in `src/cli.test.ts` for routing, streams, and exit codes.

## Conventions

- Command files use `.ts` import extensions internally. Registry dynamic imports use `.js` extensions.
- All commands support `--help`. Structured commands support `--json`; URL commands print plain text.
- Use `getClient()` for authenticated commands and `parseArgs()` for strict argument parsing.
- Throw `usageError()` for exit 2 and `runtimeError()` for exit 1. Handlers do not call `process.exit()`.
- Write data to stdout and progress, warnings, and confirmations to stderr.
- Biome for linting/formatting (2-space indent, double quotes), tsc for type checking. Run both before committing.
- Commit messages follow Conventional Commits.
- Tests use `bun:test` with `bun-bagel` for HTTP mocking. Colocated as `*.test.ts`.
- Naming: camelCase functions/vars, PascalCase classes/types, kebab-case files.

## Testing

- Tests mock JMAP HTTP calls via `bun-bagel`. No real API calls in tests.
- API token is already configured for manual testing. Do NOT read config files or attempt to view the token.

## Release Process

- Uses changesets for versioning: `bunx changeset` to create a changeset.
- `bun run version` runs changeset version, builds binaries, computes nix hashes, updates `flake.nix` and `src/constants.ts`.
- CI runs lint + typecheck on PRs. Version workflow creates release PRs and GitHub releases with binaries.
- Build targets: `bun-darwin-arm64`, `bun-linux-arm64`, `bun-linux-x64`.

## Key Files

When modifying commands, these files often need updates together:
- `src/jmap/<resource>.ts` - JMAP method wrappers
- `src/commands/<resource>.ts` - Command implementation
- `src/commands/<resource>.test.ts` - Tests
- `src/index.ts` - Command routing
- `src/cli.ts` - Help text and shell completions
