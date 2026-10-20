# Delivery scope — project links, photos and videos

## Status and source of truth

The approved expansion is **Links + Photos + Videos with soft deletion**. The committed application baseline remains the photo workflow. This first increment changes documentation only: new APIs, soft deletion and video processing below are targets, not delivered capabilities. Existing uncommitted application drafts have not been validated and do not change that status.

The assessment's follow-up asks for at least two asset types. Photos plus Links reach that checkpoint; Videos add the explicitly chosen resumable upload, asynchronous finalization and queryable status. Keep the scope small around one seeded project. Do not extend project editing, documents or custom fields.

Use [Asset contracts](ASSET_CONTRACTS.md) for the target data/API/lifecycle rules and [README](../README.md) for the committed application's setup and recorded verification. This plan supersedes the earlier photo-only delivery boundary and SQLite/local-files expansion proposals. The broader [product blueprint](PRODUCT_BLUEPRINT.md) remains background.

| Area | Committed baseline | Approved target / deferred boundary |
| --- | --- | --- |
| Assets | JPEG/PNG upload, list, original/resized view and delete | Add external links and MP4 video; preserve photo routes |
| Lifecycle | Photo record deletion followed by best-effort object cleanup | Soft deletion for all three types; retain completed originals; restore/purge deferred |
| Persistence | TypeORM/PostgreSQL metadata, S3Mock original files | Keep this stack; PostgreSQL upload sessions/manifests and S3 temporary parts |
| UI | Responsive photo page with loading/empty/error/reconciliation feedback | One project view with three sections, upload status/recovery, media view and deletion feedback |
| Quality | Existing Jest/RTL, local verification records and CI | Relevant tests per increment, then repeatable integration/real-media checks |
| Outside scope | Authentication, cloud deployment and broader product features | Still deferred, plus transcoding, HLS/DASH, CDN, generated posters and completed-file purge |

## Seven commit boundaries

Work one increment at a time. Each implementation commit must build, include its relevant tests, keep the existing photo flow usable and update delivered-status documentation. Do not commit inactive controls or imply that a backend protocol increment already has its final UI. Do not rewrite the existing history.

| # / proposed subject | Scope | Acceptance / boundary |
| --- | --- | --- |
| 1. `docs: define mixed asset scope and contracts` | This plan, API/data/lifecycle contracts, README status/navigation and aligned project guidance | Documentation only; no application, dependency, migration execution or infrastructure changes |
| 2. `feat: soft-delete project photos` | Dedicated photo deletedAt migration, active-read filtering, idempotent deletion, retained original bytes, UI wording and tests | New content requests after deletion return 404; repeat same-project delete is 204; no restore endpoint |
| 3. `feat: add project links` | Common Asset/LinkDetail/FileDetail model, compatible photo metadata migration, mixed list/delete API, URL validation and complete link UI | Preserve photo IDs, object keys, timestamps and endpoints; named/unnamed links work; no scraping or batch input |
| 4. `feat: persist resumable video uploads` | Upload session/part schema, raw binary parts, whole-file identity binding, status, cancel/expiry and admission controls | Restart retains acknowledged parts; duplicate/out-of-order requests and cancellation races are tested; upload UI deferred |
| 5. `feat: finalize and serve video assets` | Durable single-worker finalization, checksum/container checks, bounded retry, idempotent publication, Range content and soft deletion | No premature READY; restart recovery and uncertain-commit reconciliation; deleted asset cannot be republished |
| 6. `feat: add video upload and viewing UI` | Video selection/checking/progress/finalizing/recovery, task row, player, errors/delete and responsive mixed-assets layout | Complete browser workflow; dialog close differs from cancel; preserve photo/link usability |
| 7. `test: verify mixed asset workflows and document delivery` | Repeatable PostgreSQL/S3Mock integration checks, real image/video browser checks, final README/scope evidence and necessary CI adjustments | Record commands/results and remaining gaps; no deferred feature expansion |

Commit 3 is the first complete two-type checkpoint. Its migration work is deliberately explicit: a common API must not leave two writable photo metadata stores or discard existing data. The current combined soft-delete/link/video migration draft must be split and reworked to match these boundaries; it is not a release migration yet.

A local commit does not imply push, PR update, reviewer contact or deployment. Those actions are outside this increment.

## Architecture and model decisions

Keep the existing pnpm workspace, Next.js App Router/React/TypeScript/Panda frontend and NestJS/TypeORM API. Browser calls remain same-origin `/api` rewrites. API owns validation, SQL and private storage access. Docker Compose still runs PostgreSQL and Adobe S3Mock locally; no AWS account or new queue service is required.

Asset supplies project ownership, explicit type, display name, stable ID, creation time and soft-delete marker. LinkDetail owns an external URL. FileDetail owns the private object key, detected MIME/size and optional unique upload association. Type-specific creation remains separate: JSON for links, existing multipart for photos, session/parts for video. Runtime HTTP validation remains necessary even with TypeScript types.

Preserve old photo DTOs/routes during the common-model migration. Never regenerate IDs, overwrite user-added records or move/delete stored originals to achieve schema consistency. Detailed constraints, migration compatibility and public fields are in [the contracts](ASSET_CONTRACTS.md#1-domain-and-persistence).

## Upload, storage and failure decisions

- Photos retain their current JPEG/PNG, 5 MiB, original storage and bounded read-time resizing behavior. No thumbnail pipeline or input-validation expansion is smuggled into this scope change.
- Video uses a 20 MiB cap, 5 MiB raw binary parts, two browser requests, four admitted receiving requests/four active sessions and one finalizer. These are assessment limits, not production capacity claims.
- Whole-file SHA-256 binds resumed selections to the original file; unique acknowledged parts determine progress. 100% transfer still precedes finalization and publication.
- PostgreSQL stores sessions, manifests and retry/deadline state; temporary parts are private S3 objects. A single durable scanner recovers processing work after restart. No process-only fire-and-forget task is treated as a durable queue.
- For this small cap, bounded-buffer finalization is acceptable and has explicit memory/copy overhead. Earlier local-disk streaming, rename and free-space assumptions are not requirements of this S3-based implementation.
- SQL and object storage are not one transaction. An unconfirmed SQL commit must not trigger deletion of possibly referenced bytes. Query by stable upload/asset identifiers before retry or cleanup; log unresolved object references.
- Soft deletion retains completed metadata and originals. Active queries/content requests exclude tombstones. Temporary canceled/failed/expired parts still require retryable cleanup; full object inventory reconciliation is deferred.
- READY means stored and available, not guaranteed playable in every browser. Native MP4 playback and Range need real-media validation. No transcoding, generated posters, streaming manifests or CDN.

The parameter values, HTTP results, lifecycle transitions and uncertainty handling are specified in [Asset contracts](ASSET_CONTRACTS.md). Do not silently substitute a different state model in implementation drafts.

## Design reference

[Single-page mixed-assets Figma review](https://www.figma.com/design/8C3K9vrJg9zXlVye9ist7t/Doc-home-%C2%B7-Photo-management?node-id=66-282)

All new review frames are on **Assets v2 · Upload & preview**: desktop project assets; add/upload states; previews/delete/mobile; small states and trade-offs. This is an editable layout reference, not a runnable prototype or a fully bound component/Auto layout library. Original photo designs are preserved.

Keep Inter, existing Panda semantic roles, preset spacing/radii and Button recipe. Shared asset wrappers handle section/count/delete feedback; LinkList, photo views and VideoUploader preserve their distinct behavior. Reuse the current 20px mobile and 32px tablet/desktop page padding; the earlier 24px design suggestion is superseded to avoid unnecessary layout churn. Mobile is one column, tablet two photo columns, desktop three; uploads and viewers must fit narrow screens.

### Baseline photo screenshots

Figma references and running-app screenshots are separate evidence. The app captures show local sample uploads, not photos created by the seed. List order is newest first, so it differs from the illustrative Figma order.

| View | Figma design | Running app |
| --- | --- | --- |
| Desktop (1440px) | [Design](images/photo-management-desktop.png) | [Implementation](images/app-desktop.png) |
| Tablet (834px) | [Design](images/photo-management-tablet.png) | [Implementation](images/app-tablet.png) |
| Mobile (390px) | [Design](images/photo-management-mobile.png) | [Implementation](images/app-mobile.png) |

[Empty-state design](images/photo-management-empty.png). Sample construction photos are illustrative project records, not customer evidence: [site overview — Dhaniel Hartono](https://unsplash.com/photos/PCDK46BCeh4), [site progress — shraga kopstein](https://unsplash.com/photos/7ypbeAK9t4E), [roof framing — Avel Chuklanov](https://unsplash.com/photos/IB0VA6VdqBw), via Unsplash. These are JPG examples; PDF/DOC support remains outside this slice.

## Verification and completion

The existing README verification table describes the photo baseline and past checks, not the planned mixed-asset work or the unvalidated dirty worktree. This documentation-only commit does not rerun app tests or claim new runtime behavior.

Before each implementation commit, run its relevant tests and checks. Commit 2 must replace hard-delete test expectations; commit 3 must verify migration/backward compatibility on disposable data. Video protocol/finalizer tests belong with commits 4–5, frontend behavior tests with commit 6. Commit 7 adds cross-boundary evidence and real H.264/AAC landscape/portrait playback, seeking and deletion checks.

Keep existing records/object data intact. Do not reset volumes, install dependencies or access cloud services as an implicit part of these steps. Review schema changes and document rollback limits before running them. Future authorization, audit, retention periods, restore UI, production AWS behavior, multi-instance processing and deployment remain explicitly incomplete.
