/**
 * Attachment command handlers.
 */

import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getPositional, getString, parseArgs, wantsHelp } from "../args.ts";
import { loadConfig } from "../config.ts";
import { downloadBlob } from "../jmap/blob.ts";
import { JmapClient } from "../jmap/client.ts";
import { type EmailBodyPart, getEmails } from "../jmap/email.ts";

/** Common options for attachment commands */
const ATTACHMENT_OPTIONS = {
  output: { type: "string" as const, short: "o" },
  dir: { type: "string" as const, short: "d" },
};

/**
 * Get authenticated JMAP client.
 */
async function getClient(): Promise<JmapClient> {
  const envToken = process.env.FASTMAIL_API_TOKEN;
  const config = await loadConfig();
  const token = envToken ?? config.apiToken;

  if (!token) {
    throw new Error(
      "Not authenticated. Run 'fastmail auth login' or set FASTMAIL_API_TOKEN",
    );
  }

  return new JmapClient({ token });
}

/**
 * Format attachment info for output.
 */
function formatAttachment(
  part: EmailBodyPart,
): Record<string, string | number | undefined> {
  return {
    blobId: part.blobId,
    name: part.name,
    type: part.type,
    size: part.size,
  };
}

/**
 * List attachments on an email.
 */
export async function listAttachments(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ATTACHMENT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail attachment list <emailId>

List attachments on an email.

Options:
  -h, --help    Show this help
`);
    return;
  }

  const emailId = getPositional(parsed, 0);
  if (!emailId) {
    console.error("Error: Email ID required");
    console.error("Usage: fastmail attachment list <emailId>");
    process.exit(1);
  }

  const client = await getClient();

  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "attachments"],
  });

  if (result.notFound.includes(emailId)) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  const email = result.list[0];
  if (!email) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  const attachments = email.attachments ?? [];
  const formatted = attachments.map(formatAttachment);

  console.log(JSON.stringify(formatted, null, 2));
}

/**
 * Download a specific attachment.
 */
export async function getAttachment(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ATTACHMENT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail attachment get <emailId> <blobId> [options]

Download a specific attachment.

Options:
  -o, --output <path>  Output file path (default: original filename in current dir)
  -h, --help           Show this help
`);
    return;
  }

  const emailId = getPositional(parsed, 0);
  const blobId = getPositional(parsed, 1);

  if (!emailId || !blobId) {
    console.error("Error: Email ID and Blob ID required");
    console.error("Usage: fastmail attachment get <emailId> <blobId>");
    process.exit(1);
  }

  const client = await getClient();

  // Verify email exists and get attachment metadata
  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "attachments"],
  });

  if (result.notFound.includes(emailId)) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  const email = result.list[0];
  if (!email) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  // Find the attachment by blobId
  const attachment = (email.attachments ?? []).find((a) => a.blobId === blobId);
  if (!attachment) {
    console.error(`Error: Attachment not found: ${blobId}`);
    process.exit(1);
  }

  // Download the blob
  const blob = await downloadBlob(
    client,
    blobId,
    attachment.name,
    attachment.type,
  );

  // Determine output path - use original attachment name (not URL-encoded)
  const filename = attachment.name ?? blob.name;
  const outputPath = getString(parsed, "output") ?? filename;

  // Write to file
  await writeFile(outputPath, Buffer.from(blob.data));

  console.log(`Downloaded: ${outputPath} (${blob.data.byteLength} bytes)`);
}

/**
 * Download all attachments from an email.
 */
export async function downloadAllAttachments(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ATTACHMENT_OPTIONS);

  if (wantsHelp(parsed)) {
    console.log(`
Usage: fastmail attachment download <emailId> [options]

Download all attachments from an email.

Options:
  -d, --dir <path>  Output directory (default: current directory)
  -h, --help        Show this help
`);
    return;
  }

  const emailId = getPositional(parsed, 0);
  if (!emailId) {
    console.error("Error: Email ID required");
    console.error("Usage: fastmail attachment download <emailId>");
    process.exit(1);
  }

  const client = await getClient();

  // Get email with attachments
  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "attachments"],
  });

  if (result.notFound.includes(emailId)) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  const email = result.list[0];
  if (!email) {
    console.error(`Error: Email not found: ${emailId}`);
    process.exit(1);
  }

  const attachments = email.attachments ?? [];
  if (attachments.length === 0) {
    console.log("No attachments found");
    return;
  }

  // Determine output directory
  const outputDir = getString(parsed, "dir") ?? ".";

  // Create directory if it doesn't exist
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const downloaded: Array<{ name: string; size: number }> = [];

  // Download each attachment
  for (const attachment of attachments) {
    if (!attachment.blobId) {
      continue;
    }

    const blob = await downloadBlob(
      client,
      attachment.blobId,
      attachment.name,
      attachment.type,
    );

    // Use original attachment name from email metadata (not URL-encoded)
    const filename = attachment.name ?? blob.name;
    const outputPath = join(outputDir, filename);
    await writeFile(outputPath, Buffer.from(blob.data));

    downloaded.push({
      name: filename,
      size: blob.data.byteLength,
    });
  }

  console.log(`Downloaded ${downloaded.length} attachments to ${outputDir}/`);
  for (const file of downloaded) {
    console.log(`  - ${file.name} (${file.size} bytes)`);
  }
}
