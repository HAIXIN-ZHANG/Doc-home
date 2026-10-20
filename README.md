# Doc-home

A project links-and-photos app built for the Sync Technologies take-home. Open a seeded project, add external references, upload a JPG/PNG, view it and soft-delete either asset type. PostgreSQL stores shared metadata; local S3Mock stores original photo bytes.

**Stack:** Next.js / React / Panda CSS, NestJS, TypeORM / PostgreSQL, AWS SDK / Adobe S3Mock. Application and test code use TypeScript.

**Delivery status:** increments 1–5 are implemented: scope/contracts, photo soft deletion, and the shared asset model with a complete Links workflow. Video session creation, raw 5 MiB parts, persisted status, cancel/expiry and bounded admission are implemented. Durable video finalization, checksum/container validation, publication, Range reads and soft deletion are implemented. Video UI remains planned in the remaining [delivery increments](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md#seven-commit-boundaries). [Asset contracts](docs/ASSET_CONTRACTS.md) distinguish that target from current APIs; uncommitted video drafts are not delivered features.

## Run locally

Requirements: Node.js >=24, pnpm 10.24.0 and Docker. Run from the repository root; copy the environment file on first setup only.

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait db object-storage
pnpm --filter api migration:run
pnpm --filter api seed
pnpm dev
```

Open **http://localhost:3000**. The seed creates one project, without photos; rerunning it preserves existing records and edits. No AWS account is needed.

| Service | Address | Purpose |
| --- | --- | --- |
| Web | `http://localhost:3000` | Photo page; `/api/*` forwards to NestJS |
| API | `http://localhost:3001` | REST endpoints; `/health` checks SQL and bucket access |
| PostgreSQL | `localhost:5432` | Project and shared asset metadata |
| S3Mock | `http://localhost:9090` | Original file bytes; bucket `doc-home-assets` |

The API reads `apps/api/.env`; the [example](apps/api/.env.example) matches Compose and contains local-only credentials. If you change the API port, set `API_INTERNAL_URL` for the web process too. A custom bucket name must also match Compose's initial bucket configuration. For production builds, set `API_INTERNAL_URL` during both `next build` and `next start`: the `/api` rewrite target is compiled at build time.

Docker runs only storage services. Use `pnpm dev:web` or `pnpm dev:api` to run one application. `docker compose down` retains the named volumes; **adding `-v` deletes the database and stored files**. S3Mock is a development emulator and does not enforce AWS IAM.

### Quick walkthrough

1. Open the app and check the project context, Links and Photos sections.
2. Click **+ Add link**, enter an HTTP/HTTPS URL and an optional name, then **Add link**. An omitted name displays the full URL; each link opens in a new tab.
3. Choose a real JPG/PNG up to 5 MiB (a screenshot works) and click **Upload photo**. HEIC, WebP, GIF and PDF are not supported.
4. Check the preview and use **View** to open the original in a new tab.
5. Reload to check persistence, then **Delete** a link or photo and confirm its name. Deletion hides the asset while retaining its metadata and any original file.
6. Try an invalid URL or file; check that the error is visible and the existing list remains.

## Project structure

```text
apps/web/    Next.js project page, links/photo components, request helpers and Panda theme
apps/api/    NestJS features, validation, persistence, storage and unit tests
docs/        Delivery scope, product direction and design references
compose.yaml
```

Web and API are separate applications in one pnpm workspace. PostgreSQL stores metadata and generated object keys; S3Mock stores file bytes. The API owns validation and storage access.

- [Delivery scope and trade-offs](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md)
- [Target mixed-asset data and API contracts](docs/ASSET_CONTRACTS.md)
- [Future product direction](docs/PRODUCT_BLUEPRINT.md)
- [Figma and design previews](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md#design-reference)
- [Design and implementation screenshots: desktop, tablet and mobile](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md#baseline-photo-screenshots)

## HTTP API

Use `http://localhost:3001` directly, or prefix these paths with `/api` through the web app. All route IDs must be UUIDs.

| Method | Path | Success |
| --- | --- | --- |
| GET | `/projects/:projectId/assets` | 200: project summary and mixed photo/link list |
| POST | `/projects/:projectId/links` | 201: created LinkAsset |
| DELETE | `/projects/:projectId/assets/:assetId` | 204: shared soft deletion |
| GET | `/projects/:projectId/assets/:assetId/content` | 200: photo original/resize; link/deleted assets return 404 |
| GET | `/projects/:projectId/photos` | 200: project summary and photo list, newest first |
| POST | `/projects/:projectId/photos` | 201: uploaded photo metadata |
| GET | `/projects/:projectId/photos/:photoId/content` | 200: original or resized image bytes |
| DELETE | `/projects/:projectId/photos/:photoId` | 204: soft-deleted; no response body |

Demo project ID: `39f7c890-a5aa-4a74-8a3a-7fba28ac58b6`.

**Response contract:** list returns `{ project: { id, name, address }, photos: Photo[] }`. Upload returns one `Photo` with `id`, `originalName`, `mimeType`, `sizeBytes` and an ISO `createdAt`. Internal storage keys are omitted.

**Mixed assets:** `{ project: { id, name, address }, assets: Asset[] }`, newest first with ID as a stable tiebreaker. Common fields are `id`, `projectId`, `type`, `name` and ISO `createdAt`. Links add `url`; photos add `mimeType`, `sizeBytes` and API-relative `contentUrl` (prefix `/api` in the browser). Storage keys and deletion markers are private. The legacy photo endpoints and DTOs remain compatible; their service reads/writes the common tables.

**Links:** POST JSON `{ "url": "https://example.com/Survey?Key=Value#Part", "name": "Site survey" }`. URL is trimmed, parsed, normalized and limited to 2048 characters; allow only absolute HTTP/HTTPS without credentials. Optional trimmed name is at most 120 characters; blank falls back to the full URL. Unknown fields are rejected. Duplicate URLs are allowed. No page fetching, metadata scraping or object-store operation occurs. Creation writes Asset and LinkDetail in one SQL transaction. Pending actions are disabled; uncertain outcomes require list reconciliation before another write.

**Upload:** exactly one multipart field named `file`, no additional fields. Accepts nonempty JPEG/PNG content up to and including **5 MiB**. The picker and browser validation give early feedback; the API detects the content type rather than trusting the filename or declared MIME. UTF-8 filenames are preserved; names must contain 1–255 characters after trimming, without control characters.

```bash
curl -F 'file=@/absolute/path/to/photo.png' \
  http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos
```

### Shared soft deletion

DELETE atomically sets `deleted_at` only while it is null. The photo-only DELETE alias rejects link IDs. Repeating a valid same-project request, including concurrent requests, returns 204 without replacing the first deletion time. Missing/wrong-project IDs return 404. No object-store call is required for deletion.

Normal lists, originals and resized content queries exclude deleted rows; new content requests return 404. The SQL row, original object key and exact stored bytes remain. Already downloaded bytes cannot be recalled. There is no restore/Undo API, automatic purge or retention-period promise in this increment; retained originals continue to use space.

### Optional image resizing

Add `w` and/or `h` to the **content GET**, not the upload. Values are maximum dimensions in pixels, using positive decimal integers from **1–2048**.

For a 1200 × 800 source:

| Content URL suffix | Result |
| --- | --- |
| `/content` | Original bytes unchanged |
| `/content?w=300` | 300 × 200 |
| `/content?h=300` | 450 × 300 |
| `/content?w=300&h=300` | 300 × 200, fitting inside the box |

Resizing preserves proportions, applies EXIF orientation and does not crop or enlarge. Both output axes are capped at 2048, even if only one parameter is supplied. Resized output keeps JPEG/PNG format and strips source metadata. Sharp limits input to 40 million pixels and processing to five seconds; this is not a whole-request deadline. Images use `Cache-Control: no-store`; variants are not cached or stored.

### Errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid ID, link URL/name/unknown fields, multipart input, filename or resize parameters |
| 404 | Project/photo not found, wrong-project photo or missing stored file |
| 413 | Upload exceeds 5 MiB |
| 415 | Content is not JPEG/PNG |
| 500 | Unexpected failure; public message is sanitized |

Responses include `X-Request-Id`; error bodies include `requestId` for correlation with console logs. A valid empty project returns 200 with `photos: []`. Storage attempts fail after five seconds, with a ten-second budget across retries and response-body reads; these limits do not cover SQL or the whole API request. A write timeout does not prove the remote write failed.

## Checks and CI

```bash
pnpm typecheck
pnpm lint
pnpm --filter api test
pnpm --filter web test
pnpm build
```

Unit/component tests need no Docker or `.env`. Optional coverage commands are `pnpm --filter api test:coverage` and `pnpm --filter web test:coverage`; reports go to each app's ignored `coverage/` directory.

| Verification | Evidence for this increment |
| --- | --- |
| API Jest | 11 suites / 141 cases passed; 20 opt-in integration cases are skipped by the ordinary unit command |
| Web Jest + React Testing Library | 2 suites / 19 cases passed: existing photo interactions and link validation/create/pending/error/reconciliation/delete states |
| PostgreSQL + S3Mock integration | 20 cases passed via `pnpm --filter api test:integration`: photo metadata/tombstone migration and alias compatibility; retained S3 bytes; named/unnamed links; invalid/forged input; transactional rollback; typed/shared soft deletion; guarded downgrade/reapply |
| Typecheck and lint | Both applications passed locally |
| API production build | Passed (`pnpm --filter api build`) |
| Web production build | Passed with the installed Webpack fallback (`NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack`); default Turbopack previously hit this executor's local-port restriction, so the project default is unchanged |
| Current browser checks | Real Webpack production page: create named/unnamed links, invalid scheme feedback, uncertain-result reconciliation, reload persistence and external-link attributes; long URL at 390px/320px had no horizontal overflow. Native delete confirmation stalled the browser automation and was not counted as a browser pass; deletion is covered by component/API tests |
| Earlier baseline checks | Clean cached install/migration/seed/startup and Chrome at 1440/834/390/320 widths were recorded before this increment; not rerun as soft-delete browser checks |

The asset integration suite runs the real Nest HTTP routes, PostgreSQL migrations/queries and S3Mock bytes. It is not a browser E2E suite or real AWS verification. Cross-browser, full accessibility, high concurrency and process-restart persistence were not reverified. External destinations were not fetched during browser checks.

### Repeatable asset integration check

```bash
pnpm --filter api test:integration
```

Requires a running local Docker engine, Bash/curl and the existing local `postgres:17-alpine` and `adobe/s3mock:5.2.3` images. The script never pulls images. It creates dedicated disposable containers on random loopback ports without user volumes, waits for readiness, runs the opt-in Jest suite, then removes only its own containers and their temporary anonymous volumes, including on failure. It does not migrate/reset the normal Compose database or use its bucket.

Ordinary unit CI does not start Docker and skips these twenty cases. The integration test requires both `PHOTO_INTEGRATION_DATABASE_URL` and `PHOTO_INTEGRATION_S3_ENDPOINT`; the script supplies them. If running the Jest file directly, use only an empty disposable local database named `doc_home_soft_delete*` and a dedicated local S3Mock bucket `doc-home-soft-delete-test`: the suite deliberately exercises migration rollback on its fixtures. The runner is `apps/api/test/run-assets-integration.sh`; it does not install dependencies.

[GitHub Actions](.github/workflows/ci.yml) runs typecheck, lint, Jest and build on branch pushes and PRs into `main`. App-only changes select that app; public photo DTOs, shared/root configuration and lockfile changes select both. Docs-only changes skip application jobs. New branches, manual runs and unavailable comparison history check both.

PR selection uses the **whole PR diff**, so a frontend-only follow-up can still run both apps. Push and PR events may each produce a run; superseded runs of the same event/branch are cancelled. CI uses Node 24, the pinned pnpm version, frozen installs and a pnpm-store cache. It does not start storage services or deploy. Confirm the hosted result in Actions/PR checks before submission; manual runs become available once the workflow exists on the default branch.

[Current mobile link layout with a long URL](docs/images/links-mobile.png) is from the isolated browser test project, separate from the illustrative Figma frames and earlier photo screenshots.

## Database changes

Use `pnpm --filter api migration:show`, `migration:run` and `seed`. These commands build first and load the API environment file. Schema synchronization and automatic startup migrations are disabled.

For a new schema change, update the Entity, add/register a new migration with reviewed `up`/`down` SQL, and check it on disposable data. Apply pending migrations before starting an existing installation; startup does not apply them automatically. The common-model migration transactionally copies all active/deleted photo metadata into `assets`/`file_details`, preserving IDs, timestamps, deletion markers and object keys, then removes the legacy writable `photos` table. No S3 object is moved or removed. Its downgrade preserves photo tombstones but refuses when any link record (including soft-deleted links) exists or metadata cannot fit the legacy schema. The earlier soft-delete downgrade still refuses to remove a marker while deleted photos exist. These guards use table locks and are not restore endpoints. `migration:revert` undoes the last migration; reverting the initial migration **drops both business tables**.

## Deliberate limits

The implemented scope is one seeded project with Links, Photos and soft deletion. Videos remain planned, not delivered by this increment. Documents, custom fields, authentication, pagination and cloud deployment remain outside the selected expansion. Link editing, batch creation, automatic deduplication and site reachability/preview fetching are also deferred. Project association checks are **not user authorization**.

Uploads and deletes are not automatically retried. The UI waits for confirmed success and requires list reconciliation when a result is uncertain. SQL and object storage do not share a transaction. A metadata-save error retains the uploaded file and logs IDs for reconciliation, because the transaction may already have committed. Soft deletion deliberately retains originals; there is no deletion cleanup or purge job. Failed upload metadata saves can still leave orphan objects for manual reconciliation. Content-signature validation is not full decoding or malware scanning. See the [scope document](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) for design choices and next steps.

### Increment 4 verification

`pnpm --filter api test`: 154 passed, 24 opt-in integration cases skipped. `pnpm --filter api test:integration`: 20 existing asset cases and 4 video protocol cases passed against disposable PostgreSQL/S3Mock. The video cases cover out-of-order/idempotent/conflicting parts, exact progress, application restart, project isolation, cancel/complete races, expiry, admission and actual receive size. Parts do not publish playable assets in this increment.

### Video backend (increment 5)

- `POST /projects/:projectId/uploads`: JSON `{ fileName, fileSizeBytes, mimeType: "video/mp4", expectedSha256 }`; maximum 20 MiB. Returns an upload ID and fixed 5 MiB chunk size.
- `PUT /projects/:projectId/uploads/:uploadId/parts/:partNumber`: zero-based exact-sized `application/octet-stream` body, 201 first confirmation / 200 identical retry. GET the session after an uncertain response; conflicting bytes return 409.
- `GET /projects/:projectId/uploads/:uploadId`: persisted state, acknowledged parts/bytes, percent, expiry, file identity, optional active asset/error. No storage keys.
- `POST .../:uploadId/complete`: requires all parts, persists PROCESSING and returns 202; READY retries return 200. A soft-deleted original returns 410 `ASSET_DELETED`, retaining its unique association.
- `DELETE .../:uploadId`: cancels incomplete work; processing/ready cannot be canceled. Incomplete sessions expire after 24 hours. Terminal temporary parts are cleaned with persisted retryable manifests.
- Common asset content supports MP4 200 / single-range 206 / invalid or multiple-range 416. Native browser decoding is separate from READY storage availability. Soft deletion retains the original bytes.

One API/worker instance only: four active/reserved sessions, four receiving parts, one bounded-buffer merge. A 160 MiB logical reservation budget includes terminal sessions until temporary cleanup succeeds, not completed original storage. It is not a free-space guarantee. Persistent scans recover queued work and expired attempts after restart. Attempts use a 60-second deadline, at most two tries and a two-second transient retry delay; storage operations have their existing 10-second bound. SQL publication rechecks the attempt/deadline under lock; a lost commit reply never triggers deletion of a potentially referenced original. Orphan object inventory/sweeping, multi-instance leases and production queues remain deferred. The process must settle an in-flight storage operation before retrying; a watchdog cannot guarantee recovery from an infrastructure deadlock.

Verified: 157 API unit cases; 20 existing + 12 video integration cases against disposable PostgreSQL/S3Mock, including actual local 15-second H.264/AAC 1280×720 MP4 (about 14 MiB), exact stored-byte equality, Range, tombstone/no-resurrection, restart, retry exhaustion, cleanup outage and lost commit acknowledgement. Repeat with `VIDEO_TEST_FILE=/absolute/path/to/sample.mp4 pnpm --filter api test:integration`; no media is committed. No normal user database was migrated. API typecheck/lint/build passed. Browser playback is not yet claimed by this backend increment.
