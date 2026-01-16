# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).

## Adding a changeset

```bash
bun run changeset
```

Follow the prompts to describe your changes.

## Releasing

When changesets are merged to main, the version workflow will:
1. Create a release PR that bumps versions and updates CHANGELOG.md
2. When merged, create a GitHub release with built binaries
