# Doc-home

A project asset app built for the Sync Technologies take-home. Add external links, upload/view JPEG/PNG photos, and upload/play MP4 videos with resumable chunks and asynchronous verification. All three asset types use soft deletion. PostgreSQL stores metadata and upload state; local S3Mock stores originals and temporary parts.

**Stack:** Next.js / React / Panda CSS, NestJS, TypeORM / PostgreSQL, AWS SDK / Adobe S3Mock. Application and test code use TypeScript.

**Delivery status:** increments 1–6 are implemented. Links, Photos and Videos work in the project view, including video upload recovery, progress/finalizing status, native playback and shared soft deletion. The remaining [increment 7](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md#seven-commit-boundaries) is final cross-boundary delivery verification and documentation. [Asset contracts](docs/ASSET_CONTRACTS.md) record the chosen protocol and limitations. The old unregistered combined migration/DTO drafts are preserved locally, not release code.

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
| Web | `http://localhost:3000` | Project assets page; `/api/*` forwards to NestJS |
| API | `http://localhost:3001` | REST endpoints; `/health` checks SQL and bucket access |
| PostgreSQL | `localhost:5432` | Project and shared asset metadata |
| S3Mock | `http://localhost:9090` | Original files and temporary chunks; bucket `doc-home-assets` |

The API reads `apps/api/.env`; the [example](apps/api/.env.example) matches Compose and contains local-only credentials. If you change the API port, set `API_INTERNAL_URL` for the web process too. A custom bucket name must also match Compose's initial bucket configuration. For production builds, set `API_INTERNAL_URL` during both `next build` and `next start`: the `/api` rewrite target is compiled at build time.

Docker runs only storage services. Use `pnpm dev:web` or `pnpm dev:api` to run one application. `docker compose down` retains the named volumes; **adding `-v` deletes the database and stored files**. S3Mock is a development emulator and does not enforce AWS IAM.

### Quick walkthrough

1. Open the app and check the project context, Links, Photos and Videos sections.
2. Click **+ Add link**, enter an HTTP/HTTPS URL and an optional name, then **Add link**. An omitted name displays the full URL; each link opens in a new tab.
3. Choose a real JPG/PNG up to 5 MiB (a screenshot works) and click **Upload photo**. HEIC, WebP, GIF and PDF are not supported.
4. Check the preview and use **View** to open the original in a new tab.
5. Reload to check persistence, then **Delete** a link or photo and confirm its name. Deletion hides the asset while retaining its metadata and any original file.
6. Click **+ Add video**, choose an MP4 up to 20 MiB and upload. File checking has no fake percentage; acknowledged chunks drive progress. At 100%, wait for **Finalizing** and then the published native player. Hide upload closes the controls while retaining the task; **Cancel upload** explicitly ends incomplete work.
7. After interruption/reload, use **Resume upload**, select the original file and resume. The API status and whole-file hash are checked before sending missing chunks. A status/network error stops polling and requires **Check upload status**. A failed/expired/canceled upload requires a new session; **Dismiss upload** clears the saved recovery ID.
8. Play, pause, seek and delete a video using the inline confirmation. There is no autoplay or generated poster. READY confirms storage availability, not universal browser codec support.
9. Try an invalid URL or file; check that the error is visible and the existing list remains.

## Project structure

```text
apps/web/    Next.js project page, links/photo/video components, request helpers and Panda theme
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
| GET | `/projects/:projectId/assets` | 200: project summary and mixed link/photo/video list |
| POST | `/projects/:projectId/links` | 201: created LinkAsset |
| DELETE | `/projects/:projectId/assets/:assetId` | 204: shared soft deletion |
| GET | `/projects/:projectId/assets/:assetId/content` | 200: photo original/resize or MP4; video Range 206/416; link/deleted assets return 404 |
| GET | `/projects/:projectId/photos` | 200: project summary and photo list, newest first |
| POST | `/projects/:projectId/photos` | 201: uploaded photo metadata |
| GET | `/projects/:projectId/photos/:photoId/content` | 200: original or resized image bytes |
| DELETE | `/projects/:projectId/photos/:photoId` | 204: soft-deleted; no response body |

Demo project ID: `39f7c890-a5aa-4a74-8a3a-7fba28ac58b6`.

**Response contract:** list returns `{ project: { id, name, address }, photos: Photo[] }`. Upload returns one `Photo` with `id`, `originalName`, `mimeType`, `sizeBytes` and an ISO `createdAt`. Internal storage keys are omitted.

**Mixed assets:** `{ project: { id, name, address }, assets: Asset[] }`, newest first with ID as a stable tiebreaker. Common fields are `id`, `projectId`, `type`, `name` and ISO `createdAt`. Links add `url`; photos/videos add `mimeType`, `sizeBytes` and API-relative `contentUrl` (prefix `/api` in the browser). Storage keys and deletion markers are private. The legacy photo endpoints and DTOs remain compatible; their service reads/writes the common tables.

**Links:** POST JSON `{ "url": "https://example.com/Survey?Key=Value#Part", "name": "Site survey" }`. URL is trimmed, parsed, normalized and limited to 2048 characters; allow only absolute HTTP/HTTPS without credentials. Optional trimmed name is at most 120 characters; blank falls back to the full URL. Unknown fields are rejected. Duplicate URLs are allowed. No page fetching, metadata scraping or object-store operation occurs. Creation writes Asset and LinkDetail in one SQL transaction. Pending actions are disabled; uncertain outcomes require list reconciliation before another write.

**Upload:** exactly one multipart field named `file`, no additional fields. Accepts nonempty JPEG/PNG content up to and including **5 MiB**. The picker and browser validation give early feedback; the API detects the content type rather than trusting the filename or declared MIME. UTF-8 filenames are preserved; names must contain 1–255 characters after trimming, without control characters.

```bash
curl -F 'file=@/absolute/path/to/photo.png' \
  http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos
```

### Shared soft deletion

DELETE atomically sets `deleted_at` only while it is null. The photo-only DELETE alias rejects link/video IDs. Repeating a valid same-project request, including concurrent requests, returns 204 without replacing the first deletion time. Missing/wrong-project IDs return 404. No object-store call is required for deletion.

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
| 404 | Project/asset/session not found, wrong-project access or missing stored file |
| 409 | Conflicting part bytes, incomplete completion or invalid upload state |
| 410 | Completing a soft-deleted video (`ASSET_DELETED`) |
| 413 | Actual photo upload or video part exceeds 5 MiB |
| 415 | Unsupported photo content or video-part request content type |
| 416 | Unsatisfiable or multiple video byte ranges |
| 429 | Upload/part receiving capacity busy; Retry-After header |
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
| API Jest | 12 suites / 157 cases passed; 32 opt-in integration cases are skipped by the ordinary unit command |
| Web Jest + React Testing Library | 3 suites / 31 cases passed: photo/link interactions plus video validation, progress, recovery, bounded concurrency, playback errors and deletion reconciliation |
| PostgreSQL + S3Mock integration | 32 cases passed via `pnpm --filter api test:integration` (20 existing assets + 12 video scenarios): photo metadata/tombstone migration and alias compatibility; retained S3 bytes; named/unnamed links; invalid/forged input; transactional rollback; typed/shared soft deletion; guarded downgrade/reapply; video parts/races/expiry/admission, restart, retry, publication uncertainty, Range, no resurrection and real sample-byte equality |
| Typecheck and lint | Both applications passed locally |
| API production build | Passed (`pnpm --filter api build`) |
| Web production build | Passed with the installed Webpack fallback (`NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack`); default Turbopack previously hit this executor's local-port restriction, so the project default is unchanged |
| Current browser checks | Installed Chrome, real production builds at temporary loopback ports 33500/33501: original over-limit rejection; local 15s H.264/AAC upload, finalizing, play/pause/seek, same-origin Range, refresh recovery, injected failed PUT and missing-chunk resume, wrong-file rejection, inline video deletion/content 404, cancel without publication, 390px/320px overflow checks; no page errors or framework overlay. Console resource failures corresponded to deliberately aborted PUTs during interruption/cancel testing; no JavaScript page errors were observed. |
| Earlier links checks | Named/unnamed links, invalid scheme, uncertain-result reconciliation, reload persistence, safe external-link attributes and long URL layouts were recorded in increment 3. That run's native link/photo delete confirmation stalled automation; component/API deletion tests passed. |
| Earlier baseline checks | Clean cached install/migration/seed/startup and Chrome at 1440/834/390/320 widths were recorded before this increment; not rerun as soft-delete browser checks |

The asset integration suite runs the real Nest HTTP routes, PostgreSQL migrations/queries and S3Mock bytes. It is not a browser E2E suite or real AWS verification. Cross-browser, full accessibility and high concurrency are not verified. Application restart recovery is covered by the real API integration tests; Chrome reload/reselection recovery is covered by the local browser check. External destinations were not fetched during browser checks.

### Repeatable asset integration check

```bash
pnpm --filter api test:integration
```

Requires a running local Docker engine, Bash/curl and the existing local `postgres:17-alpine` and `adobe/s3mock:5.2.3` images. The script never pulls images. It creates dedicated disposable containers on random loopback ports without user volumes, waits for readiness, runs the opt-in Jest suite, then removes only its own containers and their temporary anonymous volumes, including on failure. It does not migrate/reset the normal Compose database or use its bucket.

Ordinary unit CI does not start Docker and skips these 32 cases. The integration test requires both `PHOTO_INTEGRATION_DATABASE_URL` and `PHOTO_INTEGRATION_S3_ENDPOINT`; the script supplies them. If running the Jest file directly, use only an empty disposable local database named `doc_home_soft_delete*` and a dedicated local S3Mock bucket `doc-home-soft-delete-test`: the suite deliberately exercises migration rollback on its fixtures. The runner is `apps/api/test/run-assets-integration.sh`; it does not install dependencies.

[GitHub Actions](.github/workflows/ci.yml) runs typecheck, lint, Jest and build on branch pushes and PRs into `main`. App-only changes select that app; public photo/link/video contracts, shared/root configuration and lockfile changes select both. Docs-only changes skip application jobs. New branches, manual runs and unavailable comparison history check both.

PR selection uses the **whole PR diff**, so a frontend-only follow-up can still run both apps. Push and PR events may each produce a run; superseded runs of the same event/branch are cancelled. CI uses Node 24, the pinned pnpm version, frozen installs and a pnpm-store cache. It does not start storage services or deploy. Confirm the hosted result in Actions/PR checks before submission; manual runs become available once the workflow exists on the default branch.

[Current mobile link layout with a long URL](docs/images/links-mobile.png) is from the isolated browser test project, separate from the illustrative Figma frames and earlier photo screenshots.

## Database changes

Use `pnpm --filter api migration:show`, `migration:run` and `seed`. These commands build first and load the API environment file. Schema synchronization and automatic startup migrations are disabled.

For a new schema change, update the Entity, add/register a new migration with reviewed `up`/`down` SQL, and check it on disposable data. Apply pending migrations before starting an existing installation; startup does not apply them automatically. The common-model migration transactionally copies all active/deleted photo metadata into `assets`/`file_details`, preserving IDs, timestamps, deletion markers and object keys, then removes the legacy writable `photos` table. No S3 object is moved or removed. Its downgrade preserves photo tombstones but refuses when any link record (including soft-deleted links) exists or metadata cannot fit the legacy schema. The earlier soft-delete downgrade still refuses to remove a marker while deleted photos exist. These guards use table locks and are not restore endpoints. `migration:revert` undoes the last migration; reverting the initial migration **drops both business tables**.

## Deliberate limits

The implemented scope is one seeded project with Links, Photos, Videos and soft deletion. Documents, custom fields, authentication, pagination and cloud deployment remain outside the selected expansion. Link editing, batch creation, automatic deduplication and site reachability/preview fetching are also deferred. Project association checks are **not user authorization**.

Uploads and deletes are not automatically retried. The UI waits for confirmed success and requires list reconciliation when a result is uncertain. SQL and object storage do not share a transaction. A metadata-save error retains the uploaded file and logs IDs for reconciliation, because the transaction may already have committed. Soft deletion deliberately retains originals; there is no completed-original purge job. Terminal temporary chunks have retryable cleanup. Failed upload metadata saves can still leave orphan objects for manual reconciliation. Content-signature validation is not full decoding or malware scanning. See the [scope document](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) for design choices and next steps.

### Increment 4 verification (historical checkpoint)

`pnpm --filter api test`: 154 passed, 24 opt-in integration cases skipped. `pnpm --filter api test:integration`: 20 existing asset cases and 4 video protocol cases passed against disposable PostgreSQL/S3Mock. The video cases cover out-of-order/idempotent/conflicting parts, exact progress, application restart, project isolation, cancel/complete races, expiry, admission and actual receive size. Parts do not publish playable assets in this increment.

### Video backend (increment 5)

- `POST /projects/:projectId/uploads`: JSON `{ fileName, fileSizeBytes, mimeType: "video/mp4", expectedSha256 }`; maximum 20 MiB. Returns an upload ID and fixed 5 MiB chunk size.
- `PUT /projects/:projectId/uploads/:uploadId/parts/:partNumber`: zero-based exact-sized `application/octet-stream` body, 201 first confirmation / 200 identical retry. GET the session after an uncertain response; conflicting bytes return 409.
- `GET /projects/:projectId/uploads/:uploadId`: persisted state, acknowledged parts/bytes, percent, expiry, file identity, optional active asset/error. No storage keys.
- `POST .../:uploadId/complete`: requires all parts, persists PROCESSING and returns 202; READY retries return 200. A soft-deleted original returns 410 `ASSET_DELETED`, retaining its unique association.
- `DELETE .../:uploadId`: cancels incomplete work; processing/ready cannot be canceled. Incomplete sessions expire after 24 hours. Terminal temporary parts are cleaned with persisted retryable manifests.
- Common asset content supports MP4 200 / single-range 206 / invalid or multiple-range 416. Native browser decoding is separate from READY storage availability. Soft deletion retains the original bytes.

One API/worker instance only: four active/reserved sessions, four receiving parts, one bounded-buffer merge. A 160 MiB logical reservation budget includes terminal sessions until temporary cleanup succeeds, not completed original storage. It is not a free-space guarantee. Persistent scans recover queued work and expired attempts after restart. Attempts use a 60-second deadline, at most two tries and a two-second transient retry delay; storage operations have their existing 10-second bound. SQL publication rechecks the attempt/deadline under lock; a lost commit reply never triggers deletion of a potentially referenced original. Orphan object inventory/sweeping, multi-instance leases and production queues remain deferred. The process must settle an in-flight storage operation before retrying; a watchdog cannot guarantee recovery from an infrastructure deadlock.

Verified: 157 API unit cases; 20 existing + 12 video integration cases against disposable PostgreSQL/S3Mock, including actual local 15-second H.264/AAC 1280×720 MP4 (about 14 MiB), exact stored-byte equality, Range, tombstone/no-resurrection, restart, retry exhaustion, cleanup outage and lost commit acknowledgement. Repeat with `VIDEO_TEST_FILE=/absolute/path/to/sample.mp4 pnpm --filter api test:integration`; no media is committed. No normal user database was migrated. API typecheck/lint/build passed. Browser playback evidence was added in increment 6 below.

### Video UI verification (increment 6)

The flow tested was project assets → MP4 selection → hash/check → confirmed chunks → finalization → native player → refresh/recovery/delete. Components use existing Panda tokens and buttons. The picker uses the same 44px-button pattern as photos; upload state is independent of opening/closing the controls. Recovery storage contains only a version and upload ID under a project-scoped key, not file bytes.

Local browser validation used installed Playwright 1.64.1 with installed Google Chrome, because the Browser plugin is absent and the package's matching bundled browser revision was unavailable. No package/browser was installed. Verified at 1440×1000, 390×844 and 320×844. Screenshots/logs and private test media remain outside Git. The user-authorized Downloads original was about 23 MB and correctly rejected by the 20 MiB cap; a local 15-second copy (14,187,243 bytes, H.264/AAC, 1280×720) was used for successful upload/playback. The original file was preserved.

Current checks: `pnpm typecheck`, `pnpm lint`, API Jest (157), web Jest/RTL (31), disposable PostgreSQL/S3Mock integration (32, including `VIDEO_TEST_FILE`), API build and Webpack production build passed. No hosted CI, AWS, deployment or push is claimed. Remaining acceptance work is final cross-boundary regression evidence, portrait-video verification and delivery packaging in increment 7; no portrait sample was tested here.

### Follow-up review

Review of increments 4–6 fixed missing-session recovery (a confirmed GET 404 now clears its recovery ID), logged the identity of uncertain part writes, and read upload state/manifests under the same session lock. The integration suite now exercises a genuinely in-flight part racing cancellation, simultaneous duplicate PUTs, and an uncertain storage write. Current review checks: 157 API unit cases, 32 web component cases and 35 disposable integration cases passed; typecheck, lint and API build passed. The original three feature commits remain unchanged; fixes are a separate local commit. Browser delivery regression is the next increment.
