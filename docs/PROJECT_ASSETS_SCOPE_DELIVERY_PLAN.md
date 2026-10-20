# Delivery scope — project links, photos and videos

## Status and source of truth

The approved expansion is **Links + Photos + Videos with soft deletion**. All seven local increments are complete, including follow-up review fixes and repeatable mixed-asset delivery checks. [Delivery verification](DELIVERY_VERIFICATION.md) records executed commands, coverage and limitations. This does not imply hosted CI, deployment or production readiness.

The assessment's follow-up asks for at least two asset types. Photos plus Links reach that checkpoint; Videos add the explicitly chosen resumable upload, asynchronous finalization and queryable status. Keep the scope small around one seeded project. Do not extend project editing, documents or custom fields.

Use [Asset contracts](ASSET_CONTRACTS.md) for the implemented data/API/lifecycle rules and [README](../README.md) for the committed application's setup and recorded verification. This plan supersedes the earlier photo-only delivery boundary and SQLite/local-files expansion proposals. The broader [product blueprint](PRODUCT_BLUEPRINT.md) remains background.

| Area | Delivered scope | Retained boundary |
| --- | --- | --- |
| Assets | Links, JPEG/PNG photos and MP4 videos; mixed list, upload recovery, playback and soft deletion | Preserve all three flows; delivery regression recorded |
| Lifecycle | Atomic shared photo/link/video soft deletion, active-read filtering and retained originals | Restore/completed-original purge deferred |
| Persistence | PostgreSQL metadata/sessions/manifests and S3Mock originals/chunks | Keep the SQL/object-storage boundary; no separate queue service |
| UI | Responsive Links/Photos/Videos page with upload progress/recovery, native video and inline video-delete confirmation | One project view with three sections, upload status/recovery, media view and deletion feedback |
| Quality | Existing Jest/RTL, local verification records and CI | Relevant tests per increment, then repeatable integration/real-media checks |
| Outside scope | Authentication, cloud deployment and broader product features | Still deferred, plus transcoding, HLS/DASH, CDN, generated posters and completed-file purge |

## Seven increment boundaries

The original plan split delivery into the seven increments below. Each implementation increment included relevant tests and retained the existing photo flow; later review fixes and documentation have separate commits. These are logical delivery boundaries, not the total PR commit count. Preserve the published history.

| # / increment | Scope | Acceptance / boundary |
| --- | --- | --- |
| 1. `docs: define mixed asset scope and contracts` | This plan, API/data/lifecycle contracts, README status/navigation and aligned project guidance | Documentation only; no application, dependency, migration execution or infrastructure changes |
| 2. `feat: soft-delete project photos` | Dedicated photo deletedAt migration, active-read filtering, idempotent deletion, retained original bytes, UI wording and tests | New content requests after deletion return 404; repeat same-project delete is 204; no restore endpoint |
| 3. `feat: add project links` | Common Asset/LinkDetail/FileDetail model, compatible photo metadata migration, mixed list/delete API, URL validation and complete link UI | Preserve photo IDs, object keys, timestamps and endpoints; named/unnamed links work; no scraping or batch input |
| 4. `feat: persist resumable video uploads` | Upload session/part schema, raw binary parts, whole-file identity binding, status, cancel/expiry and admission controls | Restart retains acknowledged parts; duplicate/out-of-order requests and cancellation races are tested; upload UI deferred |
| 5. `feat: finalize and serve video assets` | Durable single-worker finalization, checksum/container checks, bounded retry, idempotent publication, Range content and soft deletion | No premature READY; restart recovery and uncertain-commit reconciliation; deleted asset cannot be republished |
| 6. `feat: add video upload and viewing UI` | Video selection/checking/progress/finalizing/recovery, task row, player, errors/delete and responsive mixed-assets layout | Complete browser workflow; hiding upload controls differs from cancel; preserve photo/link usability |
| 7. `test: verify mixed asset workflows and document delivery` | Repeatable PostgreSQL/S3Mock integration checks, real image/video browser checks, final README/scope evidence and necessary CI adjustments | Record commands/results and remaining gaps; no deferred feature expansion |

Commit 3 is the first complete two-type checkpoint. Its migration work is deliberately explicit: a common API must not leave two writable photo metadata stores or discard existing data. Photo soft deletion, asset normalization, video sessions and publication each have separate registered migrations. The earlier combined draft was removed.

The increments describe implementation scope; commits alone do not establish hosted CI success, reviewer sign-off or deployment.

## Architecture and model decisions

Keep the existing pnpm workspace, Next.js App Router/React/TypeScript/Panda frontend and NestJS/TypeORM API. Browser calls remain same-origin `/api` rewrites. API owns validation, SQL and private storage access. Docker Compose still runs PostgreSQL and Adobe S3Mock locally; no AWS account or new queue service is required.

Asset supplies project association, explicit type, display name, stable ID, creation time and soft-delete marker. LinkDetail owns an external URL. FileDetail owns the private object key, detected MIME/size and optional unique upload association. Type-specific creation remains separate: JSON for links, existing multipart for photos, session/parts for video. Runtime HTTP validation remains necessary even with TypeScript types.

Preserve old photo DTOs/routes during the common-model migration. Never regenerate IDs, overwrite user-added records or move/delete stored originals to achieve schema consistency. Detailed constraints, migration compatibility and public fields are in [the contracts](ASSET_CONTRACTS.md#1-domain-and-persistence).

## Upload, storage and failure decisions

- Photos retain their current JPEG/PNG, 5 MiB, original storage and bounded read-time resizing behavior. No thumbnail pipeline or input-validation expansion is smuggled into this scope change.
- Video uses a 20 MiB cap, 5 MiB raw binary parts, two browser requests, four admitted receiving requests/four active or not-yet-cleaned sessions and one finalizer. These are assessment limits, not production capacity claims.
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

Keep Inter, existing Panda semantic roles, preset spacing/radii and Button recipe. Shared `AssetSection` handles heading/count/description structure; `LinksSection`, photo components and `VideosSection` own their type-specific forms, previews and deletion feedback. Reuse the current 20px mobile and 32px tablet/desktop page padding; the earlier 24px design suggestion is superseded to avoid unnecessary layout churn. Mobile is one column, tablet two photo columns, desktop three; uploads and viewers must fit narrow screens.

### Baseline photo screenshots

Figma references and running-app screenshots are separate evidence. The app captures show local sample uploads, not photos created by the seed. List order is newest first, so it differs from the illustrative Figma order.

| View | Figma design | Running app |
| --- | --- | --- |
| Desktop (1440px) | [Design](images/photo-management-desktop.png) | [Implementation](images/app-desktop.png) |
| Tablet (834px) | [Design](images/photo-management-tablet.png) | [Implementation](images/app-tablet.png) |
| Mobile (390px) | [Design](images/photo-management-mobile.png) | [Implementation](images/app-mobile.png) |

[Empty-state design](images/photo-management-empty.png). Sample construction photos are illustrative project records, not customer evidence: [site overview — Dhaniel Hartono](https://unsplash.com/photos/PCDK46BCeh4), [site progress — shraga kopstein](https://unsplash.com/photos/7ypbeAK9t4E), [roof framing — Avel Chuklanov](https://unsplash.com/photos/IB0VA6VdqBw), via Unsplash. These are JPG examples; PDF/DOC support remains outside this slice.

Historical increment 3 evidence: [390px layout with long URL](images/links-mobile.png); 320px had no horizontal overflow. Native confirmation automation was blocked at that checkpoint; increment 7 subsequently verified confirmed link/photo/video deletion in Chrome.

## Verification and completion

The [verification record](DELIVERY_VERIFICATION.md) distinguishes the latest unit/component checks from earlier PostgreSQL/S3Mock, browser and local build results. Asset migration/link/photo and video integration have committed opt-in Jest suites totaling 35 cases and an isolated Docker runner; the integration runner applies migrations only to its disposable database. It covers the mixed-asset HTTP/SQL/storage boundary, not real AWS behavior. Increment 7 adds a committed opt-in browser runner with four serial mixed-asset workflows and real landscape/derived portrait media.

Verification was added alongside each implementation increment. Commit 2 replaced hard-delete test expectations and verified old-data preservation, idempotency, object retention and guarded rollback on disposable data. Commit 3 verified common-model migration/backward compatibility on disposable data, including active/deleted records, old routes, object keys, transactional creation and guarded downgrade. Video protocol/finalizer tests belong with commits 4–5, frontend behavior tests with commit 6. Commit 7 adds cross-boundary evidence and real H.264/AAC landscape/portrait playback, seeking and deletion checks.

Keep existing records/object data intact. Do not reset volumes, install dependencies or access cloud services as an implicit part of these steps. Review schema changes and document rollback limits before running them. Future authorization, audit, retention periods, restore UI, production AWS behavior, multi-instance processing and deployment remain explicitly incomplete.

Increment 6 first verified landscape playback. Increment 7 added portrait track orientation, PNG/JPEG, confirmed deletion, missing-session recovery and 1440/834/390/320px layouts. Test input videos remain outside Git; selected documentation screenshots are committed. Use [delivery verification](DELIVERY_VERIFICATION.md) for the current counts and execution boundaries rather than historical checkpoint totals.
