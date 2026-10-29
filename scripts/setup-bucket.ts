// Creates the bucket and its CORS rules for local development.
// In production the bucket is infrastructure (Terraform, CloudFormation, ...),
// and the app's credentials shouldn't be allowed to create buckets at all.
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { config } from "../src/config.ts";
import { s3Client } from "../src/storage.ts";

const Bucket = config.s3.bucket;

// SeaweedFS can take a few seconds after its container starts before the S3
// API answers, so retry instead of failing on a fresh `docker compose up`.
async function bucketExists(attemptsLeft = 15): Promise<boolean> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    if (attemptsLeft <= 1) {
      throw new Error(`Can't reach object storage at ${config.s3.endpoint}. Is Docker running?`, { cause: err });
    }
    console.log("Waiting for object storage to start…");
    await new Promise((r) => setTimeout(r, 2000));
    return bucketExists(attemptsLeft - 1);
  }
}

if (await bucketExists()) {
  console.log(`Bucket "${Bucket}" already exists`);
} else {
  await s3Client.send(new CreateBucketCommand({ Bucket }));
  console.log(`Created bucket "${Bucket}"`);
}

// Browsers upload and download directly, so the bucket must allow the app's origin.
await s3Client.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [`http://localhost:${config.port}`],
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedHeaders: ["content-type"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log("Applied CORS rules");
