# Doc-home

Sync Technologies take-home exercise. Current status: application/theme and database foundations are implemented. Photo upload, list, view and delete endpoints/UI are the next implementation steps.

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

The API loads `apps/api/.env`. The frontend forwards `/api/*` to `http://localhost:3001`. Use `pnpm dev:web` or `pnpm dev:api` to start one app. The API connects to S3Mock at `http://localhost:9090` with AWS SDK v3 and path-style requests. Compose creates the `doc-home-assets` bucket automatically. Files will be stored there; PostgreSQL will store their metadata and object keys. The photo endpoints are not implemented yet.

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
| Controller | Route, HTTP boundary and delegation | Existing `/health` delegates to `HealthService`; photo controller is next |
| DTO / pipes | HTTP shapes and incoming validation; never persistence entities as public responses | Global validation exists; photo DTOs/pipes remain planned |
| Service | Business rules, ownership checks and multi-step orchestration | Health/storage services exist; photo business service remains planned |
| TypeORM Repository | Query and persist entities | Feature modules register repositories; no generic repository wrapper |
| Entity / database | Stored fields, relations, nullability, uniqueness and constraints | Project and Photo entities/migration exist |
| StorageService | Object-store access, separate from SQL and HTTP | Client and bucket readiness exist; object operations remain planned |

The photo-to-project relation is required and uses `ON DELETE RESTRICT`: database cascades cannot delete S3 objects. A composite `(project_id, created_at, id)` index supports per-project stable ordering. Database constraints enforce positive sizes, nonblank labels/keys, unique storage keys and JPG/PNG metadata; request validation will still inspect actual file content. The 5 MiB request limit is an application policy, not a permanent SQL size constraint.

Data-foundation checks passed on a disposable database: fresh/repeated migration, Entity/schema agreement, repeated seed without overwriting edits/photos, invalid-record constraints, restricted project deletion, connection reinitialization, and rollback/reapply. The temporary database was removed. The local development database also received the migration and demo seed. These checks do not cover photo HTTP endpoints or UI, and no checked-in feature test suite exists yet.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Framework checks completed with Node 24.14.1: lint (zero warnings), typecheck and both production builds; homepage and direct/proxied readiness returned 200. AWS SDK put/get/delete worked against S3Mock, and a probe object survived a restart of the pinned container. Invalid ports, URL protocols and missing storage credentials were rejected. These are foundation checks, not photo-feature test coverage.

The [photo scope plan](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) defines the current tasks and acceptance criteria. The [product direction](docs/PRODUCT_BLUEPRINT.md) describes future possibilities. Final decisions and verification evidence will be consolidated in the README and PR after implementation.

## Design reference

[Figma — editable photo management design](https://www.figma.com/design/8C3K9vrJg9zXlVye9ist7t/Doc-home-%C2%B7-Photo-management?node-id=3-5)

The [responsive photo-page design](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md#design-reference--completed-implementation-pending) includes the editable Figma link, two UI states, three viewport layouts and exported previews. The business UI is not implemented yet. The same change includes the Panda presets, semantic color tokens, shared text styles, self-hosted Inter font and reusable Button. Breakpoints are named `mobile` (0rem), `tablet` (48rem) and `desktop` (64rem). Photo components and the grid remain feature work.

Theme foundation checks passed: lint, typecheck and both production builds. The production homepage, generated CSS and self-hosted font were served successfully. Responsive photo-page behaviour remains to be implemented and verified.

## Photo API progress

3 of four photo endpoints implemented. Frontend remains pending. Jest/TypeScript tests and consolidated verification are later review commits.

- Implemented: GET /projects/:projectId/photos (200, malformed UUID 400, missing project 404), explicit public fields, request IDs and safe error/access logs.
- Implemented: POST /projects/:projectId/photos, multipart field file, one JPEG/PNG up to 5 MiB, detected content type, UUID keys and compensation after failed metadata save; 201 on success.
- Implemented: GET /projects/:projectId/photos/:photoId/content. No parameters returns original bytes; optional w/h from 1–2048 resize proportionally inside the bounds without enlargement. For 1200 x 800, w=300 -> 300 x 200, h=300 -> 450 x 300, both 300 -> 300 x 200. Store originals only; no transformation cache.

These commits are a user-authorized regrouping for review. Tests and the final verification walkthrough follow the four API implementations. They do not claim the original work happened in this exact order.
