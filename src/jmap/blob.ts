/**
 * JMAP Blob operations.
 * Handles downloading blobs (attachments) and uploading new blobs.
 */

import type { JmapClient } from "./client.ts";
import { JMAP_MAIL_CAPABILITY } from "./types.ts";

/**
 * Download a blob by ID.
 * Uses the session's downloadUrl template.
 */
export async function downloadBlob(
  client: JmapClient,
  blobId: string,
  name?: string,
  type?: string,
): Promise<{ data: ArrayBuffer; name: string; type: string }> {
  const session = await client.getSession();
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  // downloadUrl template: https://.../{accountId}/{blobId}/{name}?type={type}
  const url = session.downloadUrl
    .replace("{accountId}", encodeURIComponent(accountId))
    .replace("{blobId}", encodeURIComponent(blobId))
    .replace("{name}", encodeURIComponent(name ?? "attachment"))
    .replace("{type}", encodeURIComponent(type ?? "application/octet-stream"));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${client.getToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download blob: ${response.statusText}`);
  }

  const data = await response.arrayBuffer();
  const contentType =
    response.headers.get("content-type") ?? type ?? "application/octet-stream";
  const contentDisposition = response.headers.get("content-disposition");

  // Extract filename from content-disposition if available
  let filename = name ?? "attachment";
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  return {
    data,
    name: filename,
    type: contentType,
  };
}

/**
 * Upload response from JMAP.
 */
export interface BlobUploadResponse {
  accountId: string;
  blobId: string;
  type: string;
  size: number;
}

/**
 * Upload a blob (for attachments).
 * Uses the session's uploadUrl template.
 */
export async function uploadBlob(
  client: JmapClient,
  data: ArrayBuffer | Uint8Array,
  type: string,
): Promise<BlobUploadResponse> {
  const session = await client.getSession();
  const accountId = await client.getPrimaryAccountId(JMAP_MAIL_CAPABILITY);

  // uploadUrl template: https://.../{accountId}/
  const url = session.uploadUrl.replace(
    "{accountId}",
    encodeURIComponent(accountId),
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${client.getToken()}`,
      "Content-Type": type,
    },
    body: data,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload blob: ${response.statusText}`);
  }

  return (await response.json()) as BlobUploadResponse;
}
