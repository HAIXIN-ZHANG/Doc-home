# Doc-home

Sync Technologies take-home exercise. Current status: application/theme and database foundations, plus project photo query, upload and file-read APIs, are implemented. All four photo endpoints are implemented; the business UI remains to be implemented.

## Structure

- `apps/web`: Next.js, React, TypeScript, Panda CSS and frontend configuration.
- `apps/api`: NestJS, TypeORM, PostgreSQL connection and backend configuration.
- Root: pnpm workspace, one lockfile, shared scripts and Docker Compose for PostgreSQL and local S3-compatible storage.

The frontend and API run separately on local ports and communicate through HTTP. Each app declares its own dependencies; install them together from the repository root. ESLint checks both apps; there is no separate Prettier or Oxlint setup.

## Local development

Use Node.js >=24, pnpm 10.24.0 and a running Docker engine. From the repository root:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait db object-storage
pnpm --filter api migration:run
pnpm --filter api seed
pnpm dev
```

Open `http://localhost:3000` for the framework page. `http://localhost:3001/health` checks the API, PostgreSQL and the configured storage bucket; `http://localhost:3000/api/health` checks the frontend rewrite.

The API loads `apps/api/.env`. The frontend forwards `/api/*` to `http://localhost:3001`. Use `pnpm dev:web` or `pnpm dev:api` to start one app. The API connects to S3Mock at `http://localhost:9090` with AWS SDK v3 and path-style requests. Compose creates the `doc-home-assets` bucket automatically. Files will be stored there; PostgreSQL will store their metadata and object keys. Photo query, upload and read endpoints are implemented; deletion is also implemented.

Docker runs PostgreSQL and Adobe S3Mock 5.2.3. Both ports are bound to localhost. Named volumes retain database records and object files; **`docker compose down -v` deletes both sets of data**. Keep the emulator version pinned: persistence across version changes is not guaranteed.

S3Mock is a local development/test emulator, not production object storage. It does not enforce AWS authentication/IAM or validate presigned URL signatures. The example S3 credentials are dummy SDK values; never put real AWS credentials into this local setup. For production, provision private object storage and validate permissions and behaviour against real S3.

The API validates environment variables on startup without printing their values. `PORT` defaults to 3001 and must be an integer from 1–65535. Database URL and S3 endpoint, region, bucket and credentials are required. This project accepts simple bucket names of 3–63 lowercase letters, digits or hyphens. If you change `S3_BUCKET`, update Compose's initial bucket name as well. If you change the API port, also set the web process's `API_INTERNAL_URL`, for example `API_INTERNAL_URL=http://localhost:3002 pnpm dev:web`.

Storage supports arbitrary bytes, including images and PDFs. The selected business slice remains JPG/PNG photo management; PDF upload/download is deferred.

## Database workflow

The API uses **TypeORM**, not Prisma. Entities describe the application model, migrations version the SQL schema, and seed data supplies the repeatable demo project. SQL stores metadata and object keys; S3Mock stores file content.

| Command from repository root | Purpose |
| --- | --- |
| `pnpm --filter api migration:show` | Show applied and pending migrations |
| `pnpm --filter api migration:run` | Apply pending migrations in a transaction |
| `pnpm --filter api seed` | Insert the demo project only if its stable ID is absent |
| `pnpm --filter api migration:revert` | Undo the latest migration; the initial rollback deletes both business tables, so use disposable data only |

Scripts compile TypeScript first, then use the compiled TypeORM CLI/data source. Node loads `apps/api/.env` without starting NestJS or requiring S3 configuration for these database commands. Nest and the CLI use the same database options and entity metadata; `synchronize` and automatic migration execution stay disabled. The health route checks connectivity, not migration/seed completeness.

Demo project ID: `39f7c890-a5aa-4a74-8a3a-7fba28ac58b6`, with illustrative name/address matching Figma. The future page URL is `/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos`; **the route is not implemented yet**. Re-running seed preserves edits and existing photos. Seed inserts no photo records because no actual photo objects are supplied. A fixture generator such as Faker is unnecessary for this single deterministic record.

For a later schema change: update the Entity, add a new timestamped migration with reviewed `up`/`down` SQL, register it in `database-options.ts`, validate it on disposable data and apply it explicitly. Do not rewrite an already-shared/applied migration. A rollback can lose data; it is not a substitute for backups or a safe production rollout plan. This exercise does not implement a production migration pipeline.

## Backend responsibilities

Organise code by feature (`projects`, `photos`) and infrastructure (`database`, `storage`), rather than putting every controller or entity in a global folder.

| Layer | Responsibility | Current state |
| --- | --- | --- |
| Module | Register dependencies and make intended providers available | Projects, Photos, Database and Storage modules exist |
| Controller | Route, HTTP boundary and delegation | Health and photo query controllers delegate to their services |
| DTO / pipes | HTTP shapes and incoming validation; never persistence entities as public responses | Photo response types, UUID pipe and content-based upload validation exist |
| Service | Business rules, ownership checks and multi-step orchestration | Photo service queries, uploads and compensates failed metadata saves |
| TypeORM Repository | Query and persist entities | Feature modules register repositories; no generic repository wrapper |
| Entity / database | Stored fields, relations, nullability, uniqueness and constraints | Project and Photo entities/migration exist |
| StorageService | Object-store access, separate from SQL and HTTP | Client, readiness, photo put/read and compensating delete exist |

The photo-to-project relation is required and uses `ON DELETE RESTRICT`: database cascades cannot delete S3 objects. A composite `(project_id, created_at, id)` index supports per-project stable ordering. Database constraints enforce positive sizes, nonblank labels/keys, unique storage keys and JPG/PNG metadata; request validation will still inspect actual file content. The 5 MiB request limit is an application policy, not a permanent SQL size constraint.

Data-foundation checks passed on a disposable database: fresh/repeated migration, Entity/schema agreement, repeated seed without overwriting edits/photos, invalid-record constraints, restricted project deletion, connection reinitialization, and rollback/reapply. The temporary database was removed. The local development database also received the migration and demo seed. These checks do not cover photo HTTP endpoints or UI; Jest unit tests now cover the four implemented photo handlers and related logic (see below).

## Query project photos

`GET /projects/:projectId/photos` (direct API), or `/api/projects/:projectId/photos` through Next.js.

```json
{
  "project": {
    "id": "39f7c890-a5aa-4a74-8a3a-7fba28ac58b6",
    "name": "Riverside House",
    "address": "24 Sample Street, Perth WA"
  },
  "photos": []
}
```

The seeded project starts without photos. Each photo returns `id`, `originalName`, `mimeType`, `sizeBytes` and an ISO `createdAt` string. Results are ordered by `createdAt DESC, id DESC`. Storage keys and persistence relations are omitted. Construct the content route from project/photo IDs; the response does not duplicate a URL tied to the web proxy prefix. No pagination or authentication is implemented.

| Status | Meaning |
| --- | --- |
| 200 | Project found; `photos: []` is a successful empty result |
| 400 | Invalid project UUID |
| 404 | Project not found |
| 500 | Unexpected failure; generic message, never a fabricated empty list |

Every HTTP response has an `X-Request-Id` header; error bodies also include `requestId`. A generated server ID correlates JSON console logs with the response. Completed requests log method, route template, status and duration. Unexpected errors log their type and stack locations without database messages/SQL parameters. Expected 4xx responses are warnings, not internal-error stacks. Request bodies, query strings and credentials are not logged. These are local logs, not durable error monitoring, metrics or distributed tracing; aborted requests are not recorded by the completion logger.

Example error: `{"statusCode":404,"message":"Project not found","error":"Not Found","requestId":"<server-generated UUID>"}`.

## Upload a project photo

`POST /projects/:projectId/photos`, with exactly one `multipart/form-data` file field named `file`. No additional form fields are accepted. Success returns 201 and the same public photo shape used by the list API.

```bash
curl -i -F 'file=@/absolute/path/to/photo.png' \
  http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos
```

- Accepts nonempty JPEG/PNG content, up to and including **5 MiB** (application policy).
- Uses Nest's content-signature validator, disables MIME fallback and uses the detected MIME type for storage/metadata. A renamed text file is rejected; a genuine PNG with a different declared MIME type is accepted as PNG. This is signature detection, not full image decoding or malware scanning.
- Filenames must contain 1–255 characters after trimming and no control characters. Filenames are display metadata; generated UUID-based keys prevent same-name overwrites.
- Missing/empty/extra/wrong-field files or invalid filenames/UUIDs return 400; absent project 404; oversize 413; unsupported content 415; unexpected storage/database failure 500. Multipart parser limits run before controller pipes, so when several inputs are invalid, the first detected error can vary.
- The API checks project existence, writes the original bytes, then saves metadata. A failed metadata save triggers best-effort object deletion. Cleanup failure is logged with the request ID and server-generated object key without replacing the original error. There is no shared SQL/S3 transaction, background reconciliation or upload idempotency. Process crashes, uncertain put/commit outcomes and failed cleanup remain limitations; do not blindly retry an ambiguous successful upload.
- Memory-buffered uploads keep this small flow simple; concurrent requests can still consume substantial memory. Large files/high concurrency require a different upload strategy.

## Delete a project photo

`DELETE /projects/:projectId/photos/:photoId` validates both UUIDs and the project/photo association. Success returns **204 with no body**. A missing/wrong-project photo returns 404; repeating a completed deletion may also return 404.

The record is deleted before the stored object. A database failure preserves the file and returns an error. If object cleanup fails after the row is deleted, the API logs the request ID and key but still returns 204: the photo is already absent from the list. An already-missing object counts as cleaned. This is best-effort cleanup, not guaranteed physical erasure; reconciliation is deferred.

```bash
curl -i -X DELETE 'http://localhost:3001/projects/<projectId>/photos/<photoId>'
```

Replace both IDs with the photo you intend to remove. Real local checks verified upload → query → read/resize → delete, SQL row and stored bytes removal, empty 204, repeated/wrong-project deletion 404, invalid UUID 400, and deletion when the file was already missing. Dedicated fixtures were cleaned up; existing data was preserved.

## View a project photo

`GET /projects/:projectId/photos/:photoId/content` returns image bytes. Optional **`w`** and **`h`** specify maximum width and height in pixels. They belong on the read request, not on upload. Only the original is stored. Through Next.js, prepend `/api`.

Replace both IDs with actual UUIDs (use a photo ID returned by upload/list):

```text
http://localhost:3001/projects/<projectId>/photos/<photoId>/content
http://localhost:3001/projects/<projectId>/photos/<photoId>/content?w=300
http://localhost:3001/projects/<projectId>/photos/<photoId>/content?h=300
http://localhost:3001/projects/<projectId>/photos/<photoId>/content?w=300&h=300
```

Open these URLs in a browser, or quote the full URL when using curl so `&` stays inside it.

For an original **1200 × 800** image:

| Request suffix | Result |
| --- | --- |
| `/content` | Original bytes, 1200 × 800 |
| `/content?w=300` | 300 × 200 |
| `/content?h=300` | 450 × 300 |
| `/content?w=300&h=300` | 300 × 200, fitting inside the requested box |

- Preserve aspect ratio, do not crop/stretch and do not enlarge small originals. Both parameters accept decimal positive integers from **1–2048**. Empty, repeated, fractional, negative, out-of-range or unknown parameters return 400.
- Both output axes are capped at 2048 even when one parameter is omitted. For an extreme aspect ratio, that global cap can produce a smaller result than the supplied dimension suggests. These are maximum bounds, not guaranteed exact sizes.
- No parameters returns the original bytes unchanged, including existing metadata. Resized responses use Sharp 0.35.5, apply EXIF orientation, keep JPEG/PNG format and omit source metadata using Sharp's default output behaviour. Animated sources use the default first-frame processing; this is a photo endpoint, not animation processing.
- Resizing limits input decoding to **40 million pixels** and sets a **5-second Sharp processing timeout**. The read is bounded to 5 MiB before any 200 response, so object-stream errors can still become normal HTTP errors. The timeout is not a whole-request deadline, and concurrent operations can still exhaust resources.
- Invalid IDs return 400; absent photo, wrong-project photo or missing stored bytes return 404. Missing bytes are logged with requestId. Unexpected storage failures, invalid stored image data or processing-limit failures return a generic 500, without exposing internal errors.
- Success returns the image Content-Type, Content-Length, inline disposition, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`. There is no ETag/CDN/transform cache. On-demand processing saves variant storage but adds per-request CPU/latency and does not guarantee a smaller file.

The metadata/file association is checked by both IDs, but authentication and project access control are still out of scope.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter api test
```

Framework checks completed with Node 24.14.1: lint (zero warnings), typecheck and both production builds; homepage and direct/proxied readiness returned 200. AWS SDK put/get/delete worked against S3Mock, and a probe object survived a restart of the pinned container. Invalid ports, URL protocols and missing storage credentials were rejected. These are foundation checks, not photo-feature test coverage.

The [photo scope plan](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) defines the current tasks and acceptance criteria. The [product direction](docs/PRODUCT_BLUEPRINT.md) describes future possibilities. Final decisions and verification evidence will be consolidated in the README and PR after implementation.

### Photo query verification

The compiled API was started on a temporary local port and checked against PostgreSQL: seeded project and empty/populated lists (200), malformed UUID (400), missing project (404), project isolation, descending date/ID ordering, public response fields and ISO timestamps. Request IDs, JSON access logs, route templates, status, duration and warning levels were checked. Dedicated temporary records were removed; existing project/photo records were preserved.

An isolated Nest HTTP server reused the actual controller, service, middleware and filter with failing repository substitutes. Both project-query and photo-query failures returned a generic 500 with matching response/header request IDs. Error diagnostics were logged, and a sensitive-message sentinel was absent from logs/responses. This is simulated failure coverage, not a live database-outage test. The temporary verification script is outside this repository; automated Jest unit tests are described below. The Next.js proxy and UI were not exercised in this query check.

### Upload verification

The upload unit cases now run with Jest and TypeScript. They cover content validation, inclusive size limits, filenames, write ordering, same-name independence, missing project, failed object upload, failed metadata save and failed compensation logging/original-error preservation. The previous `.test.mjs` file and Node-runner command have been removed.

A separate temporary HTTP check started the real compiled API against local PostgreSQL/S3Mock. It verified 201, detected MIME type, stored object bytes/content type, generated keys, duplicate filenames, exact 5 MiB acceptance, query visibility, and rejection of missing/empty/multiple/unexpected file/form fields, long filenames, invalid UUID, missing project, oversized data and disguised text. Dedicated test records and objects were removed. Fault compensation was covered by the unit tests, not by disrupting the real database/storage. The UI is not implemented; read/resize verification is recorded below.

### Photo read verification

Actual HTTP checks against local PostgreSQL/S3Mock verified byte-identical originals, PNG/JPEG content types, width-only/height-only/box resizing, no enlargement, the global output cap, EXIF orientation and response headers. Invalid/repeated/unknown parameters and bad UUIDs returned 400; wrong association, missing record and missing object returned 404; corrupt stored-image resizing returned a sanitized 500. Missing-object and 500 logs were checked. Dedicated temporary records/objects were removed, and the temporary API process was stopped.

The earlier runtime check was outside the repository. Automated Jest unit tests now cover query/upload/read as documented below. The pixel and processing-time guards are implemented but were not stress-tested. Frontend component and browser-flow coverage will follow the UI, using React Testing Library and Playwright respectively.

## Backend unit tests

All tests and the Jest configuration are TypeScript. Specs live beside the code as `*.spec.ts`; `test/photo-fixtures.ts` contains shared test data and small HTTP doubles. Unit tests do not load `.env`, bootstrap `AppModule`, start HTTP listeners or contact PostgreSQL/S3. No Docker is needed.

| Command from repository root | Purpose |
| --- | --- |
| `pnpm --filter api test` | Run the backend Jest unit suite |
| `pnpm --filter api test:unit` | Explicit unit-test command |
| `pnpm --filter api test:watch` | Re-run affected tests while editing |
| `pnpm --filter api test:coverage` | Generate coverage in `apps/api/coverage` |

`jest.config.ts` uses ts-jest to transform source TypeScript as ESM, with Nest decorator metadata retained. Jest's documented `--experimental-vm-modules` flag is included in scripts; Node may print an experimental warning. Explicit `.js` relative imports are mapped back to TypeScript sources during tests. Production compilation still excludes specs. ESLint and typecheck include tests and configuration, not just application code.

| Unit area | What is checked |
| --- | --- |
| PhotosController | Delegation for all four endpoint handlers, request ID forwarding, image headers and error propagation |
| PhotosService — query | Public fields, project existence, empty results, requested sort order, and propagation of query failures |
| PhotosService — upload | Generated keys, same-name independence, write ordering, failures and compensating cleanup |
| PhotosService — delete | Association, conditional deletion, database-before-file order, database failure preservation, concurrent missing row and cleanup-error logging |
| PhotosService — read | Association query, original byte identity, missing bytes/logging, proportional resize, no enlargement, output cap, JPEG/PNG, EXIF and corrupt input |
| PhotoUploadPipe / PhotoSizeQueryDto | Missing/empty/unsupported content, MIME detection, filenames, inclusive byte limit, optional dimensions and invalid/repeated/unknown query values |
| StorageService | AWS command inputs, exact byte bound, missing object vs operational failure, incomplete/empty/oversized streams and cleanup |
| HTTP filter / middleware | Safe error bodies, request correlation, log levels, no sensitive-message leakage and no duplicate responses |
| Environment / health | Required values, safe configuration errors, port/bucket/protocol rules and dependency readiness |

The current suite has **9 suites and 118 passing cases**, including parameterized validation cases. Nest testing providers replace repository/storage I/O, and `aws-sdk-client-mock` intercepts SDK commands. Resize tests use real Sharp on small generated images, without object storage. These tests do not exercise full HTTP route/interceptor wiring, SQL constraints or real IAM; retain the separate runtime checks for those boundaries.

Coverage is collected for the listed photo/storage/HTTP/config/health implementation files, excluding specs, module wiring, entity declarations and type-only response DTOs. The coverage command reports this selected scope; it is not whole-repository or end-to-end coverage. Input-pixel/processing-time stress, high concurrency and UI tests remain outside this suite.

## Manual backend walkthrough

**Backend status:** query, upload, image read/resize and deletion are implemented and checked against local PostgreSQL/S3Mock. The selected backend feature loop is complete; the frontend is still pending.

After the initial `.env`/migration/seed setup described above, use a terminal in the repository root:

```bash
docker compose up -d --wait db object-storage
pnpm dev:api
```

Leave that terminal running. In a second terminal, check readiness and query the demo project:

```bash
curl -i http://localhost:3001/health
curl -i http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos
```

Both should return 200. A successful empty `photos` array is valid. Upload a real local PNG/JPEG, replacing the sample file path:

```bash
curl -i -F 'file=@/absolute/path/to/photo.png' \
  http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos
```

Expect 201 and a photo `id`. Query again to see it. Replace `<photoId>` in these URLs with that returned ID and open in a browser:

```text
http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos/<photoId>/content
http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos/<photoId>/content?w=300
http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos/<photoId>/content?h=300
http://localhost:3001/projects/39f7c890-a5aa-4a74-8a3a-7fba28ac58b6/photos/<photoId>/content?w=300&h=300
```

Try `w=0` for 400, or `/projects/not-a-uuid/photos` for 400. Match `X-Request-Id` with API console logs. To check persistence, stop **only the API** with Ctrl+C, run `pnpm dev:api` again and revisit the same photo/list. Do not remove volumes or stop shared services just to demonstrate an error. To remove only the photo you uploaded, call `DELETE` with that same project/photo ID. Success returns 204 with an empty body; repeated deletion returns 404.

**Latest recheck:** Jest 9 suites/118 cases, API typecheck/lint/build and migration status passed. Real PostgreSQL/S3Mock checks passed for upload → query → original/resize read, API-process restart persistence, input/file errors, association/missing-object responses, sanitized corrupt-image 500 and logs. Dedicated check data was cleaned up. Storage containers were left running, so this does not claim a new storage-container restart or a fresh-environment installation check. No new HTTP test suite was committed; the repeatable unit suite remains Jest.

## Design reference

[Figma — editable photo management design](https://www.figma.com/design/8C3K9vrJg9zXlVye9ist7t/Doc-home-%C2%B7-Photo-management?node-id=3-5)

The [responsive photo-page design](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md#design-reference--completed-implementation-pending) includes the editable Figma link, two UI states, three viewport layouts and exported previews. The business UI is not implemented yet. The same change includes the Panda presets, semantic color tokens, shared text styles, self-hosted Inter font and reusable Button. Breakpoints are named `mobile` (0rem), `tablet` (48rem) and `desktop` (64rem). Photo components and the grid remain feature work.

Theme foundation checks passed: lint, typecheck and both production builds. The production homepage, generated CSS and self-hosted font were served successfully. Responsive photo-page behaviour remains to be implemented and verified.
