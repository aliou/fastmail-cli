#!/usr/bin/env bun
/**
 * Custom version script that:
 * 1. Runs changeset version (bumps version, updates changelog)
 * 2. Builds binaries
 * 3. Computes hashes
 * 4. Updates flake.nix
 */
import { $ } from "bun";

// Run changeset version
await $`bunx changeset version`;

// Get new version
const pkg = await Bun.file("package.json").json();
const version = pkg.version;
console.log(`Version: ${version}`);

// Build binaries
console.log("Building binaries...");
await $`bun run build`;

// Compute hashes
console.log("Computing hashes...");
const darwinArmHash = (
  await $`nix hash file --sri dist/fastmail-darwin-arm64`.text()
).trim();
const linuxArmHash = (
  await $`nix hash file --sri dist/fastmail-linux-arm64`.text()
).trim();
const linuxX64Hash = (
  await $`nix hash file --sri dist/fastmail-linux-x64`.text()
).trim();

console.log(`Darwin ARM64 hash: ${darwinArmHash}`);
console.log(`Linux ARM64 hash: ${linuxArmHash}`);
console.log(`Linux x64 hash: ${linuxX64Hash}`);

// Update flake.nix
let flake = await Bun.file("flake.nix").text();

// Update version
flake = flake.replace(/version = "[^"]*";/, `version = "${version}";`);

// Update darwin arm64 hash
flake = flake.replace(
  /("aarch64-darwin"[\s\S]*?hash = )"sha256-[^"]*"/,
  `$1"${darwinArmHash}"`,
);

// Update linux arm64 hash
flake = flake.replace(
  /("aarch64-linux"[\s\S]*?hash = )"sha256-[^"]*"/,
  `$1"${linuxArmHash}"`,
);

// Update linux x64 hash
flake = flake.replace(
  /("x86_64-linux"[\s\S]*?hash = )"sha256-[^"]*"/,
  `$1"${linuxX64Hash}"`,
);

await Bun.write("flake.nix", flake);
console.log("Updated flake.nix");

// Update src/constants.ts version
let constants = await Bun.file("src/constants.ts").text();
constants = constants.replace(
  /export const VERSION = "[^"]*";/,
  `export const VERSION = "${version}";`,
);
await Bun.write("src/constants.ts", constants);
console.log("Updated src/constants.ts");

// Clean up dist (don't commit binaries)
await $`rm -rf dist`;

console.log(`Ready to release v${version}`);
