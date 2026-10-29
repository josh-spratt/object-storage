# Storing media the right way: object storage + Postgres

A small, working example of how real apps store images, audio and video:

- **The file itself** goes into object storage (Amazon S3 in production; here a local S3-compatible server called [SeaweedFS](https://github.com/seaweedfs/seaweedfs)).
- **Information about the file** (name, type, size, and where it's stored) goes into a Postgres database.
- **Browsers upload and download files directly** from storage using short-lived signed links. The app server never handles the file's bytes.

Everything runs on your own computer. You don't need a cloud account.

The page includes a live **explorer** that shows the database table and the storage bucket side by side, so you can watch each step of an upload happen.

---

## 1. Install the tools you need

You need three things. If you already have one, check its version with the command shown and skip it if the version is new enough.

| Tool | What it's for | Check you have it |
| --- | --- | --- |
| **Git** | Downloading (cloning) this project | `git --version` |
| **Docker Desktop** | Runs Postgres and the storage server, so you don't install them yourself | `docker compose version` (needs v2 or newer) |
| **Node.js 24 or newer** | Runs the app | `node --version` (must print `v24` or higher) |

Run the check commands in a terminal: **Terminal** on macOS, **PowerShell** on Windows.

### macOS

1. **Homebrew** (a package manager that makes the rest easy). If `brew --version` doesn't work, install it with the one-line command at https://brew.sh, then follow the "Next steps" it prints.
2. **Git:** `brew install git` (or run `xcode-select --install`).
3. **Node.js:** `brew install node`. Check that `node --version` prints v24 or newer.
4. **Docker Desktop:** `brew install --cask docker`, or download it from https://www.docker.com/products/docker-desktop/. Then **open Docker from your Applications folder** and wait until it says it's running. It must be open whenever you use this project.

### Windows

1. **Git:** download and install from https://git-scm.com/download/win. The default options are fine.
2. **Node.js:** download the **LTS** installer from https://nodejs.org and run it. The default options are fine.
3. **Docker Desktop:** download from https://www.docker.com/products/docker-desktop/ and install it. When it asks, leave **"Use WSL 2"** turned on. It may ask you to restart and to install WSL. Say yes and follow the prompts.
4. **Open Docker Desktop** from the Start menu and wait until it says it's running. It must be open whenever you use this project.
5. **Close and reopen PowerShell** so it picks up the new tools, then run the check commands above.

### Linux

- **Git and Node.js:** Git from your package manager (`sudo apt install git`). For Node, use [nvm](https://github.com/nvm-sh/nvm), because distro packages are often too old: `nvm install 24`.
- **Docker:** [Docker Engine](https://docs.docker.com/engine/install/) plus the Compose plugin, or Docker Desktop. If `docker` needs `sudo`, follow the ["manage Docker as a non-root user"](https://docs.docker.com/engine/install/linux-postinstall/) steps.

> **Already use nvm or fnm?** There's an `.nvmrc` file, so `nvm use` (or `fnm use`) in the project folder picks the right version.

---

## 2. Get the project and run it

In a terminal:

```sh
git clone https://github.com/josh-spratt/object-storage.git
cd object-storage
npm install
npm run setup
npm run dev
```

What each step does:

| Command | What happens |
| --- | --- |
| `npm install` | Downloads the JavaScript libraries the app uses (into `node_modules/`). |
| `npm run setup` | Creates your `.env` settings file, starts Postgres and the storage server in Docker, and creates the storage bucket. The first run downloads the Docker images (a few hundred MB), so give it a minute. |
| `npm run dev` | Starts the app. Leave this terminal open. It prints `Listening on http://localhost:3000` when ready. |

Now open **http://localhost:3000** in your browser.

---

## 3. Try it

1. Click **Choose File** and pick an image, audio file or video. "Pause before each step" is on, so nothing happens yet except step 1 lighting up.
2. Read the explanation and click **Run this step →**. Keep an eye on:
   - the **Network** list, which shows each request. Blue **API** requests go to the app; orange **Storage** requests go straight to the storage server.
   - the **Postgres** table on the left and the **SeaweedFS bucket** on the right. Rows flash when they change.
3. Keep clicking through the four steps. Here's what you'll see:

   | After step | Database row | Bucket |
   | --- | --- | --- |
   | 1. Request upload | new row, `pending`, object `missing` | empty |
   | 2. Upload bytes | still `pending`, object "present, unverified" | the file appears |
   | 3. Verify + complete | `ready`, object `present` | linked to the row |
   | 4. View | the file shows up in the gallery | |

4. Click **Delete** on a gallery item and watch both the row and the object disappear.

Uncheck "Pause before each step" to upload at normal speed.

---

## 4. Day-to-day commands

| I want to… | Run |
| --- | --- |
| Stop the app | Press `Ctrl+C` in the terminal running `npm run dev` |
| Start again later | Open Docker Desktop, then run `docker compose up -d` and `npm run dev` |
| Stop Postgres and storage (keeps your data) | `docker compose down` |
| **Wipe everything** and start fresh | `docker compose down -v`, then `npm run setup` |
| Remove stale uploads and orphaned files | `npm run cleanup` |
| See the storage server's logs | `docker compose logs -f seaweedfs` |
| Look at the database directly | `docker compose exec postgres psql -U app -d media -c "select id, status, storage_key from media"` |
| Check the code for type errors | `npm run typecheck` |

---

## 5. Troubleshooting

**`Cannot connect to the Docker daemon` / `failed to connect to the docker API`**
Docker Desktop isn't running. Open it, wait until it says it's running, and try again.

**`port is already allocated` / `address already in use` (5432, 8333 or 3000)**
Something else on your computer is using that port. The usual culprit for 5432 is a Postgres you installed yourself.
- Stop the other program (for example `brew services stop postgresql`), **or**
- change the port. For Postgres, edit `docker-compose.yml` so it reads `"5433:5432"`, and in `.env` change `localhost:5432` to `localhost:5433`. For the app, change `PORT` in `.env`.

**`node: bad option: --env-file` or `SyntaxError` / `ERR_UNKNOWN_FILE_EXTENSION` mentioning `.ts`**
Your Node.js is too old. Run `node --version`, and install Node 24 or newer (see step 1). On Windows, reopen PowerShell after installing.

**`Can't reach object storage at http://localhost:8333`**
The storage container isn't up. Run `docker compose ps`, and if `seaweedfs` isn't running, check `docker compose logs seaweedfs`, then run `npm run setup` again.

**An upload fails with `Storage returned 403`**
The signed upload link expired (it lasts 5 minutes) while you were paused on step 2. Pick the file again.

**Something is in a weird state**
`docker compose down -v` and `npm run setup` give you a clean slate. This deletes all uploaded files and database rows.

---

## How it works

```
Browser                         API (Express)                Postgres         SeaweedFS (S3)
   │ POST /api/uploads              │                            │                  │
   │ {filename, contentType, size}─▶│ validate type + size       │                  │
   │                                │ INSERT status='pending' ──▶│                  │
   │◀── presigned PUT URL ──────────│                            │                  │
   │                                                                                │
   │ PUT <bytes> ──────────────────────────────────────────────────────────────────▶│
   │                                                                                │
   │ POST /api/uploads/:id/complete▶│ HEAD object ─────────────────────────────────▶│
   │                                │ size/type match?           │                  │
   │                                │ UPDATE status='ready' ────▶│                  │
   │◀── media + presigned GET URL ──│                            │                  │
```

A **presigned URL** is a link to one specific file in storage, with a cryptographic signature that grants permission for one action (upload or download) for a few minutes. The API creates the link, and the browser uses it to talk to storage directly. The storage credentials never leave the server.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/uploads` | Validate and reserve an upload; returns a presigned PUT URL |
| `POST` | `/api/uploads/:id/complete` | Verify the object exists and matches, then mark it `ready` (safe to retry) |
| `GET` | `/api/media` | List ready media, each with a fresh presigned GET URL |
| `GET` | `/api/media/:id` | One item |
| `DELETE` | `/api/media/:id` | Delete the object, then the row |
| `GET` | `/api/explorer/db`, `/api/explorer/storage` | Raw table rows and bucket listing for the explorer (only when `ENABLE_EXPLORER=true`) |

### Project layout

```
docker-compose.yml        Postgres + SeaweedFS
db/migrations/            SQL that creates the `media` table (runs automatically on first start)
seaweedfs/s3.json         Local storage credentials (dev only)
src/
  server.ts               Express app setup
  routes.ts               The upload flow, commented step by step
  storage.ts              S3 client, presigned URLs
  db.ts                   Database queries
  config.ts               Settings and the allowed file types and size limits
  explorer.ts             Dev-only endpoints behind the explorer panel
scripts/
  setup-bucket.ts         Creates the bucket + CORS rules (dev only)
  cleanup-orphans.ts      Fixes drift between the database and storage
  create-env.ts           Creates .env on first setup
public/index.html         The whole frontend (no build step)
```

The TypeScript runs directly in Node 24+, so there's no compile or build step.

### The practices this demonstrates

| Practice | Where |
| --- | --- |
| Store the **key**, never a full URL; mint URLs per request | `db/migrations/001_media.sql`, `toDto` in `src/routes.ts` |
| Server-generated, unguessable keys; the user's filename is display-only | `POST /uploads` in `src/routes.ts` |
| Allowlist of content types with per-type size limits | `allowedTypes` in `src/config.ts` |
| Content-Type and Content-Length are **signed** into the upload URL, so storage rejects anything else | `presignUpload` in `src/storage.ts` |
| Don't trust the client's "done": `HEAD` the object and check it | `POST /uploads/:id/complete` |
| `pending` → `ready` status so half-finished uploads are never shown | schema + routes |
| Private bucket; short-lived presigned GET URLs (range requests work, so video seeking works) | `presignDownload` |
| Separate internal and public S3 endpoints (the host is part of the signature) | `src/storage.ts`, `.env.example` |
| A job that cleans up drift between the DB and storage in both directions | `scripts/cleanup-orphans.ts` |
| Buckets are infrastructure, not created by the app at runtime | `scripts/setup-bucket.ts` (dev only) |

### Gotcha worth knowing

AWS SDK v3 (Jan 2025 and later) adds a CRC32 of an *empty* body to presigned PUT URLs by default, and every real upload then fails with `BadDigest`. The fix is `requestChecksumCalculation: "WHEN_REQUIRED"` on the client that does the signing. This happens with real AWS S3 too, not only local stores.

## Going to production

Swap the env vars. The code doesn't change:

```sh
S3_REGION=us-east-1
S3_BUCKET=my-app-media
# Leave S3_ENDPOINT / S3_PUBLIC_ENDPOINT unset for AWS. Use an IAM role, not static keys.
S3_FORCE_PATH_STYLE=false
ENABLE_EXPLORER=false
```

What this example leaves out on purpose:

- **Auth and ownership.** Add an `owner_id` column and check it on every route.
- **CDN.** Put CloudFront or Cloudflare in front, with signed cookies or URLs for private media.
- **Processing.** Thumbnails, metadata extraction (dimensions, duration) and video transcoding to HLS/DASH belong in a background worker triggered after `complete` (or by an S3 event notification).
- **Large files.** Above roughly 100 MB, use multipart uploads (`CreateMultipartUpload` with presigned part URLs) so uploads can resume.
- **Content sniffing.** The declared Content-Type is enforced, but the worker should also check the file's real type (magic bytes) before trusting it.
- **Scheduling.** Run `npm run cleanup` on a schedule, and add a bucket lifecycle rule as a backstop.
