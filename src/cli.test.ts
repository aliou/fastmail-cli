import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commands } from "./commands/registry.ts";

const entrypoint = join(import.meta.dir, "index.ts");

async function run(args: string[], input?: string) {
  const home = await mkdtemp(join(tmpdir(), "fastmail-cli-test-"));
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
  };
  delete env.FASTMAIL_API_TOKEN;
  delete env.FASTMAIL_DEBUG;
  const child = Bun.spawn([process.execPath, "run", entrypoint, ...args], {
    cwd: join(import.meta.dir, ".."),
    env,
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  await rm(home, { recursive: true, force: true });
  return { stdout, stderr, exitCode };
}

describe("CLI contract", () => {
  test("bare invocation prints concise help", async () => {
    const result = await run([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith("Examples:");
    expect(result.stdout).toContain("fastmail --help");
    expect(result.stderr).toBe("");
  });

  test("version uses stdout", async () => {
    const result = await run(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^fastmail version \d+\.\d+\.\d+\n$/);
    expect(result.stderr).toBe("");
  });

  test("help wins at every level and position", async () => {
    for (const args of [
      ["--help"],
      ["email", "--help"],
      ["--help", "email"],
      ["help", "email"],
      ["help", "email", "get"],
      ["email", "get", "arbitrary-id", "--help"],
      ["email", "get", "--bogus", "--help"],
      ["email", "search", "--", "--help"],
      ["email", "search", "--", "-h"],
    ]) {
      const result = await run(args);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toStartWith("Examples:");
      expect(result.stderr).toBe("");
    }
  });

  test("usage errors are prefixed and exit 2 without authentication", async () => {
    for (const args of [
      ["emal"],
      ["email", "unknown"],
      ["email", "get"],
      ["email", "list", "--bogus"],
      ["email", "list", "--limit", "invalid"],
      ["batch", "read", "id", "--limit", "-1"],
      ["unsubscribe", "batch", "--limit", "1.5"],
      ["mailbox", "create"],
      ["mailbox", "update"],
      ["mailbox", "delete"],
      ["masked", "update", "id"],
      ["batch", "read"],
    ]) {
      const result = await run(args);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toStartWith("fastmail:");
      expect(result.stderr).not.toContain("at ");
    }
  });

  test("fixed-arity commands reject missing and excess positionals before authentication", async () => {
    const cases = [
      ["email", "get"],
      ["email", "get", "id", "extra"],
      ["email", "search"],
      ["email", "search", "query", "extra"],
      ["email", "list", "extra"],
      ["email", "send", "extra"],
      ["mailbox", "list", "extra"],
      ["mailbox", "create"],
      ["mailbox", "create", "Name", "extra"],
      ["mailbox", "update"],
      ["mailbox", "update", "id", "extra"],
      ["mailbox", "delete"],
      ["mailbox", "delete", "id", "extra"],
      ["masked", "list", "extra"],
      ["masked", "create", "extra"],
      ["masked", "update"],
      ["masked", "update", "id", "extra"],
      ["masked", "delete"],
      ["masked", "delete", "id", "extra"],
      ["draft", "list", "extra"],
      ["draft", "create", "extra"],
      ["draft", "get"],
      ["draft", "get", "id", "extra"],
      ["draft", "update"],
      ["draft", "update", "id", "extra"],
      ["draft", "delete"],
      ["draft", "delete", "id", "extra"],
      ["draft", "send"],
      ["draft", "send", "id", "extra"],
      ["thread", "get"],
      ["thread", "get", "id", "extra"],
      ["thread", "modify"],
      ["thread", "modify", "id", "extra"],
      ["thread", "attachments"],
      ["thread", "attachments", "id", "extra"],
      ["attachment", "list"],
      ["attachment", "list", "id", "extra"],
      ["attachment", "get", "id"],
      ["attachment", "get", "id", "blob", "extra"],
      ["attachment", "download"],
      ["attachment", "download", "id", "extra"],
      ["url", "email"],
      ["url", "mailbox"],
      ["url", "mailbox", "Inbox", "extra"],
      ["url", "search"],
      ["url", "search", "query", "extra"],
      ["url", "compose", "extra"],
      ["unsubscribe", "show"],
      ["unsubscribe", "show", "id", "extra"],
      ["unsubscribe", "execute"],
      ["unsubscribe", "execute", "id", "extra"],
      ["unsubscribe", "batch", "extra"],
    ];
    for (const args of cases) {
      const result = await run(args);
      expect({ args, exitCode: result.exitCode }).toEqual({
        args,
        exitCode: 2,
      });
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("positional arguments");
    }
  });

  test("suggests a close command", async () => {
    const result = await run(["emal"]);
    expect(result.stderr).toContain("Did you mean 'email'?");
  });

  test("global flags after the separator remain positional", async () => {
    for (const flag of ["--version", "-v", "--verbose"]) {
      const result = await run(["email", "search", "--", flag]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).not.toContain("fastmail version");
    }
  });

  test("runtime authentication failures exit 1 with clean streams", async () => {
    const result = await run(["email", "list"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "fastmail: Not authenticated. Run 'fastmail auth login'.\n",
    );
  });

  test("noninteractive unsubscribe requires --auto before authentication", async () => {
    const result = await run(["unsubscribe", "execute", "email-id"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--auto");
  });

  test("noninteractive login without a token exits 2", async () => {
    const result = await run(["auth", "login"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--token-file");
  });

  test("registry drives help and completions", async () => {
    const help = await run(["--help"]);
    for (const shell of ["bash", "zsh", "fish"]) {
      const completion = await run(["completion", shell]);
      expect(completion.exitCode).toBe(0);
      for (const command of commands) {
        expect(help.stdout).toContain(command.name);
        expect(completion.stdout).toContain(command.name);
        for (const alias of command.aliases)
          expect(completion.stdout).toContain(alias);
        for (const subcommand of command.subcommands) {
          if (command.name !== "help") expect(subcommand.load).toBeDefined();
          expect(completion.stdout).toContain(subcommand.name);
        }
      }
    }
  });

  test("Bash and Zsh complete leaf flags without advertising URL JSON", async () => {
    for (const shell of ["bash", "zsh"]) {
      const result = await run(["completion", shell]);
      const emailLine = result.stdout
        .split("\n")
        .find((line) => line.includes("email:list)"));
      const urlLine = result.stdout
        .split("\n")
        .find((line) => line.includes("url:email)"));
      expect(emailLine).toContain("--mailbox");
      expect(emailLine).toContain("--limit");
      expect(emailLine).toContain("--json");
      expect(urlLine).toContain("--open");
      expect(urlLine).not.toContain("--json");
    }
    const rejected = await run(["url", "email", "id", "--json"]);
    expect(rejected.exitCode).toBe(2);
  });

  test("completion compatibility form warns on stderr", async () => {
    const result = await run(["--completion", "bash"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("complete -F");
    expect(result.stderr).toContain("deprecated");
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    test(`${signal} exits a pending operation within one second`, async () => {
      const home = await mkdtemp(join(tmpdir(), "fastmail-signal-test-"));
      const child = Bun.spawn(
        [
          process.execPath,
          "run",
          entrypoint,
          "email",
          "send",
          "--to",
          "person@example.com",
          "--subject",
          "test",
          "--stdin",
        ],
        {
          env: {
            ...process.env,
            HOME: home,
            XDG_CONFIG_HOME: join(home, "config"),
            FASTMAIL_API_TOKEN: undefined,
          },
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      await Bun.sleep(50);
      child.kill(signal);
      const result = await Promise.race([
        child.exited,
        Bun.sleep(1000).then(() => "timeout"),
      ]);
      expect(result).not.toBe("timeout");
      await rm(home, { recursive: true, force: true });
    });
  }

  test("generated bash and zsh completions parse", async () => {
    for (const shell of ["bash", "zsh"]) {
      const completion = await run(["completion", shell]);
      const child = Bun.spawn([shell, "-n"], {
        stdin: new Blob([completion.stdout]),
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await child.exited).toBe(0);
    }
  });
});
