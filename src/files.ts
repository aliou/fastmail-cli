import { open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function atomicWriteFile(
  path: string,
  data: string | Buffer,
  mode = 0o644,
): Promise<void> {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", mode);
    await handle.writeFile(data);
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } catch (error) {
    await handle?.close();
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}
