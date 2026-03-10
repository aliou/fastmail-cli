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
5. Each function should: parse args, check `wantsHelp()`, get token via `getApiToken()`, create `JmapClient`, make JMAP calls, format output.
6. Add handler function in `src/index.ts` with dynamic import using `.js` extension.
7. Add to the switch statement in `main()`.
8. Update `printHelp()` in `src/cli.ts`.
9. Update shell completions in `src/cli.ts` (bash, zsh, fish).
10. Add tests as `src/commands/<resource>.test.ts` using `bun:test` with `bun-bagel` for mocking.

## Conventions

- Command files use `.ts` import extensions internally. `src/index.ts` uses `.js` extensions for dynamic imports.
- All commands support `--help` and `--json` flags.
- Auth token resolution: `FASTMAIL_API_TOKEN` env var > config file.
- Use `JmapClient` from `src/jmap/client.ts` for all API calls.
- Use `parseArgs()` from `src/args.ts` for argument parsing with named option definitions.
- Error messages go to `console.error`, exit with `process.exit(1)`.
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
