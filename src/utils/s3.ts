import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_S3_BUCKET,
  CLOUD_FRONT_DOMAIN,
} from "../config";

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// ULTIMATE CHECKSUM KILLER: 
// This middleware runs just before signing and removes the Checksum property 
// that the AWS SDK v3 often injects automatically.
s3Client.middlewareStack.add(
  (next) => (args: any) => {
    if (args.input) {
      delete args.input.ChecksumAlgorithm;
    }
    return next(args);
  },
  {
    step: "initialize",
    name: "removeChecksumMiddleware",
  }
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
  } as any);

  // Sign only the host to keep it as simple as possible for the browser
  const url = await getSignedUrl(s3Client, command, { 
    expiresIn: 3600,
    signableHeaders: new Set(["host"])
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

export async function getGetObjectPresignedUrl(params: {
  key: string;
}) {
  const { key } = params;
  if (CLOUD_FRONT_DOMAIN) {
    const normalizedDomain = CLOUD_FRONT_DOMAIN.replace(/\/+$/, "");
    const normalizedKey = key.replace(/^\/+/, "");
    return `${normalizedDomain}/${normalizedKey}`;
  }
  const command = new GetObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return url;
}