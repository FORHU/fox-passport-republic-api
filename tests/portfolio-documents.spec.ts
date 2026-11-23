import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkUpload,
  detectFileType,
  FILE_UNSUPPORTED,
  isPrivateUploadPurpose,
} from "../src/utils/file-signature";
import { checkPortfolioUrls } from "../src/utils/portfolio-urls";

/**
 * app#371: a portfolio / resume is a PDF or Word document, never an image,
 * checked from its bytes on every path (upload, apply, resubmit). Portfolio
 * links stay, and must be real web addresses.
 */

const fileFind = vi.hoisted(() => vi.fn());
const fileFindMany = vi.hoisted(() => vi.fn());
const fileCount = vi.hoisted(() => vi.fn());
const findRequestById = vi.hoisted(() => vi.fn());
const updateApplicationFiles = vi.hoisted(() => vi.fn());
const applyResubmission = vi.hoisted(() => vi.fn());

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    file: {
      findUnique: (...a: unknown[]) => fileFind(...a),
      findMany: (...a: unknown[]) => fileFindMany(...a),
      count: (...a: unknown[]) => fileCount(...a),
    },
  },
}));
vi.mock("../src/modules/users/users.repository", () => ({ default: {} }));
vi.mock("../src/modules/role-request/role-request.repository", () => ({
  default: {
    findRequestById: (...a: unknown[]) => findRequestById(...a),
    updateApplicationFiles: (...a: unknown[]) => updateApplicationFiles(...a),
    applyResubmission: (...a: unknown[]) => applyResubmission(...a),
  },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn() },
}));

const { default: RoleRequestService } =
  await import("../src/modules/role-request/role-request.service");

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// The start of a ZIP whose entries have these names (local file headers).
const zipWith = (...names: string[]) =>
  Buffer.concat(
    names.map((name) =>
      Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.alloc(26),
        Buffer.from(name, "latin1"),
        Buffer.from("<xml/>", "latin1"),
      ]),
    ),
  );
// An OLE compound file whose directory names this stream.
const oleWith = (stream: string) =>
  Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(504),
    Buffer.from(stream, "utf16le"),
  ]);

const docx = zipWith("[Content_Types].xml", "_rels/.rels", "word/document.xml");
const xlsx = zipWith("[Content_Types].xml", "_rels/.rels", "xl/workbook.xml");
const plainZip = zipWith("photo.png");
const doc = oleWith("WordDocument");
const xls = oleWith("Workbook");
const pdf = Buffer.from("%PDF-1.7\n", "latin1");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

describe("Word documents are recognised from their bytes", () => {
  it("recognises .docx and .doc", () => {
    expect(detectFileType(docx)?.mime).toBe(DOCX_MIME);
    expect(detectFileType(doc)?.mime).toBe("application/msword");
  });

  it("refuses other ZIPs and other OLE files", () => {
    expect(detectFileType(xlsx)).toBeNull();
    expect(detectFileType(plainZip)).toBeNull();
    expect(detectFileType(xls)).toBeNull();
  });
});

describe("the portfolio upload purpose", () => {
  it("takes a PDF, DOC or DOCX", () => {
    expect(checkUpload(pdf, pdf.length, "portfolio").ext).toBe("pdf");
    expect(checkUpload(doc, doc.length, "portfolio").ext).toBe("doc");
    expect(checkUpload(docx, docx.length, "portfolio").ext).toBe("docx");
  });

  it("refuses an image", () => {
    expect(() => checkUpload(png, png.length, "portfolio")).toThrow(
      FILE_UNSUPPORTED.portfolio,
    );
  });

  it("leaves identity documents as they were: no Word files", () => {
    expect(() => checkUpload(docx, docx.length, "document")).toThrow(
      FILE_UNSUPPORTED.document,
    );
    expect(checkUpload(png, png.length, "document").kind).toBe("image");
  });

  it("names only the private purposes", () => {
    expect(isPrivateUploadPurpose("portfolio")).toBe(true);
    expect(isPrivateUploadPurpose("document")).toBe(true);
    expect(isPrivateUploadPurpose("media")).toBe(false);
    expect(isPrivateUploadPurpose(undefined)).toBe(false);
  });
});

describe("portfolio links", () => {
  it("keeps real web addresses, trimmed, without blanks or repeats", () => {
    expect(
      checkPortfolioUrls([
        " https://behance.net/fox ",
        "",
        "http://fox.example.com/work",
        "https://behance.net/fox",
      ]),
    ).toEqual({
      ok: true,
      urls: ["https://behance.net/fox", "http://fox.example.com/work"],
    });
  });

  it("treats left out as none", () => {
    expect(checkPortfolioUrls(undefined)).toEqual({ ok: true, urls: [] });
    expect(checkPortfolioUrls(null)).toEqual({ ok: true, urls: [] });
  });

  it.each([
    ["not a URL", "behance.net/fox"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["ftp:", "ftp://files.example.com"],
    ["no dot in the host", "https://portfolio"],
    ["sign-in details", "https://me:pw@example.com"],
    ["too long", `https://example.com/${"a".repeat(2050)}`],
  ])("refuses %s", (_label, link) => {
    expect(checkPortfolioUrls([link]).ok).toBe(false);
  });

  it("refuses more than five, and a non-list", () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => `https://site${n}.example.com`);
    expect(checkPortfolioUrls(six)).toMatchObject({ ok: false });
    expect(checkPortfolioUrls("https://example.com")).toMatchObject({
      ok: false,
    });
  });
});

describe("resubmitting a flagged portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findRequestById.mockResolvedValue({
      id: "req-1",
      userId: "u1",
      roleType: "eventFoxer",
      status: "revision_requested",
      flaggedDocuments: ["portfolioFile", "validId1"],
    });
    fileCount.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.length,
    );
    fileFindMany.mockResolvedValue([]);
    applyResubmission.mockResolvedValue({ id: "req-1" });
  });

  it("refuses a file stored as an image, and changes nothing", async () => {
    fileFind.mockResolvedValue({ type: "image/webp" });
    await expect(
      RoleRequestService.resubmitDocuments("req-1", "u1", {
        portfolioFile: "file-img",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: FILE_UNSUPPORTED.portfolio,
    });
    expect(updateApplicationFiles).not.toHaveBeenCalled();
  });

  it("refuses a Word file named as an ID", async () => {
    fileFindMany.mockResolvedValue([{ type: DOCX_MIME }]);
    await expect(
      RoleRequestService.resubmitDocuments("req-1", "u1", {
        validId1: "file-docx",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: FILE_UNSUPPORTED.document,
    });
    expect(fileFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["file-docx"] } },
      select: { type: true },
    });
    expect(updateApplicationFiles).not.toHaveBeenCalled();
  });

  it("accepts a Word document", async () => {
    fileFind.mockResolvedValue({ type: DOCX_MIME });
    await RoleRequestService.resubmitDocuments("req-1", "u1", {
      portfolioFile: "file-docx",
    });
    expect(updateApplicationFiles).toHaveBeenCalledWith(
      "eventFoxerApplication",
      "req-1",
      { portfolioFileId: "file-docx" },
    );
  });
});
