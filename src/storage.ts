import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.ts";

const { s3 } = config;
const credentials = { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey };

// Used by the server for its own calls (HEAD, DELETE, ...).
export const s3Client = new S3Client({
  region: s3.region,
  endpoint: s3.endpoint,
  forcePathStyle: s3.forcePathStyle,
  credentials,
});

// Used only to sign URLs that browsers will call. Kept separate because the
// host a browser uses can differ from the one the server uses (for example
// "minio:9000" inside Docker vs "localhost:9000" outside it), and the host is
// part of the signature.
const presignClient = new S3Client({
  region: s3.region,
  endpoint: s3.publicEndpoint,
  forcePathStyle: s3.forcePathStyle,
  credentials,
  // Without this, SDK v3 bakes a CRC32 of an *empty* body into presigned PUT
  // URLs (x-amz-checksum-crc32=AAAAAA==) and every real upload fails with
  // BadDigest. The SDK can't checksum a body it never sees.
  requestChecksumCalculation: "WHEN_REQUIRED",
});

/**
 * URL the browser PUTs the file to. Content-Type and Content-Length are part
 * of the signature, so the upload is rejected if either differs from what the
 * client declared to the API.
 */
export function presignUpload(key: string, contentType: string, sizeBytes: number) {
  return getSignedUrl(
    presignClient,
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    }),
    {
      expiresIn: config.uploadUrlTtlSeconds,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
}

/** Short-lived URL for viewing or downloading a private object. */
export function presignDownload(key: string, filename: string) {
  return getSignedUrl(
    presignClient,
    new GetObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }),
    { expiresIn: config.downloadUrlTtlSeconds },
  );
}

/** Returns the object's size and type, or undefined if it doesn't exist. */
export async function headObject(key: string) {
  try {
    const res = await s3Client.send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key }));
    return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
  } catch (err) {
    if (err instanceof NotFound) return undefined;
    throw err;
  }
}

/** First page (up to 1000) of objects under a prefix. */
export async function listObjects(prefix: string) {
  const res = await s3Client.send(new ListObjectsV2Command({ Bucket: s3.bucket, Prefix: prefix }));
  return (res.Contents ?? []).map((o) => ({
    key: o.Key!,
    sizeBytes: o.Size ?? 0,
    lastModified: o.LastModified,
    etag: o.ETag,
  }));
}

/** Idempotent: deleting a missing key succeeds. */
export async function deleteObject(key: string) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
}
