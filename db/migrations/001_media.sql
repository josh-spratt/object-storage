-- The database stores metadata and a pointer (storage_key) to the object.
-- The bytes themselves live in object storage.
CREATE TABLE media (
  id                uuid PRIMARY KEY,
  storage_key       text NOT NULL UNIQUE,        -- object key, NOT a full URL
  original_filename text NOT NULL,               -- display only, never used as a key
  content_type      text NOT NULL,
  size_bytes        bigint NOT NULL CHECK (size_bytes > 0),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'ready')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  uploaded_at       timestamptz
);

-- Supports the orphan-cleanup job, which looks for stale pending uploads.
CREATE INDEX media_pending_created_at_idx ON media (created_at) WHERE status = 'pending';
