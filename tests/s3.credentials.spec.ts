import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BUG-01: on an AWS host (dev/staging) no access keys are configured — the
 * instance role grants S3. The client must then leave `credentials` out so the
 * SDK's default provider chain resolves the role; an empty credentials object
 * failed every upload with "Resolved credential object is not valid".
 */

async function loadS3(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.doMock("../src/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/config")>()),
    AWS_REGION: "ap-southeast-1",
    AWS_S3_BUCKET: "fox-passport-republic-staging",
    AWS_ACCESS_KEY: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    S3_CDN_URL: undefined,
    CLOUD_FRONT_DOMAIN: undefined,
    S3_ENDPOINT: undefined,
    ...env,
  }));
  return import("../src/utils/s3");
}

describe("S3 client credentials", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("omits credentials when no keys are set (the deployed setup)", async () => {
    const { s3ClientConfig } = await loadS3({});
    expect(s3ClientConfig).not.toHaveProperty("credentials");
    expect(s3ClientConfig.region).toBe("ap-southeast-1");
  });

  it("passes static keys when both are set (local MinIO)", async () => {
    const { s3ClientConfig } = await loadS3({
      AWS_ACCESS_KEY: "local-key",
      AWS_SECRET_ACCESS_KEY: "local-secret",
    });
    expect(s3ClientConfig).toMatchObject({
      credentials: {
        accessKeyId: "local-key",
        secretAccessKey: "local-secret",
      },
    });
  });

  it("ignores a half key pair and warns", async () => {
    const { s3ClientConfig } = await loadS3({ AWS_ACCESS_KEY: "only-the-id" });
    expect(s3ClientConfig).not.toHaveProperty("credentials");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Only one of AWS_ACCESS_KEY"),
    );
  });
});

describe("stored media links", () => {
  it("use S3_CDN_URL, so they never expire", async () => {
    const { getGetObjectPresignedUrl } = await loadS3({
      S3_CDN_URL: "https://d2uywbslpln2xw.cloudfront.net/",
    });
    await expect(
      getGetObjectPresignedUrl({ key: "/users/u1/uploads/a.webp" }),
    ).resolves.toBe(
      "https://d2uywbslpln2xw.cloudfront.net/users/u1/uploads/a.webp",
    );
  });

  it("still honour the older CLOUD_FRONT_DOMAIN", async () => {
    const { getGetObjectPresignedUrl } = await loadS3({
      CLOUD_FRONT_DOMAIN: "https://old.cloudfront.net",
    });
    await expect(
      getGetObjectPresignedUrl({ key: "users/u1/uploads/a.webp" }),
    ).resolves.toBe("https://old.cloudfront.net/users/u1/uploads/a.webp");
  });
});
