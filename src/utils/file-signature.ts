/**
 * What an upload may be, decided from its first bytes — never from the file
 * name or the Content-Type the client sends, both of which the client picks.
 * An executable renamed `qa.jpg` used to pass on its name alone.
 *
 * The one list of supported formats and size caps. The web app mirrors it in
 * src/shared/lib/uploadRules.ts; change both together.
 *
 * HEIC is not supported: sharp's prebuilt binaries cannot decode it. The
 * mobile app is unaffected — its image picker hands over JPEG.
 */

import { badRequest } from "./errors";

const MB = 1024 * 1024;

export type FileKind = "image" | "video" | "pdf";

export interface DetectedFile {
  kind: FileKind;
  mime: string;
  ext: string;
}

/** The largest file of each kind any upload accepts. */
export const MAX_UPLOAD_SIZE: Record<FileKind, number> = {
  image: 15 * MB,
  video: 100 * MB,
  pdf: 15 * MB,
};

/**
 * Which kinds each upload route takes: `image` is the presigned listing /
 * venue / avatar upload, `media` is upload-direct (posts, chat), `document`
 * is the private bucket (IDs, clearances, proof of funds).
 */
export const UPLOAD_KINDS = {
  image: ["image"],
  media: ["image", "video"],
  document: ["image", "pdf"],
} as const satisfies Record<string, readonly FileKind[]>;

export type UploadPurpose = keyof typeof UPLOAD_KINDS;

export const FILE_EMPTY = "This file is empty.";
export const IMAGE_UNREADABLE =
  "This image couldn't be read. Try another file.";
export const FILE_UNSUPPORTED: Record<UploadPurpose, string> = {
  image: "Use a JPG, PNG, WebP or GIF image",
  media: "Use a JPG, PNG, WebP or GIF image, or an MP4, MOV or WebM video",
  document: "Use a JPG, PNG, WebP or GIF image, or a PDF",
};
export const fileTooLarge = (kind: FileKind) =>
  `File size must be ${MAX_UPLOAD_SIZE[kind] / MB}MB or below`;

const FORMATS: Record<string, DetectedFile> = {
  jpeg: { kind: "image", mime: "image/jpeg", ext: "jpg" },
  png: { kind: "image", mime: "image/png", ext: "png" },
  gif: { kind: "image", mime: "image/gif", ext: "gif" },
  webp: { kind: "image", mime: "image/webp", ext: "webp" },
  mp4: { kind: "video", mime: "video/mp4", ext: "mp4" },
  mov: { kind: "video", mime: "video/quicktime", ext: "mov" },
  webm: { kind: "video", mime: "video/webm", ext: "webm" },
  pdf: { kind: "pdf", mime: "application/pdf", ext: "pdf" },
};

/** The supported format with this Content-Type, if any. */
export const formatForMime = (mime: string): DetectedFile | undefined =>
  Object.values(FORMATS).find((f) => f.mime === mime);

/** The Content-Types an upload may declare, per route — the formats above. */
export function acceptedMimeTypes(purpose: UploadPurpose): string[] {
  const kinds: readonly FileKind[] = UPLOAD_KINDS[purpose];
  return Object.values(FORMATS)
    .filter((f) => kinds.includes(f.kind))
    .map((f) => f.mime);
}

// ISO base media (MP4/MOV) major brands we accept. HEIC/AVIF share the same
// `ftyp` box with brands like `heic`, `mif1` or `avif`, so they fall through.
const MP4_BRANDS = [
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "dash",
  "M4V ",
  "M4VH",
  "M4VP",
  "mmp4",
  "MSNV",
];

const ascii = (head: Buffer, start: number, end: number) =>
  head.toString("latin1", start, end);

/** The supported format these bytes start with, or null for anything else. */
export function detectFileType(head: Buffer): DetectedFile | null {
  if (
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff
  ) {
    return FORMATS.jpeg;
  }
  if (
    head.length >= 8 &&
    head
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return FORMATS.png;
  }
  if (["GIF87a", "GIF89a"].includes(ascii(head, 0, 6))) return FORMATS.gif;
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") {
    return FORMATS.webp;
  }
  if (ascii(head, 0, 5) === "%PDF-") return FORMATS.pdf;
  if (ascii(head, 4, 8) === "ftyp") {
    const brand = ascii(head, 8, 12);
    if (brand === "qt  ") return FORMATS.mov;
    if (MP4_BRANDS.includes(brand)) return FORMATS.mp4;
    return null;
  }
  // WebM is Matroska (EBML header) whose DocType says "webm".
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) {
    return ascii(head, 0, Math.min(head.length, 64)).includes("webm")
      ? FORMATS.webm
      : null;
  }
  return null;
}

/**
 * The detected format of an upload's bytes, or an error a user can act on:
 * empty, not a supported format for this route, or over its size cap.
 */
export function checkUpload(
  head: Buffer,
  size: number,
  purpose: UploadPurpose,
): DetectedFile {
  if (size <= 0 || head.length === 0) throw badRequest(FILE_EMPTY);
  const detected = detectFileType(head);
  const kinds: readonly FileKind[] = UPLOAD_KINDS[purpose];
  if (!detected || !kinds.includes(detected.kind)) {
    throw badRequest(FILE_UNSUPPORTED[purpose]);
  }
  if (size > MAX_UPLOAD_SIZE[detected.kind]) {
    throw badRequest(fileTooLarge(detected.kind));
  }
  return detected;
}
