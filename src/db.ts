import pg from "pg";
import { config } from "./config.ts";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

pg.types.setTypeParser(pg.types.builtins.INT8, Number); // size_bytes fits in a JS number

export type MediaStatus = "pending" | "ready";

export interface MediaRow {
  id: string;
  storage_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  status: MediaStatus;
  created_at: Date;
  uploaded_at: Date | null;
}

export async function insertPending(row: {
  id: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<MediaRow> {
  const { rows } = await pool.query<MediaRow>(
    `INSERT INTO media (id, storage_key, original_filename, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [row.id, row.storageKey, row.originalFilename, row.contentType, row.sizeBytes],
  );
  return rows[0];
}

export async function findById(id: string): Promise<MediaRow | undefined> {
  const { rows } = await pool.query<MediaRow>(`SELECT * FROM media WHERE id = $1`, [id]);
  return rows[0];
}

export async function markReady(id: string): Promise<MediaRow | undefined> {
  const { rows } = await pool.query<MediaRow>(
    `UPDATE media SET status = 'ready', uploaded_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id],
  );
  return rows[0];
}

export async function listReady(limit = 100): Promise<MediaRow[]> {
  const { rows } = await pool.query<MediaRow>(
    `SELECT * FROM media WHERE status = 'ready' ORDER BY uploaded_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function deleteById(id: string): Promise<void> {
  await pool.query(`DELETE FROM media WHERE id = $1`, [id]);
}
