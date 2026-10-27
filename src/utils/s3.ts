import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_S3_BUCKET,
  AWS_S3_PRIVATE_BUCKET,
  CLOUD_FRONT_DOMAIN,
  S3_CDN_URL,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
} from "../config";

// Static keys only when both are set (local MinIO, or running off AWS). On an
// AWS host none are configured: the instance role grants S3 and the SDK's
// default provider chain resolves it. Passing an empty credentials object
// would skip that chain and fail every upload with "Resolved credential
// object is not valid" — see .github/workflows/deploy-dev.yml.
const staticCredentials =
  AWS_ACCESS_KEY && AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_ACCESS_KEY }
    : undefined;

if (!staticCredentials && (AWS_ACCESS_KEY || AWS_SECRET_ACCESS_KEY)) {
  console.warn(
    "[s3] Only one of AWS_ACCESS_KEY / AWS_SECRET_ACCESS_KEY is set — ignoring " +
      "it and using the default AWS credential chain. Set both or neither.",
  );
}

export const s3ClientConfig = {
  region: AWS_REGION,
  ...(staticCredentials && { credentials: staticCredentials }),
  ...(S3_ENDPOINT && { endpoint: S3_ENDPOINT }),
  ...(S3_FORCE_PATH_STYLE && { forcePathStyle: true }),
};

const s3Client = new S3Client(s3ClientConfig);

// The public CDN in front of the media bucket. S3_CDN_URL is what deployed
// environments set; CLOUD_FRONT_DOMAIN is the older name, still honoured.
const CDN_URL = S3_CDN_URL || CLOUD_FRONT_DOMAIN;

// ULTIMATE CHECKSUM KILLER:
// This middleware runs just before signing and removes the Checksum property
// that the AWS SDK v3 often injects automatically.
s3Client.middlewareStack.add(
  (next) => (args) => {
    const input = args.input as { ChecksumAlgorithm?: unknown } | undefined;
    if (input) {
      delete input.ChecksumAlgorithm;
    }
    return next(args);
  },
  {
    step: "initialize",
    name: "removeChecksumMiddleware",
  },
);

/**
 * Generates a presigned URL for direct S3 upload.
 *
 * The declared type and size are part of the signature, so S3 refuses a PUT
 * of anything else (a browser sends both headers for a File body on its own).
 * What the bytes actually are is checked after the upload — verifyUpload.
 */
export async function getPutObjectPresignedUrl(params: {
  key: string;
  contentType: string;
  contentLength: number;
}) {
  const { key, contentType, contentLength } = params;

  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
    // Explicitly set to undefined to prevent SDK injection
    ChecksumAlgorithm: undefined,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 3600,
    signableHeaders: new Set(["host", "content-type", "content-length"]),
  });

  return url;
}

/** Size and stored Content-Type of an uploaded object in the media bucket. */
export async function headObject(key: string) {
  const res = await s3Client.send(
    new HeadObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key }),
  );
  return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
}

/** The first `bytes` of an object — enough to read its file signature. */
export async function readObjectHead(key: string, bytes = 4096) {
  const res = await s3Client.send(
    new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: key,
      Range: `bytes=0-${bytes - 1}`,
    }),
  );
  const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> };
  return Buffer.from((await body?.transformToByteArray?.()) ?? []);
}

export async function deleteObject(key: string) {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: AWS_S3_BUCKET, Key: key }),
  );
}

export async function uploadToS3(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  const { key, body, contentType } = params;
  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
  return key;
}

export async function getGetObjectPresignedUrl(params: { key: string }) {
  const { key } = params;
  if (CDN_URL) {
    const normalizedDomain = CDN_URL.replace(/\/+$/, "");
    const normalizedKey = key.replace(/^\/+/, "");
    return `${normalizedDomain}/${normalizedKey}`;
  }
  // Local/dev against MinIO: this URL gets persisted permanently (into
  // Post.mediaUrls, Message.attachmentUrls) rather than re-signed on every
  // read, so a presigned link (1hr expiry) silently goes dead well before
  // anyone looks at it again. The local bucket is set to public-read for
  // exactly this reason — build a stable direct URL instead, which never
  // expires and needs no signature.
  if (S3_ENDPOINT) {
    const normalizedEndpoint = S3_ENDPOINT.replace(/\/+$/, "");
    const normalizedKey = key.replace(/^\/+/, "");
    return S3_FORCE_PATH_STYLE
      ? `${normalizedEndpoint}/${AWS_S3_BUCKET}/${normalizedKey}`
      : `${normalizedEndpoint}/${normalizedKey}`;
  }
  const command = new GetObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return url;
}

// --- Private documents -------------------------------------------------------
//
// Government IDs, clearances and proof of funds never get a stable public URL:
// they live in their own bucket (no public access, no CDN) and are read only
// through presigned links that expire in minutes, minted per request for
// whoever is allowed to see them.

const PRIVATE_BUCKET = AWS_S3_PRIVATE_BUCKET || AWS_S3_BUCKET;

if (!AWS_S3_PRIVATE_BUCKET) {
  console.warn(
    "[s3] AWS_S3_PRIVATE_BUCKET is not set — identity documents fall back to " +
      "the public media bucket. Set it before handling real documents.",
  );
}

/** How long a link to a private document works. */
export const PRIVATE_LINK_TTL_SECONDS = 15 * 60;

let privateBucketReady: Promise<void> | null = null;

/**
 * Local MinIO only: create the private bucket on first use, so a dev setup
 * needs nothing beyond the env var. A new MinIO bucket has no anonymous
 * policy, so it is private by default. Real AWS buckets are provisioned by
 * infrastructure, never from here.
 */
function ensurePrivateBucket(): Promise<void> {
  if (!S3_ENDPOINT || !AWS_S3_PRIVATE_BUCKET) return Promise.resolve();
  privateBucketReady ??= (async () => {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: PRIVATE_BUCKET }));
    } catch {
      await s3Client.send(new CreateBucketCommand({ Bucket: PRIVATE_BUCKET }));
    }
  })().catch((err) => {
    privateBucketReady = null; // retry on the next upload
    throw err;
  });
  return privateBucketReady;
}

export async function uploadPrivateToS3(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await ensurePrivateBucket();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
  return params.key;
}

/** A link to a private document that stops working after a few minutes. */
export async function getPrivateObjectUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }),
    { expiresIn: PRIVATE_LINK_TTL_SECONDS },
  );
}
