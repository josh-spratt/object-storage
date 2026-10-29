// Read-only views of the raw database table and bucket contents, for the
// explorer panel in the UI. Teaching aid only: this exposes internals
// (storage keys, pending rows), so it is mounted only when ENABLE_EXPLORER=true.
import { Router } from "express";
import { config } from "./config.ts";
import { pool, type MediaRow } from "./db.ts";
import { listObjects } from "./storage.ts";

export const explorerRouter = Router();

explorerRouter.get("/db", async (_req, res) => {
  const { rows } = await pool.query<MediaRow>(
    `SELECT * FROM media ORDER BY created_at DESC LIMIT 200`,
  );
  res.json({ table: "media", rows });
});

explorerRouter.get("/storage", async (_req, res) => {
  res.json({ bucket: config.s3.bucket, objects: await listObjects("media/") });
});
