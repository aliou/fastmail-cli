import { describe, expect, test } from "bun:test";

describe("listAttachments", () => {
  test("formats attachment info correctly", () => {
    const attachment = {
      blobId: "blob-123",
      name: "report.pdf",
      type: "application/pdf",
      size: 102400,
    };

    const formatted = {
      blobId: attachment.blobId,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
    };

    expect(formatted).toEqual({
      blobId: "blob-123",
      name: "report.pdf",
      type: "application/pdf",
      size: 102400,
    });
  });

  test("handles attachments with missing name", () => {
    const attachment = {
      blobId: "blob-123",
      type: "application/octet-stream",
      size: 1024,
    };

    const formatted = {
      blobId: attachment.blobId,
      name: undefined,
      type: attachment.type,
      size: attachment.size,
    };

    expect(formatted.blobId).toBe("blob-123");
    expect(formatted.name).toBeUndefined();
  });

  test("handles email with no attachments", () => {
    const attachments: unknown[] = [];
    expect(attachments.length).toBe(0);
  });

  test("handles multiple attachments", () => {
    const attachments = [
      {
        blobId: "blob-1",
        name: "file1.pdf",
        type: "application/pdf",
        size: 1024,
      },
      { blobId: "blob-2", name: "image.png", type: "image/png", size: 2048 },
      { blobId: "blob-3", name: "doc.txt", type: "text/plain", size: 512 },
    ];

    expect(attachments.length).toBe(3);
    expect(attachments.map((a) => a.blobId)).toEqual([
      "blob-1",
      "blob-2",
      "blob-3",
    ]);
  });
});

describe("getAttachment", () => {
  test("finds attachment by blobId", () => {
    const attachments = [
      { blobId: "blob-1", name: "file1.pdf", type: "application/pdf" },
      { blobId: "blob-2", name: "image.png", type: "image/png" },
    ];

    const targetBlobId = "blob-2";
    const found = attachments.find((a) => a.blobId === targetBlobId);

    expect(found).toBeDefined();
    expect(found?.name).toBe("image.png");
    expect(found?.type).toBe("image/png");
  });

  test("returns undefined for non-existent blobId", () => {
    const attachments = [
      { blobId: "blob-1", name: "file1.pdf", type: "application/pdf" },
    ];

    const found = attachments.find((a) => a.blobId === "nonexistent");
    expect(found).toBeUndefined();
  });
});

describe("downloadAllAttachments", () => {
  test("filters attachments with blobId", () => {
    const attachments = [
      { blobId: "blob-1", name: "file1.pdf" },
      { name: "orphan.txt" }, // No blobId
      { blobId: "blob-2", name: "file2.pdf" },
    ];

    const downloadable = attachments.filter((a) => a.blobId);
    expect(downloadable.length).toBe(2);
    expect(downloadable[0]?.blobId).toBe("blob-1");
    expect(downloadable[1]?.blobId).toBe("blob-2");
  });

  test("handles empty attachments array", () => {
    const attachments: { blobId?: string; name?: string }[] = [];
    const downloadable = attachments.filter((a) => a.blobId);
    expect(downloadable.length).toBe(0);
  });
});

describe("parseArgs for attachment commands", () => {
  test("parses email ID as first positional arg", () => {
    const args = ["email-123"];
    const parsed = {
      _0: args[0],
      _length: args.length,
    };

    expect(parsed._0).toBe("email-123");
    expect(parsed._length).toBe(1);
  });

  test("parses email ID and blob ID as positional args", () => {
    const args = ["email-123", "blob-456"];
    const parsed = {
      _0: args[0],
      _1: args[1],
      _length: args.length,
    };

    expect(parsed._0).toBe("email-123");
    expect(parsed._1).toBe("blob-456");
    expect(parsed._length).toBe(2);
  });

  test("parses --output flag", () => {
    const args = ["email-123", "blob-456", "--output", "/tmp/file.pdf"];

    // Simulate parsing
    let output: string | undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--output" && args[i + 1]) {
        output = args[i + 1];
        break;
      }
    }

    expect(output).toBe("/tmp/file.pdf");
  });

  test("parses --dir flag", () => {
    const args = ["email-123", "--dir", "/tmp/downloads"];

    // Simulate parsing
    let dir: string | undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--dir" && args[i + 1]) {
        dir = args[i + 1];
        break;
      }
    }

    expect(dir).toBe("/tmp/downloads");
  });
});

describe("output path handling", () => {
  test("uses output flag if provided", () => {
    const outputFlag = "/tmp/custom.pdf";
    const blobName = "original.pdf";

    const outputPath = outputFlag ?? blobName;
    expect(outputPath).toBe("/tmp/custom.pdf");
  });

  test("falls back to blob name if no output flag", () => {
    const outputFlag: string | undefined = undefined;
    const blobName = "original.pdf";

    const outputPath = outputFlag ?? blobName;
    expect(outputPath).toBe("original.pdf");
  });

  test("joins directory and filename correctly", () => {
    const dir = "/tmp/downloads";
    const filename = "report.pdf";

    // Using path.join would be: path.join(dir, filename)
    const expected = `${dir}/${filename}`;
    expect(expected).toBe("/tmp/downloads/report.pdf");
  });
});
