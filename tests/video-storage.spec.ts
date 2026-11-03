import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Videos live in real AWS S3, never in the local MinIO the photos may use.
 * Pure: the S3 client is built but never called, and the service is run
 * against a mocked util.
 */

const s3 = vi.hoisted(() => ({
  getPutObjectPresignedUrl: vi.fn(),
  getGetObjectPresignedUrl: vi.fn(
    async ({ key }: { key: string }) => `https://media.example/${key}`,
  ),
  uploadToS3: vi.fn(async () => undefined),
  uploadPrivateToS3: vi.fn(async () => undefined),
  uploadVideoToS3: vi.fn(async () => undefined),
  getVideoUrl: vi.fn((key: string) => `https://video.example/${key}`),
  isVideoStorageConfigured: vi.fn(() => true),
  headObject: vi.fn(),
  readObjectHead: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

async function loadS3(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.doMock("../src/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/config")>()),
    AWS_REGION: "ap-southeast-1",
    AWS_S3_BUCKET: "fox-media",
    AWS_S3_VIDEO_BUCKET: undefined,
    AWS_VIDEO_REGION: undefined,
    AWS_VIDEO_ACCESS_KEY: undefined,
    AWS_VIDEO_SECRET_ACCESS_KEY: undefined,
    VIDEO_CDN_URL: undefined,
    AWS_ACCESS_KEY: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    S3_CDN_URL: undefined,
    CLOUD_FRONT_DOMAIN: undefined,
    S3_ENDPOINT: undefined,
    S3_FORCE_PATH_STYLE: false,
    ...env,
  }));
  return import("../src/utils/s3");
}

const minio = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_FORCE_PATH_STYLE: true,
  AWS_S3_BUCKET: "fox-passport-dev",
  AWS_ACCESS_KEY: "minio-key",
  AWS_SECRET_ACCESS_KEY: "minio-secret",
} as const;

describe("the video bucket", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("is refused against local MinIO until a video bucket is set", async () => {
    const { isVideoStorageConfigured, VIDEO_BUCKET } = await loadS3(minio);

    expect(VIDEO_BUCKET).toBeUndefined();
    expect(isVideoStorageConfigured()).toBe(false);
  });

  it("never points the video client at MinIO, nor hands it MinIO's keys", async () => {
    const { videoClientConfig } = await loadS3({
      ...minio,
      AWS_S3_VIDEO_BUCKET: "fox-video",
    });

    expect(videoClientConfig).not.toHaveProperty("endpoint");
    expect(videoClientConfig).not.toHaveProperty("forcePathStyle");
    // MinIO's keys are no good on AWS: the default credential chain is used.
    expect(videoClientConfig).not.toHaveProperty("credentials");
  });

  it("uses its own keys when they are given", async () => {
    const { videoClientConfig, isVideoStorageConfigured } = await loadS3({
      ...minio,
      AWS_S3_VIDEO_BUCKET: "fox-video",
      AWS_VIDEO_ACCESS_KEY: "aws-key",
      AWS_VIDEO_SECRET_ACCESS_KEY: "aws-secret",
    });

    expect(isVideoStorageConfigured()).toBe(true);
    expect(videoClientConfig).toMatchObject({
      credentials: { accessKeyId: "aws-key", secretAccessKey: "aws-secret" },
    });
  });

  it("defaults to the media bucket on an AWS host", async () => {
    const { VIDEO_BUCKET, videoClientConfig } = await loadS3({});

    expect(VIDEO_BUCKET).toBe("fox-media");
    expect(videoClientConfig).not.toHaveProperty("credentials");
    expect(videoClientConfig.region).toBe("ap-southeast-1");
  });

  it("links a video by the CDN, else by the bucket's own address", async () => {
    const withCdn = await loadS3({
      AWS_S3_VIDEO_BUCKET: "fox-video",
      VIDEO_CDN_URL: "https://videos.example.net/",
    });
    expect(withCdn.getVideoUrl("/users/u1/uploads/a.mp4")).toBe(
      "https://videos.example.net/users/u1/uploads/a.mp4",
    );

    const bare = await loadS3({ AWS_S3_VIDEO_BUCKET: "fox-video" });
    expect(bare.getVideoUrl("users/u1/uploads/a.mp4")).toBe(
      "https://fox-video.s3.ap-southeast-1.amazonaws.com/users/u1/uploads/a.mp4",
    );
  });
});

describe("uploading a video (S3Svc.uploadFile)", () => {
  // An MP4: an `ftyp` box with the `isom` brand.
  const mp4 = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from("ftypisom\0\0\2\0isomiso2", "latin1"),
    Buffer.alloc(64),
  ]);
  const file = {
    buffer: mp4,
    originalname: "clip.mp4",
    mimetype: "video/mp4",
    size: mp4.length,
  };

  async function service() {
    vi.resetModules();
    vi.doMock("../src/utils/s3", () => s3);
    return (await import("../src/modules/s3/s3.service")).default;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    s3.isVideoStorageConfigured.mockReturnValue(true);
  });

  it("stores it in the video bucket, never the media one, and links it", async () => {
    const S3Svc = await service();

    const stored = await S3Svc.uploadFile("u1", file);

    expect(s3.uploadVideoToS3).toHaveBeenCalledOnce();
    expect(s3.uploadToS3).not.toHaveBeenCalled();
    expect(stored.contentType).toBe("video/mp4");
    expect(stored.key).toMatch(/^users\/u1\/uploads\/.+\.mp4$/);
    expect(stored).toMatchObject({ url: `https://video.example/${stored.key}` });
  });

  it("is refused with a 503 where no video bucket is set up", async () => {
    s3.isVideoStorageConfigured.mockReturnValue(false);
    const S3Svc = await service();

    await expect(S3Svc.uploadFile("u1", file)).rejects.toMatchObject({
      status: 503,
      code: "VIDEO_STORAGE_NOT_CONFIGURED",
    });
    expect(s3.uploadVideoToS3).not.toHaveBeenCalled();
    expect(s3.uploadToS3).not.toHaveBeenCalled();
  });

  it("still stores an image the way it always did", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#f00" },
    })
      .png()
      .toBuffer();
    const S3Svc = await service();

    const stored = await S3Svc.uploadFile("u1", {
      buffer: png,
      originalname: "a.png",
      mimetype: "image/png",
      size: png.length,
    });

    expect(s3.uploadToS3).toHaveBeenCalledOnce();
    expect(s3.uploadVideoToS3).not.toHaveBeenCalled();
    expect(stored).not.toHaveProperty("url");
  });
});
