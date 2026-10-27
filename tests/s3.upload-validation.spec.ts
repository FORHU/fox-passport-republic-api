import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

/**
 * QA (File Upload Validation): every upload route used to decide a file's type
 * from its name, and stored the original bytes whenever re-encoding failed —
 * so an executable renamed `qa.jpg` and a zero-byte file were both stored.
 * Presigned uploads were never looked at by the server at all.
 */

const s3 = vi.hoisted(() => ({
  getPutObjectPresignedUrl: vi.fn(async () => "https://signed.example/put"),
  getGetObjectPresignedUrl: vi.fn(
    async ({ key }: { key: string }) => `https://cdn.example/${key}`,
  ),
  uploadToS3: vi.fn(async () => undefined),
  uploadPrivateToS3: vi.fn(async () => undefined),
  headObject: vi.fn(),
  readObjectHead: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));
vi.mock("../src/utils/s3", () => s3);

import S3Svc from "../src/modules/s3/s3.service";
import {
  FILE_EMPTY,
  FILE_UNSUPPORTED,
  IMAGE_UNREADABLE,
} from "../src/utils/file-signature";

const exe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00 this program", "latin1");
const heic = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from("ftypheic\0\0\0\0mif1heic", "latin1"),
]);
const upload = (buffer: Buffer, originalname: string, mimetype: string) => ({
  buffer,
  originalname,
  mimetype,
  size: buffer.length,
});

let png: Buffer;
beforeEach(async () => {
  vi.clearAllMocks();
  png ??= await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#f00" },
  })
    .png()
    .toBuffer();
});

describe("upload-direct (S3Svc.uploadFile)", () => {
  it("refuses an executable renamed qa.jpg, and stores nothing", async () => {
    await expect(
      S3Svc.uploadFile("u1", upload(exe, "qa.jpg", "image/jpeg")),
    ).rejects.toMatchObject({ status: 400, message: FILE_UNSUPPORTED.media });
    expect(s3.uploadToS3).not.toHaveBeenCalled();
  });

  it("refuses a zero-byte image", async () => {
    await expect(
      S3Svc.uploadFile(
        "u1",
        upload(Buffer.alloc(0), "empty.jpg", "image/jpeg"),
      ),
    ).rejects.toThrow(FILE_EMPTY);
    expect(s3.uploadToS3).not.toHaveBeenCalled();
  });

  it("refuses HEIC with the supported-formats message", async () => {
    await expect(
      S3Svc.uploadFile("u1", upload(heic, "IMG_0001.heic", "image/heic")),
    ).rejects.toThrow(FILE_UNSUPPORTED.media);
  });

  it("refuses an image that only starts like one, instead of storing it", async () => {
    const fake = Buffer.concat([png.subarray(0, 16), Buffer.alloc(64)]);
    await expect(
      S3Svc.uploadFile("u1", upload(fake, "broken.png", "image/png")),
    ).rejects.toThrow(IMAGE_UNREADABLE);
    const fakeGif = Buffer.from("GIF89a not really a gif", "latin1");
    await expect(
      S3Svc.uploadFile("u1", upload(fakeGif, "x.gif", "image/gif")),
    ).rejects.toThrow(IMAGE_UNREADABLE);
    expect(s3.uploadToS3).not.toHaveBeenCalled();
  });

  it("goes by the bytes, not the name: a real PNG called .exe is stored as WebP", async () => {
    const { key, contentType } = await S3Svc.uploadFile(
      "u1",
      upload(png, "photo.exe", "application/octet-stream"),
    );
    expect(contentType).toBe("image/webp");
    expect(key).toMatch(/^users\/u1\/uploads\/.+\.webp$/);
    expect(s3.uploadToS3).toHaveBeenCalledOnce();
  });
});

describe("private documents (S3Svc.uploadPrivateFile)", () => {
  it("refuses an executable renamed as a PDF", async () => {
    await expect(
      S3Svc.uploadPrivateFile("u1", upload(exe, "id.pdf", "application/pdf")),
    ).rejects.toThrow(FILE_UNSUPPORTED.document);
    expect(s3.uploadPrivateToS3).not.toHaveBeenCalled();
  });

  it("stores a real PDF", async () => {
    const pdf = Buffer.from("%PDF-1.7\n%âãÏÓ\n", "latin1");
    const { contentType } = await S3Svc.uploadPrivateFile(
      "u1",
      upload(pdf, "nbi.pdf", "application/pdf"),
    );
    expect(contentType).toBe("application/pdf");
  });
});

describe("presigned uploads", () => {
  it("signs the declared type and size into the URL", async () => {
    await S3Svc.generateUploadUrl("u1", "image/png", 1234);
    expect(s3.getPutObjectPresignedUrl).toHaveBeenCalledWith({
      key: expect.stringMatching(/^users\/u1\/uploads\/.+\.png$/),
      contentType: "image/png",
      contentLength: 1234,
    });
  });

  it("refuses an unsupported or empty declaration with a clear message", async () => {
    await expect(
      S3Svc.generateUploadUrl("u1", "image/heic", 10),
    ).rejects.toMatchObject({ status: 400, message: FILE_UNSUPPORTED.image });
    await expect(
      S3Svc.generateUploadUrl("u1", "application/pdf", 10),
    ).rejects.toThrow(FILE_UNSUPPORTED.image);
    await expect(S3Svc.generateUploadUrl("u1", "image/png", 0)).rejects.toThrow(
      FILE_EMPTY,
    );
  });

  it("registers an upload only once its bytes are a supported image", async () => {
    s3.headObject.mockResolvedValue({
      size: png.length,
      contentType: "image/png",
    });
    s3.readObjectHead.mockResolvedValue(png.subarray(0, 64));
    const key = "users/u1/uploads/a.png";
    await expect(S3Svc.verifyUpload("u1", key)).resolves.toEqual({
      url: `https://cdn.example/${key}`,
      contentType: "image/png",
    });
    expect(s3.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes an executable uploaded under an image's name", async () => {
    s3.headObject.mockResolvedValue({
      size: exe.length,
      contentType: "image/jpeg",
    });
    s3.readObjectHead.mockResolvedValue(exe);
    const key = "users/u1/uploads/qa.jpg";
    await expect(S3Svc.verifyUpload("u1", key)).rejects.toThrow(
      FILE_UNSUPPORTED.image,
    );
    expect(s3.deleteObject).toHaveBeenCalledWith(key);
  });

  it("deletes an empty upload", async () => {
    s3.headObject.mockResolvedValue({ size: 0, contentType: "image/jpeg" });
    const key = "users/u1/uploads/empty.jpg";
    await expect(S3Svc.verifyUpload("u1", key)).rejects.toThrow(FILE_EMPTY);
    expect(s3.deleteObject).toHaveBeenCalledWith(key);
  });

  it("will not register another user's upload, or a missing one", async () => {
    await expect(
      S3Svc.verifyUpload("u1", "users/u2/uploads/a.png"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      S3Svc.verifyUpload("u1", "users/u1/uploads/../../u2/uploads/a.png"),
    ).rejects.toMatchObject({ status: 404 });
    s3.headObject.mockRejectedValue(new Error("NotFound"));
    await expect(
      S3Svc.verifyUpload("u1", "users/u1/uploads/gone.png"),
    ).rejects.toMatchObject({ status: 404 });
    expect(s3.deleteObject).not.toHaveBeenCalled();
  });
});
