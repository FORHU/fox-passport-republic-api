import { GetObjectCommand, ObjectCannedACL, PutObjectCommand, S3 as AWSS3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import https from "https";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";

import {
  ACCESS_KEY_AWS,
  AWS_ACCESS_KEY_ID,
  AWS_REGION_AWS,
  AWS_S3_BUCKET_NAME,
  AWS_SECRET_ACCESS_KEY,
  BUCKET_PROTOCOL,
  CDN_ENDPOINT,
  DO_ENDPOINT,
  REGION_AWS,
  S3_BUCKET_NAME,
  SECRET_KEY_AWS,
} from "../config";

const doS3 = new AWSS3({
  forcePathStyle: false,
  endpoint: `${BUCKET_PROTOCOL}${DO_ENDPOINT}`,
  region: REGION_AWS,
  credentials: {
    accessKeyId: ACCESS_KEY_AWS,
    secretAccessKey: SECRET_KEY_AWS,
  },
});

const awsS3 = new AWSS3({
  region: AWS_REGION_AWS,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// eslint-disable-next-line no-undef
const uploadFileToS3 = async (fileData: Express.Multer.File) => {
  try {
    // Generate a unique filename using a UUID and the current timestamp
    const timestamp = Date.now();
    const uniqueKey = `${timestamp}-${uuidv4()}`;
    const fileExtension = fileData.originalname.split(".").pop();
    const newKey = `files/${uniqueKey}.${fileExtension}`;

    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: newKey,
      Body: fileData.buffer,
      ContentType: fileData.mimetype,
      ACL: ObjectCannedACL.public_read,
    };
    const data = await doS3.send(new PutObjectCommand(params));
    if (data.$metadata.httpStatusCode === 200) {
      return `${BUCKET_PROTOCOL}${S3_BUCKET_NAME}.${CDN_ENDPOINT}/${newKey}`;
    }
  } catch (err) {
    console.log("Error", err);
  }
};

const uploadPdfFileTos3 = async (fileBuffer: Buffer, Key: string) => {
  try {
    // Generate a unique filename using a UUID and the current timestamp
    const timestamp = Date.now();
    const uniqueKey = `${timestamp}-${uuidv4()}`;
    const fileExtension = Key.split(".").pop();
    const newKey = `files/${uniqueKey}.${fileExtension}`;
    const params = {
      Bucket: S3_BUCKET_NAME,
      Key: newKey,
      Body: fileBuffer,
      ContentType: "application/pdf",
      ACL: ObjectCannedACL.public_read,
    };
    const data = await doS3.send(new PutObjectCommand(params));
    if (data.$metadata.httpStatusCode === 200) {
      return `${BUCKET_PROTOCOL}${S3_BUCKET_NAME}.${CDN_ENDPOINT}/${newKey}`;
    }
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw { type: "OperationFailed", details: error };
  }
};

const copyFile = async (key: string) => {
  try {
    // Get file from AWS S3
    const getParams = {
      Bucket: AWS_S3_BUCKET_NAME,
      Key: key,
    };
    const { Body, ContentType } = await awsS3.send(new GetObjectCommand(getParams));

    if (Body instanceof Readable) {
      // Generate a unique filename using a UUID and the current timestamp
      const timestamp = Date.now();
      const uniqueKey = `${timestamp}-${uuidv4()}`;
      const fileExtension = key.split(".").pop();
      const newKey = `files/${uniqueKey}.${fileExtension}`;
      // Upload file to DigitalOcean Spaces
      const putParams = {
        Bucket: S3_BUCKET_NAME,
        Key: newKey,
        Body: Body,
        ContentType: ContentType || "application/octet-stream",
        ACL: ObjectCannedACL.public_read,
      };
      const upload = new Upload({
        client: doS3,
        params: putParams,
      });
      const result = await upload.done();
      return result;
    }
  } catch (error) {
    console.error(`Failed to copy ${key}:`, error);
  }
};

const downloadFiletoS3 = (fileUrl: string) => {
  return new Promise((resolve, reject) => {
    https
      .get(fileUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
        }
        resolve(response);
      })
      .on("error", reject);
  });
};

export { copyFile, downloadFiletoS3, uploadFileToS3, uploadPdfFileTos3 };
