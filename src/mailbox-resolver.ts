import type { JmapClient } from "./jmap/client.ts";
import { getMailboxes } from "./jmap/mailbox.ts";

export async function resolveMailboxId(
  client: JmapClient,
  nameOrId: string,
): Promise<string> {
  const response = await getMailboxes(client, {
    properties: ["id", "name", "role"],
  });
  const normalized = nameOrId.toLowerCase();
  const byId = response.list.find((item) => item.id === nameOrId);
  if (byId) return byId.id;
  const byName = response.list.filter(
    (item) => item.name.toLowerCase() === normalized,
  );
  const byRole = response.list.filter(
    (item) => item.role?.toLowerCase() === normalized,
  );
  const matches = byName.length > 0 ? byName : byRole;
  if (matches.length > 1) throw new Error(`Mailbox is ambiguous: ${nameOrId}`);
  const mailbox = matches[0];
  if (!mailbox) throw new Error(`Mailbox not found: ${nameOrId}`);
  return mailbox.id;
}
