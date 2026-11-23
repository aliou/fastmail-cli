function isCompiledBinary(scriptPath: string): boolean {
  return (
    scriptPath.startsWith("/$bunfs/") ||
    (!scriptPath.endsWith(".ts") &&
      !scriptPath.endsWith(".js") &&
      !scriptPath.includes("bun"))
  );
}

export function invocationArgs(): string[] {
  const scriptPath = process.argv[1] ?? "";
  const offset = scriptPath.startsWith("/$bunfs/")
    ? 2
    : isCompiledBinary(scriptPath)
      ? 1
      : 2;
  return process.argv.slice(offset);
}

export function entrypointPath(): string {
  const scriptPath = process.argv[1] ?? "";
  return isCompiledBinary(scriptPath) ? process.execPath : scriptPath;
}
