import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
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
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
} from "../config";

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  ...(S3_ENDPOINT && { endpoint: S3_ENDPOINT }),
  ...(S3_FORCE_PATH_STYLE && { forcePathStyle: true }),
});

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
 */
export async function getPutObjectPresignedUrl(params: {
  key: string;
  contentType?: string;
}) {
  const { key, contentType } = params;

  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType,
    // Explicitly set to undefined to prevent SDK injection
    ChecksumAlgorithm: undefined,
  });

  // Sign only the host to keep it as simple as possible for the browser
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 3600,
    signableHeaders: new Set(["host"]),
  });

  return url;
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
  if (CLOUD_FRONT_DOMAIN) {
    const normalizedDomain = CLOUD_FRONT_DOMAIN.replace(/\/+$/, "");
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
