import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_S3_BUCKET,
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
