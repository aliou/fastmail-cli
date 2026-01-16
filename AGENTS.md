# AGENTS.md

## Commands
All commands require nix: `nix develop --command bash -c "<cmd>"`
- **Run:** `bun run start` or `bun run src/index.ts`
- **Test all:** `bun test`
- **Test single:** `bun test src/path/to/file.test.ts`
- **Lint:** `bun run lint`
- **Format:** `bun run format`
- **Typecheck:** `bun run typecheck`
- **Build binaries:** `bun run build`

## Architecture
- `src/index.ts` - CLI entrypoint, routes commands to handlers
- `src/commands/` - Command implementations (email, mailbox, masked, batch, thread, draft, attachment, url, unsubscribe)
- `src/jmap/` - JMAP protocol client and API methods (client.ts, email.ts, mailbox.ts, etc.)
- `src/auth.ts` / `src/config.ts` - Authentication and config file handling
- Tests colocated as `*.test.ts` using bun:test with mocks via `bun-bagel`

## Code Style
- **Formatting:** Biome, 2-space indent, double quotes
- **Imports:** Use `.ts` extensions, `node:` prefix for Node builtins
- **Types:** Strict TS, define interfaces in `types.ts` or colocate, prefer explicit return types
- **Errors:** Custom error classes (JmapError, JmapMethodError), exit with `process.exit(1)` on CLI errors
- **Naming:** camelCase functions/vars, PascalCase classes/types, kebab-case files
