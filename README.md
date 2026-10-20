# Doc-home

A project photo-management app built for the Sync Technologies take-home. Open a seeded project, upload a JPG/PNG, view the original and delete it. Photos persist in PostgreSQL and local object storage.

**Stack:** Next.js / React / Panda CSS, NestJS, TypeORM / PostgreSQL, AWS SDK / Adobe S3Mock. Application and test code use TypeScript.

**Delivery status:** the committed implementation is the photo workflow described below. The approved next scope adds Links, Videos and soft deletion in [seven increments](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md#seven-commit-boundaries). Their [target data and API contracts](docs/ASSET_CONTRACTS.md) are design commitments, not currently available endpoints. Documentation of planned behavior does not validate any uncommitted implementation drafts.

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
| PostgreSQL | `localhost:5432` | Project and photo metadata |
| S3Mock | `http://localhost:9090` | Original file bytes; bucket `doc-home-assets` |

The API reads `apps/api/.env`; the [example](apps/api/.env.example) matches Compose and contains local-only credentials. If you change the API port, set `API_INTERNAL_URL` for the web process too. A custom bucket name must also match Compose's initial bucket configuration.

Docker runs only storage services. Use `pnpm dev:web` or `pnpm dev:api` to run one application. `docker compose down` retains the named volumes; **adding `-v` deletes the database and stored files**. S3Mock is a development emulator and does not enforce AWS IAM.

### Quick walkthrough

1. Open the app and check the project name/address and photo count.
2. Choose a real JPG/PNG up to 5 MiB (a screenshot works) and click **Upload photo**. HEIC, WebP, GIF and PDF are not supported.
3. Check the preview and use **View** to open the original in a new tab.
4. Reload to check persistence, then **Delete** and confirm the filename.
5. Try an invalid file; check that the error is visible and the existing list remains.

## Project structure

```text
apps/web/    Next.js page, photo components, request helpers and Panda theme
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
| GET | `/projects/:projectId/photos` | 200: project summary and photo list, newest first |
| POST | `/projects/:projectId/photos` | 201: uploaded photo metadata |
| GET | `/projects/:projectId/photos/:photoId/content` | 200: original or resized image bytes |
| DELETE | `/projects/:projectId/photos/:photoId` | 204: no response body |

Demo project ID: `39f7c890-a5aa-4a74-8a3a-7fba28ac58b6`.

**Response contract:** list returns `{ project: { id, name, address }, photos: Photo[] }`. Upload returns one `Photo` with `id`, `originalName`, `mimeType`, `sizeBytes` and an ISO `createdAt`. Internal storage keys are omitted.

**Upload:** exactly one multipart field named `file`, no additional fields. Accepts nonempty JPEG/PNG content up to and including **5 MiB**. The picker and browser validation give early feedback; the API detects the content type rather than trusting the filename or declared MIME. UTF-8 filenames are preserved; names must contain 1–255 characters after trimming, without control characters.

```bash
curl -F 'file=@/absolute/path/to/photo.png' \
  http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos
```

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
| 400 | Invalid ID, multipart input, filename or resize parameters |
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

| Photo-baseline verification (recorded previously; not rerun for this docs increment) | Recorded result |
| --- | --- |
| API Jest | 9 suites / 121 cases: handlers, service rules, validation, storage boundaries, errors/logging, configuration and health |
| Web Jest + React Testing Library | 1 suite / 9 cases: mutation coordination, validation and failure/recovery states |
| Typecheck, lint and production builds | Both applications passed locally |
| Clean local setup | Frozen install from cached packages, new database migration/seed and `pnpm dev` passed in an isolated checkout/storage project |
| Real local API/browser checks | JPG/PNG upload, format/size rejection, read/resize, delete; persistence across app and storage-container recreation; Chrome at 1440/834/390/320 widths |

Runtime/browser checks used temporary scripts and isolated storage ports, not a committed integration/E2E suite. Repeated seed and container recreation preserved photo records and identical original bytes. Safari/Firefox, full accessibility, high concurrency and real AWS behaviour remain unverified.

[GitHub Actions](.github/workflows/ci.yml) runs typecheck, lint, Jest and build on branch pushes and PRs into `main`. App-only changes select that app; public photo DTOs, shared/root configuration and lockfile changes select both. Docs-only changes skip application jobs. New branches, manual runs and unavailable comparison history check both.

PR selection uses the **whole PR diff**, so a frontend-only follow-up can still run both apps. Push and PR events may each produce a run; superseded runs of the same event/branch are cancelled. CI uses Node 24, the pinned pnpm version, frozen installs and a pnpm-store cache. It does not start storage services or deploy. Confirm the hosted result in Actions/PR checks before submission; manual runs become available once the workflow exists on the default branch.

## Database changes

Use `pnpm --filter api migration:show`, `migration:run` and `seed`. These commands build first and load the API environment file. Schema synchronization and automatic startup migrations are disabled.

For a new schema change, update the Entity, add/register a new migration with reviewed `up`/`down` SQL, and check it on disposable data. `migration:revert` undoes the last migration; reverting the initial migration **drops both business tables**.

## Deliberate limits

The committed baseline is a photo-only demonstration with one seeded project. Links, videos and soft deletion are approved next increments, not delivered by this documentation change. Documents, custom fields, authentication, pagination and cloud deployment remain outside the selected expansion. Project association checks are **not user authorization**.

Uploads and deletes are not automatically retried. The UI waits for confirmed success and requires list reconciliation when a result is uncertain. SQL and object storage do not share a transaction. A metadata-save error retains the uploaded file and logs IDs for reconciliation, because the transaction may already have committed. Delete cleanup is best effort. Both paths can leave orphan files. Content-signature validation is not full decoding or malware scanning. See the [scope document](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) for design choices and next steps.
