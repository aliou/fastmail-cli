import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSkillPath } from "./skill.ts";

const entrypoint = join(import.meta.dir, "index.ts");
const expected = join(
  import.meta.dir,
  "..",
  "share",
  "fastmail",
  "skills",
  "fastmail-cli",
  "SKILL.md",
);

async function run(
  args: string[],
  executable = entrypoint,
  cwd = join(import.meta.dir, ".."),
) {
  const child = Bun.spawn([process.execPath, "run", executable, ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("skill path", () => {
  test("prints the readable source skill path from another directory", async () => {
    const result = await run(["skill", "path"], entrypoint, tmpdir());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${expected}\n`);
    expect(result.stderr).toBe("");
    expect(await Bun.file(result.stdout.trim()).exists()).toBe(true);
  });

  test("accepts the explicit skill name", async () => {
    const result = await run(["skill", "path", "fastmail-cli"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${expected}\n`);
  });

  test("resolves the source entrypoint through a symlink", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmail-skill-link-"));
    const linked = join(directory, "index.ts");
    await symlink(entrypoint, linked);
    const result = await run(["skill", "path"], linked, directory);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${expected}\n`);
    await rm(directory, { recursive: true, force: true });
  });

  test("rejects unknown skills", async () => {
    const result = await run(["skill", "path", "unknown"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Available skills: fastmail-cli");
  });

  test("reports a missing installed skill", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fastmail-skill-missing-"));
    await mkdir(join(directory, "bin"));
    const executable = join(directory, "bin", "fastmail");
    await Bun.write(executable, "");
    expect(getSkillPath(executable)).rejects.toThrow("Bundled skill not found");
    await rm(directory, { recursive: true, force: true });
  });
});
