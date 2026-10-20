# Mixed asset contracts — implementation target

Status: approved mixed-asset contract; increments 1–7 are implemented and checked locally. Increments 2–6 implement and check shared photo/link soft deletion, the common asset model, Links, mixed listing and photo compatibility. Video sessions and manifests are now persisted; finalization, publication and Range content are implemented; frontend upload/recovery/native playback/deletion is implemented. Portrait-orientation and repeatable local delivery checks passed; other-browser/production checks remain unverified. See [delivery evidence](DELIVERY_VERIFICATION.md). Use [README](../README.md) for actual available behavior. The committed registered migrations define the delivered schema. The [delivery plan](PROJECT_ASSETS_SCOPE_DELIVERY_PLAN.md) defines the seven commit boundaries.

This document supersedes earlier SQLite/local-disk proposals. Keep Next.js/React/Panda, NestJS/TypeORM, PostgreSQL and private S3-compatible storage (Adobe S3Mock locally). No storage replacement, extra service or new dependency is required by this contract.

## 1. Domain and persistence

| Model | Target fields / constraints |
| --- | --- |
| Project | Existing UUID, name, address and creation time; preserve seed and user edits |
| Asset | UUID, project FK, `type: link \| photo \| video`, display name, creation time and nullable `deletedAt` |
| LinkDetail | Asset PK/FK and external `url`; only for `type=link` |
| FileDetail | Asset PK/FK, unique internal `storageKey`, MIME type, positive byte size and nullable unique `uploadId`; only for photo/video |
| VideoUpload | UUID, project FK, original filename, expected size and SHA-256, chunk size, state, expiry, attempts, processing deadline, next attempt time and public error code |
| UploadPart | `(uploadId, partNumber)` composite key, positive byte size, SHA-256 and unique internal storage key |

Use explicit SQL checks for scalar constraints and transactions for cross-table rules: exactly one matching detail per asset; photo/video cannot use LinkDetail; a published video has a unique upload association. Foreign keys alone do not enforce the type/detail relationship. Do not introduce a generic repository framework or a single creation DTO with every type's fields optional.

**Compatibility and migration:** commit 2 adds photo soft deletion to the existing photo table, with a rollback guard when tombstones exist. Commit 3 introduces the common asset model and migrates photo metadata into Asset/FileDetail, preserving IDs, timestamps, project association, deletion markers and object keys. No object is re-uploaded or deleted. Existing photo endpoints and DTOs remain compatible through the photo service. The legacy photo table must not remain a second writable source of truth after migration. Validate the metadata copy and compatibility on disposable data before applying it to existing data; document rollback limits for assets created after migration.

The earlier nullable URL/file `assets` draft has been replaced with the normalized common model. Photo/link/video types are enabled now; video/session fields are introduced by dedicated increments 4–5 migrations. New video tables belong to commits 4–5, not the photo soft-delete migration.

### Public responses

Common fields: `id`, `projectId`, `type`, `name`, `createdAt` (ISO timestamp).

| Type | Additional fields | Intentionally absent |
| --- | --- | --- |
| `link` | `url` | File size, MIME type and content URL |
| `photo` | `mimeType`, `sizeBytes`, `contentUrl` | External URL |
| `video` | `mimeType: video/mp4`, `sizeBytes`, `contentUrl` | External URL |

`GET /projects/:projectId/assets` returns `{ project: { id, name, address }, assets: Asset[] }`, active assets only, newest first with ID as a stable tiebreaker. The UI groups by explicit type, not filename extensions. The existing photo list/upload DTO stays unchanged; the common API adapts it to the above shape.

Do not return storage keys, absolute paths or deleted records in ordinary responses. Content URLs use project-scoped API routes and go through NestJS; no public bucket/static path bypass. Project association checks are not user authorization. Authentication remains outside this assessment scope.

## 2. Target HTTP interface

All path IDs are UUIDs. JSON control requests use normal HTTP; deployed traffic requires HTTPS. Existing photo routes remain available.

| Method / route | Target result |
| --- | --- |
| `GET /projects/:projectId/assets` | 200 project and mixed asset list |
| `POST /projects/:projectId/links` | 201 LinkAsset, after database commit |
| `DELETE /projects/:projectId/assets/:assetId` | 204 after soft deletion |
| `GET /projects/:projectId/assets/:assetId/content` | Photo bytes or MP4 bytes; links/deleted assets return 404 |
| `GET/POST /projects/:projectId/photos` | Preserve existing photo contracts |
| `GET /projects/:projectId/photos/:photoId/content` | Preserve original/resized reads; exclude deleted assets |
| `DELETE /projects/:projectId/photos/:photoId` | Compatibility alias for photo soft deletion |
| `POST /projects/:projectId/uploads` | 201 upload session |
| `PUT /projects/:projectId/uploads/:uploadId/parts/:partNumber` | 201 first confirmation; 200 identical retry |
| `GET /projects/:projectId/uploads/:uploadId` | 200 persisted session status |
| `POST /projects/:projectId/uploads/:uploadId/complete` | 202 first/processing request; 200 already ready; 410 deleted asset |
| `DELETE /projects/:projectId/uploads/:uploadId` | 200 canceled state; 409 processing/ready state |

The project prefix is checked on every upload/content operation, including retries. Keep the existing Nest error envelope: `{ statusCode, message, requestId }`; `message` may be a validation string array. Domain conflicts can add a stable `code`, such as `ASSET_DELETED`. Do not replace it with an unrelated nested error format. Async task errors live in the status response's `error: { code, message }` while GET itself returns 200.

Use 400 for malformed input, 404 for missing/wrong-project resources, 409 for state/content conflicts, 410 for completing a deleted asset, 413 for actual byte limits, 415 for unsupported media, and 429 with Retry-After for admission limits. Storage outages are errors, not missing assets. Internal errors remain sanitized and request-correlated.

## 3. Links

Creation accepts `{ url, name? }`; the route assigns type. Reject unknown fields, including client-supplied storage keys, content URLs and type.

- Trim URL and require 1–2048 characters. Parse as an absolute HTTP/HTTPS URL with a hostname and no username/password. Reject relative and other-scheme URLs.
- Preserve path case, query and fragment; store the parser's serialized value, not a lowercased string.
- Optional name is trimmed, at most 120 characters; blank means omitted. Fall back to the complete validated URL. The shared display-name column must accommodate this 2048-character fallback; file names remain limited to 255 characters.
- Persist Asset/LinkDetail atomically. No upload session or file storage operation.
- Add one URL at a time; allow duplicates. No server HEAD/GET, scraping, reachability checks or generated preview. Validation does not guarantee the destination is reachable.
- Open an ordinary anchor in a new tab with noopener/noreferrer. Render user text as text; keep the full URL accessible when shortening the display.

Disable duplicate submission while pending. On success update from the server response; on failure keep input. An ambiguous network outcome requires list reconciliation before retry, not an automatic POST replay. Exactly-once creation/idempotency keys are deferred.

## 4. Photos and previews

Preserve the existing single multipart `file` upload, nonempty JPEG/PNG and inclusive 5 MiB limit, filename validation and detected content type. Preserve optional read-time resizing with proportional fit, no enlargement, 1–2048 pixel query bounds and the current 40-million-pixel/five-second Sharp processing limits. Do not silently replace them with the earlier draft's 25-million-pixel suggestion.

Current signature detection is not full image decoding or malware scanning. Additional decode validation is a separate possible improvement, not claimed here as delivered or required in this expansion.

Store originals; retain existing bounded read-time previews. No stored/generated thumbnail pipeline or transform cache. Photo viewer fits the original ratio; video uses a neutral play placeholder and a native player; links use an external-link indicator. A shared asset wrapper owns heading/count/delete feedback; each type owns its creation and preview behavior.

## 5. Video upload protocol

| Parameter | Target decision |
| --- | --- |
| Input | Nonempty MP4, at most 20 MiB; filename ≤255 characters without controls |
| Create body | `fileName`, `fileSizeBytes`, `mimeType: video/mp4`, `expectedSha256` (64 lowercase hexadecimal characters) |
| Parts | Server-selected 5 MiB; zero-based indices; exact remaining length for final part |
| Request body | Raw binary `application/octet-stream`, no multipart or Base64 |
| Frontend | One video upload at a time, up to two part requests concurrently |
| Backend admission | One API instance, at most four active sessions, four receiving part requests and one finalizer |
| Temporary budget | Reserve twice the declared file size per active session; at most 160 MiB of logical reservations |
| Expiry | Incomplete pre-processing sessions expire after 24 hours |
| Status | Foreground PROCESSING poll approximately every second; stop on terminal state; network failure shows status unknown and manual check |

Reservations are a bounded admission rule, not proof of S3/disk free capacity. No portable free-disk check is assumed through the S3 API; emulator/provider write failures must remain explicit. Completed and soft-deleted originals are outside the temporary budget and continue to occupy storage.

Persist sessions and part manifests in PostgreSQL; store temporary parts and completed originals under separate server-generated S3 key prefixes. This replaces local-disk rename/free-space assumptions. For this 20 MiB cap, the finalizer may assemble a bounded file buffer before upload; one finalizer limits concurrent merge memory. Document buffer/copy overhead, rather than claiming constant memory or long-video scalability. No new filesystem upload service is required.

### File identity, progress and concurrency

1. Browser computes the whole-file hash before session creation; show Checking your file without a fake percentage. The server binds immutable size/hash to the session.
2. Enforce actual received bytes and a bounded idle/receive timeout; Content-Length and MIME are not trusted. Limit buffers/streams before accepting work.
3. Acknowledge a part only after storage and a unique manifest entry are confirmed. Same index/hash/size is idempotent; different content returns 409. Use immutable part keys so conflicting requests cannot overwrite acknowledged bytes.
4. Part registration, cancel and complete recheck state under a row lock/conditional transaction. Late parts cannot revive a canceled, expired or processing session. Never hold an open SQL transaction while waiting for browser upload bytes.
5. Progress is `floor(sum(unique acknowledged part bytes) / expectedSize × 100)`. Storage writes without a confirmed manifest are not progress. Retry after an uncertain response queries status first.
6. After refresh, query the session before requesting a file. Only resume pre-processing sessions; reselected content must match the whole-file hash. File name/size alone are insufficient.
7. Complete checks every expected index and exact size, then persists PROCESSING before returning 202. Finalization verifies part hashes, total bytes, final hash and limited MP4 container structure before publishing.

SHA-256 establishes content consistency, not authorization, malware safety or codec compatibility. Browser validation supplements server validation.

### Durable finalization

States: CREATED → UPLOADING → PROCESSING → READY or FAILED. CREATED/UPLOADING can become CANCELED or EXPIRED. PROCESSING cancellation is deferred. Failed/expired/canceled sessions require a new upload; a part-level network failure alone does not fail the session.

A single worker scans persistent processing work, including after restart. Persist attempt count, start/deadline and next-attempt time. Initial configurable design: 60 seconds per finalization attempt, at most two attempts with a two-second delay for transient storage failures; format/hash errors do not retry. Abort and settle the previous attempt before retrying, and fence late attempts from publishing. Validate these parameters with real local samples before claiming performance.

Write the final object, then atomically create Asset/FileDetail and mark the session READY in PostgreSQL. A unique upload association prevents duplicate publication. A lost commit acknowledgement requires querying by upload ID before retry or cleanup. Keep final objects while the database outcome is uncertain; never delete possibly referenced bytes. When infrastructure is unavailable, persist/reconcile the uncertainty once it returns rather than inventing a known terminal outcome. A process watchdog is not a guarantee of responsiveness during a deadlock or outage.

Terminal-session temporary parts are eligible for best-effort cleanup with retry. Persist enough manifest information to retry failed cleanup after restart. An object written before an unconfirmed manifest save can still be orphaned; log its identifiers for manual reconciliation. A complete object inventory/sweeper and production queue/multi-instance leases are deferred.

## 6. Status and deletion contract

Upload status returns `uploadId`, `state`, `fileSizeBytes`, `chunkSizeBytes`, `totalParts`, sorted `receivedParts`, `receivedBytes`, `uploadPercent`, `expiresAt`, `assetAvailable`, `asset` and `error`. A completed asset is present only when READY and currently active. No internal object keys are exposed.

- First soft DELETE sets `deletedAt`; repeat same-project DELETE returns 204 without changing its first deletion time. Missing/wrong-project ID returns 404. Keep metadata, detail records, completed original and unique upload association.
- Default list, detail, resized-preview and content queries exclude deleted rows. New content requests after deletion return 404; previously delivered bytes cannot be recalled. Use no-store and keep file access behind the API.
- A deleted video's session remains historically READY with `assetAvailable=false, asset=null`. Repeating complete returns `410 ASSET_DELETED`; it cannot recreate the asset.
- Future restore must be a separate action, verify original-file existence and clear the deletion marker. No restore/Undo UI, restore endpoint, automatic completed-file purge or retention-period promise in this scope.
- Canceled/failed/expired temporary upload data is still cleaned; soft deletion is not a reason to retain unfinished garbage indefinitely.

## 7. UI completion rules

Use the [single Figma review page](https://www.figma.com/design/8C3K9vrJg9zXlVye9ist7t/Doc-home-%C2%B7-Photo-management?node-id=66-282). It is an editable layout reference, not a component-complete library or runnable prototype.

- Project context plus Links/Photos/Videos sections; reuse Panda roles and Button recipe. Keep original-photo behavior working while adding sections.
- Video: choose → check file → upload → 100% transferred / Finalizing → published card only on READY + available asset. Closing a dialog retains an upload task row; explicitly canceling ends a pre-processing session. A task row is not a published asset.
- Keep only project/upload IDs and recovery metadata locally, never file bytes. Stop irrelevant polling and avoid stale responses restoring deleted cards.
- Pending requests disable repeat actions. Validation errors stay by their input; ambiguous results require status/list reconciliation. Delete removes the card only after confirmation; failure keeps it visible.
- Native video controls, no autoplay, playsInline, a 16:9 container with contain for portrait/landscape. Serve HTTP Range through the storage/framework capability and verify 206/416. Show a clear playback error independently of storage availability.
- Dialog focus/keyboard behavior and responsive controls need implementation checks. Keep one-column mobile layout and controls at least 44px tall; preserve existing 20px mobile and 32px tablet/desktop page padding unless a measured layout issue requires a change.

No HLS/DASH, transcoding, generated video posters, CDN/cache layer, duration/resolution guarantee, auth, documents, custom fields or project editing. READY means stored/available, not guaranteed playable in every browser.

## 8. Acceptance gates

Each implementation commit includes its relevant tests. Commit 7 adds repeatable cross-boundary evidence rather than postponing all tests to the end.

- Preserve existing photo metadata/keys/IDs and old HTTP contracts through migration; validate on disposable PostgreSQL/S3Mock data.
- URL schemes/credentials/length, named and unnamed links, atomic detail writes and wrong-project requests.
- Tombstone filtering on every read/content path; retain original bytes; repeat delete; complete cannot resurrect deleted assets.
- Wrong-file resume, exact part sizes, duplicate/out-of-order parts, uncertain replies, cancel/complete races and admission limits.
- Durable worker restart, timeout/retry bounds, checksum/format rejection and uncertain database commits without destructive cleanup.
- Real JPEG/PNG plus real H.264/AAC landscape/portrait MP4: upload, refresh, play, pause, seek, Range, delete and failed playback messaging.
- Run app checks/builds and record only actual results. Unit doubles, local emulator checks, browser checks and real AWS/production guarantees remain distinct.
