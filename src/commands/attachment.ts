/**
 * Attachment command handlers.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  getBoolean,
  getPositional,
  getString,
  parseArgs,
  wantsHelp,
} from "../args.ts";
import { getClient } from "../client.ts";
import { runtimeError, usageError } from "../error.ts";
import { atomicWriteFile } from "../files.ts";
import { downloadBlob } from "../jmap/blob.ts";
import { type EmailBodyPart, getEmails } from "../jmap/email.ts";

/** Common options for attachment commands */
const ATTACHMENT_OPTIONS = {
  output: { type: "string" as const, short: "o" },
  dir: { type: "string" as const, short: "d" },
  json: { type: "boolean" as const },
};

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
  const parsed = parseArgs(args, ATTACHMENT_OPTIONS, [1, 1]);

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
  if (!emailId)
    throw usageError(
      "Email ID required. Usage: fastmail attachment list <emailId>",
    );

  const client = await getClient();

  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "attachments"],
  });

  if (result.notFound.includes(emailId) || !result.list[0]) {
    throw runtimeError(`Email not found: ${emailId}`);
  }

  const email = result.list[0];
  const attachments = email.attachments ?? [];
  const formatted = attachments.map(formatAttachment);

  console.log(JSON.stringify(formatted, null, 2));
}

/**
 * Download a specific attachment.
 */
export async function getAttachment(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ATTACHMENT_OPTIONS, [2, 2]);

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
    throw usageError(
      "Email ID and Blob ID required. Usage: fastmail attachment get <emailId> <blobId>",
    );
  }

  const client = await getClient();

  // Verify email exists and get attachment metadata
  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "attachments"],
  });

  if (result.notFound.includes(emailId) || !result.list[0]) {
    throw runtimeError(`Email not found: ${emailId}`);
  }

  const email = result.list[0];

  // Find the attachment by blobId
  const attachment = (email.attachments ?? []).find((a) => a.blobId === blobId);
  if (!attachment) throw runtimeError(`Attachment not found: ${blobId}`);

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
  await atomicWriteFile(outputPath, Buffer.from(blob.data));

  if (getBoolean(parsed, "json")) {
    console.log(
      JSON.stringify({ path: outputPath, size: blob.data.byteLength }, null, 2),
    );
  } else {
    console.error(`Downloaded: ${outputPath} (${blob.data.byteLength} bytes)`);
  }
}

/**
 * Download all attachments from an email.
 */
export async function downloadAllAttachments(args: string[]): Promise<void> {
  const parsed = parseArgs(args, ATTACHMENT_OPTIONS, [1, 1]);

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
  if (!emailId)
    throw usageError(
      "Email ID required. Usage: fastmail attachment download <emailId>",
    );
  if (args.includes("-d"))
    console.error("fastmail: -d is deprecated; use --dir instead");

  const client = await getClient();

  // Get email with attachments
  const result = await getEmails(client, {
    ids: [emailId],
    properties: ["id", "attachments"],
  });

  if (result.notFound.includes(emailId) || !result.list[0]) {
    throw runtimeError(`Email not found: ${emailId}`);
  }

  const email = result.list[0];
  const attachments = email.attachments ?? [];
  if (attachments.length === 0) {
    if (getBoolean(parsed, "json"))
      console.log(
        JSON.stringify({
          directory: getString(parsed, "dir") ?? ".",
          files: [],
        }),
      );
    else console.error("No attachments found");
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
    await atomicWriteFile(outputPath, Buffer.from(blob.data));

    downloaded.push({
      name: filename,
      size: blob.data.byteLength,
    });
  }

  if (getBoolean(parsed, "json")) {
    console.log(
      JSON.stringify({ directory: outputDir, files: downloaded }, null, 2),
    );
  } else {
    console.error(
      `Downloaded ${downloaded.length} attachments to ${outputDir}/`,
    );
    for (const file of downloaded)
      console.error(`  - ${file.name} (${file.size} bytes)`);
  }
}
