import { describe, it, expect } from "vitest";
import {
  checkUpload,
  detectFileType,
  FILE_EMPTY,
  FILE_UNSUPPORTED,
} from "../src/utils/file-signature";

/**
 * QA: an executable renamed `qa.jpg` and a zero-byte file passed upload
 * validation, which read the file name. The type now comes from the bytes.
 */

const bytes = (...parts: (number[] | string)[]) =>
  Buffer.concat(
    parts.map((p) =>
      typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p),
    ),
  );

// An ISO base media `ftyp` box with the given major brand.
const ftyp = (brand: string) =>
  bytes([0, 0, 0, 0x18], "ftyp", brand, [0, 0, 0, 0], "isommp41");

describe("detectFileType", () => {
  it.each([
    ["JPEG", bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    [
      "PNG",
      bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    ],
    ["GIF", bytes("GIF89a"), "image/gif"],
    ["WebP", bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "), "image/webp"],
    ["PDF", bytes("%PDF-1.7"), "application/pdf"],
    ["MP4", ftyp("isom"), "video/mp4"],
    ["MOV", ftyp("qt  "), "video/quicktime"],
    [
      "WebM",
      bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], "webm"),
      "video/webm",
    ],
  ])("recognises %s", (_name, head, mime) => {
    expect(detectFileType(head)?.mime).toBe(mime);
  });

  it("rejects a Windows executable, whatever it is called", () => {
    expect(detectFileType(bytes("MZ", [0x90, 0, 3, 0]))).toBeNull();
  });

  it("does not take HEIC or AVIF for MP4 (same box, other brand)", () => {
    expect(detectFileType(ftyp("heic"))).toBeNull();
    expect(detectFileType(ftyp("mif1"))).toBeNull();
    expect(detectFileType(ftyp("avif"))).toBeNull();
  });

  it("rejects a Matroska file that is not WebM", () => {
    expect(
      detectFileType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f], "matroska")),
    ).toBeNull();
  });

  it("rejects empty and unknown bytes", () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(bytes("hello world"))).toBeNull();
  });
});

describe("checkUpload", () => {
  const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0]);

  it("refuses an empty file", () => {
    expect(() => checkUpload(Buffer.alloc(0), 0, "media")).toThrow(FILE_EMPTY);
  });

  it("refuses a kind the route does not take", () => {
    expect(() => checkUpload(bytes("%PDF-1.7"), 10, "image")).toThrow(
      FILE_UNSUPPORTED.image,
    );
    expect(() => checkUpload(ftyp("isom"), 10, "document")).toThrow(
      FILE_UNSUPPORTED.document,
    );
  });

  it("refuses a file over its kind's size cap", () => {
    expect(() => checkUpload(jpeg, 16 * 1024 * 1024, "image")).toThrow("15MB");
  });

  it("answers 400, as a message the user can act on", () => {
    try {
      checkUpload(bytes("MZ"), 2, "image");
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ status: 400, message: FILE_UNSUPPORTED.image });
    }
  });

  it("passes a supported file through", () => {
    expect(checkUpload(jpeg, 4, "image")).toMatchObject({ ext: "jpg" });
  });
});
