import { getApiToken } from "./config.ts";
import { runtimeError } from "./error.ts";
import { JmapClient } from "./jmap/client.ts";

export async function getClient(): Promise<JmapClient> {
  const token = await getApiToken();
  if (!token) {
    throw runtimeError("Not authenticated. Run 'fastmail auth login'.");
  }
  return new JmapClient({ token });
}
