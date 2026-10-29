import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { allowedTypes, config } from "./config.ts";
import * as db from "./db.ts";
import * as storage from "./storage.ts";

export const router = Router();

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idParam(req: Request): string {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) throw new HttpError(404, "Not found");
  return id;
}

async function toDto(row: db.MediaRow) {
  return {
    id: row.id,
    filename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    uploadedAt: row.uploaded_at,
    // URLs are minted per request and expire. Never store them in the DB.
    url: row.status === "ready" ? await storage.presignDownload(row.storage_key, row.original_filename) : null,
  };
}

/**
 * Step 1: the client describes the file. We validate it, reserve a row in
 * 'pending' state and hand back a presigned URL for a direct upload to the
 * object store. The file's bytes never pass through this server.
 */
router.post("/uploads", async (req, res) => {
  const { filename, contentType, sizeBytes } = req.body ?? {};

  if (typeof filename !== "string" || filename.length === 0 || filename.length > 255) {
    throw new HttpError(400, "filename must be a non-empty string of at most 255 characters");
  }
  const rule = allowedTypes[contentType];
  if (!rule) {
    throw new HttpError(415, `Unsupported content type. Allowed: ${Object.keys(allowedTypes).join(", ")}`);
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new HttpError(400, "sizeBytes must be a positive integer");
  }
  if (sizeBytes > rule.maxBytes) {
    throw new HttpError(413, `File too large; the limit for ${contentType} is ${rule.maxBytes} bytes`);
  }

  // Server-generated, unguessable key. Partitioned by date so listings and
  // lifecycle rules stay manageable. The user's filename is never part of it.
  const id = randomUUID();
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const storageKey = `media/${now.getUTCFullYear()}/${month}/${id}.${rule.ext}`;

  await db.insertPending({ id, storageKey, originalFilename: filename, contentType, sizeBytes });
  const uploadUrl = await storage.presignUpload(storageKey, contentType, sizeBytes);

  res.status(201).json({
    id,
    upload: {
      method: "PUT",
      url: uploadUrl,
      // The client must send exactly these headers; they are part of the signature.
      headers: { "Content-Type": contentType },
      expiresInSeconds: config.uploadUrlTtlSeconds,
    },
  });
});

/**
 * Step 2: the client says the upload finished. Don't trust it: check the
 * object really exists and matches what was declared before marking it ready.
 */
router.post("/uploads/:id/complete", async (req, res) => {
  const id = idParam(req);
  const row = await db.findById(id);
  if (!row) throw new HttpError(404, "Not found");
  if (row.status === "ready") {
    res.json(await toDto(row)); // idempotent: safe for clients to retry
    return;
  }

  const object = await storage.headObject(row.storage_key);
  if (!object) throw new HttpError(409, "Upload not found in storage yet");

  if (object.sizeBytes !== row.size_bytes || object.contentType !== row.content_type) {
    await storage.deleteObject(row.storage_key);
    await db.deleteById(id);
    throw new HttpError(422, "Uploaded object does not match the declared size or content type");
  }

  const ready = (await db.markReady(id)) ?? (await db.findById(id));
  res.json(await toDto(ready!));
});

router.get("/media", async (_req, res) => {
  const rows = await db.listReady();
  res.json(await Promise.all(rows.map(toDto)));
});

router.get("/media/:id", async (req, res) => {
  const row = await db.findById(idParam(req));
  if (!row || row.status !== "ready") throw new HttpError(404, "Not found");
  res.json(await toDto(row));
});

router.delete("/media/:id", async (req, res) => {
  const row = await db.findById(idParam(req));
  if (!row) throw new HttpError(404, "Not found");
  // Object first, then row. If the row delete fails, retrying is safe because
  // S3 deletes are idempotent. The other order could leave an object nothing
  // points at.
  await storage.deleteObject(row.storage_key);
  await db.deleteById(row.id);
  res.status(204).end();
});
