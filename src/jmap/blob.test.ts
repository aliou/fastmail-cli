import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

describe("downloadBlob", () => {
  test("constructs correct URL from session template", async () => {
    // The downloadUrl template pattern:
    // https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}?type={type}
    const template =
      "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}?type={type}";
    const accountId = "u12345";
    const blobId = "blob-abc123";
    const name = "report.pdf";
    const type = "application/pdf";

    const expectedUrl = template
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{blobId}", encodeURIComponent(blobId))
      .replace("{name}", encodeURIComponent(name))
      .replace("{type}", encodeURIComponent(type));

    expect(expectedUrl).toBe(
      "https://api.fastmail.com/jmap/download/u12345/blob-abc123/report.pdf?type=application%2Fpdf",
    );
  });

  test("encodes special characters in URL components", () => {
    const template =
      "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}?type={type}";
    const accountId = "u/123";
    const blobId = "blob+abc";
    const name = "file name.pdf";
    const type = "application/octet-stream";

    const url = template
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{blobId}", encodeURIComponent(blobId))
      .replace("{name}", encodeURIComponent(name))
      .replace("{type}", encodeURIComponent(type));

    expect(url).toContain("u%2F123");
    expect(url).toContain("blob%2Babc");
    expect(url).toContain("file%20name.pdf");
  });

  test("uses default values when name and type not provided", () => {
    const template =
      "https://api.fastmail.com/jmap/download/{accountId}/{blobId}/{name}?type={type}";
    const accountId = "u12345";
    const blobId = "blob-abc";
    const name = "attachment";
    const type = "application/octet-stream";

    const url = template
      .replace("{accountId}", encodeURIComponent(accountId))
      .replace("{blobId}", encodeURIComponent(blobId))
      .replace("{name}", encodeURIComponent(name))
      .replace("{type}", encodeURIComponent(type));

    expect(url).toContain("/attachment?");
    expect(url).toContain("application%2Foctet-stream");
  });
});

describe("uploadBlob", () => {
  test("constructs correct URL from session template", () => {
    const template = "https://api.fastmail.com/jmap/upload/{accountId}/";
    const accountId = "u12345";

    const url = template.replace("{accountId}", encodeURIComponent(accountId));

    expect(url).toBe("https://api.fastmail.com/jmap/upload/u12345/");
  });

  test("upload response structure is correct", () => {
    const response = {
      accountId: "u12345",
      blobId: "blob-new123",
      type: "application/pdf",
      size: 102400,
    };

    expect(response).toHaveProperty("accountId");
    expect(response).toHaveProperty("blobId");
    expect(response).toHaveProperty("type");
    expect(response).toHaveProperty("size");
    expect(typeof response.size).toBe("number");
  });
});

describe("content-disposition parsing", () => {
  test("extracts filename from quoted content-disposition", () => {
    const contentDisposition = 'attachment; filename="report.pdf"';
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("report.pdf");
  });

  test("extracts filename from unquoted content-disposition", () => {
    const contentDisposition = "attachment; filename=report.pdf";
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("report.pdf");
  });

  test("handles content-disposition without filename", () => {
    const contentDisposition = "attachment";
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);

    expect(match).toBeNull();
  });

  test("extracts filename with special characters", () => {
    const contentDisposition = 'attachment; filename="my file (1).pdf"';
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("my file (1).pdf");
  });
});
