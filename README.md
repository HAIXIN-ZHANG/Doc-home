# Doc-home

A small project workspace for the Sync Technologies take-home: save external links, upload/view JPEG/PNG photos, and upload/play MP4 videos. All three asset types support soft deletion. Video uploads resume from confirmed chunks and are published only after asynchronous verification.

**Stack:** Next.js / React / Panda CSS, NestJS, TypeORM / PostgreSQL, AWS SDK / local Adobe S3Mock. Source and tests use TypeScript. No cloud account is required.

## Start locally

Requirements: Node.js >=24, pnpm 10.24.0 and Docker. From the repository root:

```bash
pnpm install --frozen-lockfile
# First setup only; keep an existing local environment file.
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
docker compose up -d --wait db object-storage
pnpm --filter api migration:run
pnpm --filter api seed
pnpm dev
```

Open **http://localhost:3000**. The stable demo project is **Riverside House**, ID `39f7c890-a5aa-4a74-8a3a-7fba28ac58b6`. Seeding adds a missing project without overwriting edits or existing assets. Run `pnpm dev:web` or `pnpm dev:api` for one app.

### Configuration

| Setting | Read by / when | Local default or source |
| --- | --- | --- |
| `DATABASE_URL` | API and migration/seed CLI | `apps/api/.env`; matches Compose's PostgreSQL credentials |
| `PORT` | API startup | `3001` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | API startup | `http://localhost:9090`, `us-east-1`, `doc-home-assets` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | API startup | Local-only example values in [`.env.example`](apps/api/.env.example) |
| `API_INTERNAL_URL` | Next.js server and rewrite build | `http://localhost:3001` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Docker Compose | Shell/root Compose environment; defaults are in [compose.yaml](compose.yaml) |

Compose does **not** read `apps/api/.env`. If changing PostgreSQL credentials, update the Compose settings and API `DATABASE_URL` together. A custom bucket must match Compose's initial bucket setting. Set `API_INTERNAL_URL` at both build and start when using another API origin: Next's `/api` rewrite is compiled at build time.

| Service | Local address | Purpose |
| --- | --- | --- |
| Web | `http://localhost:3000` | Project UI; same-origin `/api/*` proxy |
| API | `http://localhost:3001` | Validation, persistence, private file access; `/health` checks SQL and bucket connectivity |
| PostgreSQL | `localhost:5432` | Projects, assets, upload sessions and part manifests |
| S3Mock | `http://localhost:9090` | Original files and temporary parts |

Docker runs storage only; web/API run with pnpm. `docker compose down` retains named volumes; **`down -v` deletes database and file data**. Schema synchronization/startup migrations are disabled. Apply pending migrations before starting an existing installation; `migration:revert` undoes one migration and may be refused to protect retained data. S3Mock does not enforce AWS IAM.

## Try the workflows

- **Links:** add an HTTP/HTTPS URL with an optional name. Blank names display the complete URL. Links open safely in a new tab; the API does not fetch the destination.
- **Photos:** choose a real JPEG/PNG up to 5 MiB, upload, view the original, then reload. Optional content query parameters `w`/`h` resize proportionally without enlarging; each is 1–2048 pixels.
- **Videos:** choose an MP4 up to 20 MiB. File hashing precedes upload. Confirmed chunks drive progress; 100% transfer is followed by Finalizing, then a published native player. Keep the original file for refresh/reselect/hash-verified resume.
- **Recovery:** hiding upload controls keeps the task. Cancel ends sessions that have not entered processing; processing cannot be canceled. Uncertain network results require a status/list check before retry; a confirmed missing session allows a new upload.
- **Deletion:** confirm deletion of any type. The card disappears after server confirmation; original files and metadata remain. New reads reject deleted assets. There is no restore/Undo action in this scope.

The native player supports play/pause/seek, no autoplay and portrait/landscape containment. READY confirms publication, not compatibility with every MP4 codec.

## Running app screenshots

Full-page captures of the local development app with sample data, including Links, Photos and Videos. These show rendered layouts, not additional functional-test results.

| Desktop · 1440px | Tablet · 834px | Mobile · 390px |
| --- | --- | --- |
| [Full screenshot](docs/images/mixed-assets-desktop.jpg) | [Full screenshot](docs/images/mixed-assets-tablet.jpg) | [Full screenshot](docs/images/mixed-assets-mobile.jpg) |

## Read the code

```text
apps/web/src/
  components/ui/         Button, TextInput, AssetSection, InlineFeedback
  features/project-assets/  Project composition, initial server read, page/query/layout
  features/links/         Link parsing, requests and creation/list UI
  features/photos/        Compatible photo upload/query/card behavior
  features/videos/        Upload protocol, response parsing, recovery hook, task and player
  lib/validation.ts      Small runtime guards shared by feature parsers
apps/web/panda.config.ts  Design tokens, semantic roles, typography and control recipes
apps/api/src/
  assets/                Shared asset model, typed responses, mixed reads and soft deletion
  photos/                Existing image validation, upload and bounded read-time resizing
  videos/                Upload sessions/manifests, request limits and durable finalizer
  storage/               S3 byte transport; no media or publication business rules
  database/              Explicit entities, immutable migrations and repeatable seed
  http/                  Request IDs/logging and sanitized error responses
```

Start with [Architecture and UI foundations](docs/ARCHITECTURE.md), then [asset contracts](docs/ASSET_CONTRACTS.md) for data/API/lifecycle details. [Delivery verification](docs/DELIVERY_VERIFICATION.md) separates unit, emulator and real-browser evidence. The [delivery plan](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) records the seven original commit boundaries; [product blueprint](docs/PRODUCT_BLUEPRINT.md) is future direction.

The public page URL remains `/projects/:projectId/photos` for compatibility; its component/module names describe the mixed-asset view. No new `common` framework, base repository or shared contracts package is needed.

## HTTP API

Use API port 3001 directly, or prefix paths with `/api` through the web app. IDs are UUIDs; project association is checked on every operation. Project association checks are not user authorization; authentication is outside this scope.

| Method / path | Behavior |
| --- | --- |
| `GET /projects/:projectId/assets` | Active mixed list, newest first; explicit link/photo/video types |
| `POST /projects/:projectId/links` | JSON `{ url, name? }`; validates absolute HTTP/HTTPS without credentials; 201 after atomic persistence |
| `DELETE /projects/:projectId/assets/:assetId` | Idempotent soft deletion; 204, first deletion time retained |
| `GET /projects/:projectId/assets/:assetId/content` | Photo original/resize or MP4; video single-range 206 / unsatisfiable or multiple range 416; links/deleted assets 404 |
| `GET/POST /projects/:projectId/photos` | Compatible photo list and one multipart `file` upload |
| `GET /projects/:projectId/photos/:photoId/content` | Compatible original/resized content |
| `DELETE /projects/:projectId/photos/:photoId` | Photo-only soft-delete alias |
| `POST /projects/:projectId/uploads` | JSON file name/size/MIME/whole-file SHA-256; 201 persisted session |
| `PUT /projects/:projectId/uploads/:uploadId/parts/:partNumber` | Raw `application/octet-stream`; zero-based 5 MiB parts, final part uses the exact remainder; 201 first confirmation / 200 identical retry while accepting parts |
| `GET /projects/:projectId/uploads/:uploadId` | Persisted status, confirmed parts/bytes, expiry, active asset or processing error |
| `POST /projects/:projectId/uploads/:uploadId/complete` | 202 processing / 200 already ready / 410 `ASSET_DELETED` |
| `DELETE /projects/:projectId/uploads/:uploadId` | Cancel a pre-processing session; processing/ready conflict with 409 |

Mixed responses contain public metadata and API-relative content URLs, never storage keys or deletion markers. Photo DTOs retain `originalName`; shared assets use `name`. Errors include `requestId`, also returned as `X-Request-Id`. Validation/conflicts use 400/409, actual byte excess 413, unsupported request/media 415 and busy upload capacity 429 with Retry-After. Unexpected failures are sanitized. Exact DTOs, status codes, limits and migration rollback guards are in [asset contracts](docs/ASSET_CONTRACTS.md).

## Check the project

```bash
pnpm typecheck
pnpm lint
pnpm --filter api test
pnpm --filter web test
pnpm build
```

Unit/component checks need no Docker or environment file. The recorded local web production build uses `pnpm --filter web exec next build --webpack` because this executor previously restricted Turbopack's port binding; CI retains the normal build. Coverage reports are optional (`test:coverage` in each app) and ignored by Git.

For real PostgreSQL/S3Mock checks, have Docker and the existing `postgres:17-alpine` / `adobe/s3mock:5.2.3` images available:

```bash
VIDEO_TEST_FILE=/absolute/sample.mp4 pnpm --filter api test:integration
```

For full browser checks, also have Google Chrome and two local MP4s (each ≤20 MiB, landscape >5 MiB to exercise multiple parts):

```bash
VIDEO_TEST_FILE=/absolute/landscape.mp4 \
PORTRAIT_VIDEO_TEST_FILE=/absolute/portrait.mp4 \
pnpm test:e2e
```

Both runners create disposable storage, preserve normal volumes and remove only their own containers. E2E builds/starts both apps, creates PNG/JPEG fixtures and prints an external screenshot/log directory. Input videos and generated test artifacts stay outside Git; selected documentation screenshots are committed separately. Neither runner installs dependencies or pulls images. Test ports default to 33500/33501; override `E2E_WEB_PORT`/`E2E_API_PORT` if occupied.

[GitHub Actions](.github/workflows/ci.yml) selects web/API checks from the changed paths, then typechecks, lints, tests and builds. Public contract/root changes select both apps. Docs-only push diffs skip app jobs; pull requests compare the full branch against their base, so this feature PR still runs both apps. Storage integration/browser checks are opt-in locally, not hosted CI jobs. See the pull request checks for hosted CI status and [executed evidence](docs/DELIVERY_VERIFICATION.md) for local integration/browser results. No cloud deployment is included.

## Deliberate limits

One API/worker instance, 20 MiB MP4, bounded in-memory assembly and finite MP4 container checks. No auth, malware scanning, transcoding, HLS/DASH/CDN, generated poster, restore UI, completed-original purge or full orphan-object sweeper. Temporary cleanup retries; uncertain SQL/storage outcomes retain potentially referenced bytes and log identifiers. These are assessment boundaries, not production guarantees.
