# Doc-home

Sync Technologies take-home exercise. Current status: framework foundation only; photo upload, list, view and delete are the next implementation steps.

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
pnpm dev
```

Open `http://localhost:3000` for the framework page. `http://localhost:3001/health` checks the API, PostgreSQL and the configured storage bucket; `http://localhost:3000/api/health` checks the frontend rewrite.

The API loads `apps/api/.env`. The frontend forwards `/api/*` to `http://localhost:3001`. Use `pnpm dev:web` or `pnpm dev:api` to start one app. The API connects to S3Mock at `http://localhost:9090` with AWS SDK v3 and path-style requests. Compose creates the `doc-home-assets` bucket automatically. Files will be stored there; PostgreSQL will store their metadata and object keys. The photo endpoints are not implemented yet.

Docker runs PostgreSQL and Adobe S3Mock 5.2.3. Both ports are bound to localhost. Named volumes retain database records and object files; **`docker compose down -v` deletes both sets of data**. Keep the emulator version pinned: persistence across version changes is not guaranteed.

S3Mock is a local development/test emulator, not production object storage. It does not enforce AWS authentication/IAM or validate presigned URL signatures. The example S3 credentials are dummy SDK values; never put real AWS credentials into this local setup. For production, provision private object storage and validate permissions and behaviour against real S3.

The API validates environment variables on startup without printing their values. `PORT` defaults to 3001 and must be an integer from 1–65535. Database URL and S3 endpoint, region, bucket and credentials are required. This project accepts simple bucket names of 3–63 lowercase letters, digits or hyphens. If you change `S3_BUCKET`, update Compose's initial bucket name as well. If you change the API port, also set the web process's `API_INTERNAL_URL`, for example `API_INTERNAL_URL=http://localhost:3002 pnpm dev:web`.

Storage supports arbitrary bytes, including images and PDFs. The selected business slice remains JPG/PNG photo management; PDF upload/download is deferred.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Framework checks completed with Node 24.14.1: lint (zero warnings), typecheck and both production builds; homepage and direct/proxied readiness returned 200. AWS SDK put/get/delete worked against S3Mock, and a probe object survived a restart of the pinned container. Invalid ports, URL protocols and missing storage credentials were rejected. These are foundation checks, not photo-feature test coverage.

The [photo scope plan](docs/PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) defines the current tasks and acceptance criteria. The [product direction](docs/PRODUCT_BLUEPRINT.md) describes future possibilities. Final decisions and verification evidence will be consolidated in the README and PR after implementation.
