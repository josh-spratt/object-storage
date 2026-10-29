// The database and the object store can't share a transaction, so they can
// drift apart. Run this periodically (cron, scheduled job) to fix both kinds
// of drift:
//   1. Rows stuck in 'pending' because the client never finished the upload.
//   2. Objects with no row, e.g. the server crashed partway through a request.
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { config } from "../src/config.ts";
import { pool } from "../src/db.ts";
import { deleteObject, s3Client } from "../src/storage.ts";

// Well past the upload URL's expiry, so nothing in flight gets removed.
const GRACE_MS = 60 * 60 * 1000;
const cutoff = new Date(Date.now() - GRACE_MS);

// 1. Stale pending uploads. The client may have uploaded the object without
//    calling /complete, so delete the object as well as the row.
const { rows: stale } = await pool.query<{ id: string; storage_key: string }>(
  `SELECT id, storage_key FROM media WHERE status = 'pending' AND created_at < $1`,
  [cutoff],
);
for (const row of stale) {
  await deleteObject(row.storage_key);
  await pool.query(`DELETE FROM media WHERE id = $1`, [row.id]);
}
console.log(`Removed ${stale.length} stale pending upload(s)`);

// 2. Objects that no row points at.
let orphans = 0;
let ContinuationToken: string | undefined;
do {
  const page = await s3Client.send(
    new ListObjectsV2Command({ Bucket: config.s3.bucket, Prefix: "media/", ContinuationToken }),
  );
  const old = (page.Contents ?? []).filter((o) => o.Key && o.LastModified && o.LastModified < cutoff);
  if (old.length > 0) {
    const keys = old.map((o) => o.Key!);
    const { rows } = await pool.query<{ storage_key: string }>(
      `SELECT storage_key FROM media WHERE storage_key = ANY($1)`,
      [keys],
    );
    const known = new Set(rows.map((r) => r.storage_key));
    for (const key of keys) {
      if (!known.has(key)) {
        await deleteObject(key);
        orphans++;
      }
    }
  }
  ContinuationToken = page.NextContinuationToken;
} while (ContinuationToken);
console.log(`Removed ${orphans} orphaned object(s)`);

await pool.end();
