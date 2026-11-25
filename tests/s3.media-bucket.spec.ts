import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#443: against local MinIO a missing media bucket failed every image
 * upload with NoSuchBucket. The API now creates it on first use, readable
 * without a signature like the CDN-served bucket. Never on real AWS.
 */

const send = vi.fn();

async function loadS3(env: Record<string, string | undefined>) {
  vi.resetModules();
  send.mockReset();
  vi.doMock("@aws-sdk/client-s3", async (importOriginal) => {
    const real = await importOriginal<typeof import("@aws-sdk/client-s3")>();
    class S3Client {
      middlewareStack = { add: () => {} };
      send = send;
    }
    return { ...real, S3Client };
  });
  vi.doMock("@aws-sdk/s3-request-presigner", () => ({
    getSignedUrl: vi.fn(async () => "http://localhost:9000/signed"),
  }));
  vi.doMock("../src/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/config")>()),
    AWS_REGION: "us-east-1",
    AWS_S3_BUCKET: "fox-passport-uploads",
    AWS_ACCESS_KEY: "local-key",
    AWS_SECRET_ACCESS_KEY: "local-secret",
    S3_CDN_URL: undefined,
    CLOUD_FRONT_DOMAIN: undefined,
    S3_ENDPOINT: "http://localhost:9000",
    S3_FORCE_PATH_STYLE: true,
    ...env,
  }));
  return import("../src/utils/s3");
}

const sent = () => send.mock.calls.map(([command]) => command.constructor.name);

describe("local media bucket", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("is created and made readable when missing, before the upload link", async () => {
    const s3 = await loadS3({});
    send.mockImplementation(async (command) => {
      if (command.constructor.name === "HeadBucketCommand") {
        throw Object.assign(new Error("NotFound"), { name: "NotFound" });
      }
      return {};
    });

    await s3.getPutObjectPresignedUrl({
      key: "users/u1/uploads/a.jpg",
      contentType: "image/jpeg",
      contentLength: 10,
    });

    expect(sent()).toEqual([
      "HeadBucketCommand",
      "CreateBucketCommand",
      "PutBucketPolicyCommand",
    ]);
    const policy = JSON.parse(send.mock.calls[2][0].input.Policy);
    expect(policy.Statement).toEqual([
      expect.objectContaining({
        Effect: "Allow",
        Action: ["s3:GetObject"],
        Resource: ["arn:aws:s3:::fox-passport-uploads/*"],
      }),
    ]);
  });

  it("is left as it is when it exists, and checked only once", async () => {
    const s3 = await loadS3({});
    send.mockResolvedValue({});

    const upload = { key: "k", body: Buffer.from("x"), contentType: "image/png" };
    await s3.uploadToS3(upload);
    await s3.uploadToS3(upload);

    expect(sent()).toEqual([
      "HeadBucketCommand",
      "PutObjectCommand",
      "PutObjectCommand",
    ]);
  });

  it("is retried on the next upload when creating it failed", async () => {
    const s3 = await loadS3({});
    send.mockRejectedValueOnce(new Error("NotFound"));
    send.mockRejectedValueOnce(new Error("MinIO down"));
    const upload = { key: "k", body: Buffer.from("x"), contentType: "image/png" };

    await expect(s3.uploadToS3(upload)).rejects.toThrow("MinIO down");
    send.mockResolvedValue({});
    await s3.uploadToS3(upload);

    expect(sent().slice(2)).toEqual(["HeadBucketCommand", "PutObjectCommand"]);
  });

  it("is never touched on real AWS (no S3_ENDPOINT)", async () => {
    const s3 = await loadS3({ S3_ENDPOINT: undefined });
    send.mockResolvedValue({});

    await s3.uploadToS3({ key: "k", body: Buffer.from("x"), contentType: "image/png" });

    expect(sent()).toEqual(["PutObjectCommand"]);
  });
});
