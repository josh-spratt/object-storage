function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  enableExplorer: process.env.ENABLE_EXPLORER === "true",
  databaseUrl: required("DATABASE_URL"),
  s3: {
    region: required("S3_REGION"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    endpoint: process.env.S3_ENDPOINT || undefined,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  },
  // How long presigned URLs stay valid. Keep these short.
  uploadUrlTtlSeconds: 5 * 60,
  downloadUrlTtlSeconds: 15 * 60,
};

const MB = 1024 * 1024;

// Allowlist of accepted uploads. The extension comes from here, never from
// the user's filename.
export const allowedTypes: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 10 * MB },
  "image/png": { ext: "png", maxBytes: 10 * MB },
  "image/webp": { ext: "webp", maxBytes: 10 * MB },
  "image/gif": { ext: "gif", maxBytes: 10 * MB },
  "audio/mpeg": { ext: "mp3", maxBytes: 50 * MB },
  "audio/wav": { ext: "wav", maxBytes: 50 * MB },
  "audio/ogg": { ext: "ogg", maxBytes: 50 * MB },
  "audio/mp4": { ext: "m4a", maxBytes: 50 * MB },
  "video/mp4": { ext: "mp4", maxBytes: 500 * MB },
  "video/webm": { ext: "webm", maxBytes: 500 * MB },
  "video/quicktime": { ext: "mov", maxBytes: 500 * MB },
};
