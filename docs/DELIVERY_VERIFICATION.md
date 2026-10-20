# Local delivery verification

Date: 2026-10-20 (Australia/Perth). Scope: the approved seven increments, Links + Photos + Videos and shared soft deletion.

## Changes and review

Feature commits remain separate: `f84a2a8` upload protocol/persistence; `dbab3b2` durable processing/publication/Range; `e2ec699` upload/recovery/player UI. Follow-up review fixes are in `e6ec95a`: recover from a confirmed missing session; record uncertain part-write identity; read state/parts under the same session lock. Added tests exercise cancellation while a PUT is actually in flight and simultaneous duplicate PUTs. Feature increments remain separate. A later user-requested cleanup removed the duplicate initialization history and content-free merge; the original refs are archived outside this repository.

Personal learning/commit notes are outside this repository. This file records reproducible project verification, not a candidate interview narrative.

## Executed checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Both applications passed |
| `pnpm lint` | Both applications passed |
| `pnpm --filter api test` | 12 suites, 157 passed; 35 opt-in integration cases skipped |
| `pnpm --filter web test` | 4 suites, 36 passed |
| `VIDEO_TEST_FILE=/absolute/sample.mp4 pnpm --filter api test:integration` | 20 original asset + 15 video cases passed with real disposable PostgreSQL/S3Mock |
| `pnpm --filter api build` | Passed |
| Webpack production build | Passed; used by the local E2E runner. The default project build command remains unchanged |
| `pnpm test:e2e` with the two external video inputs | Four serial browser workflows passed against real API/storage/production web builds |
| Shell syntax / whitespace | E2E runner and existing CI change detector passed `bash -n`; `git diff --check` passed |

Integration coverage includes existing photo/tombstone migration and rollback guards; preserved originals/IDs; link validation/transaction rollback; correct project/type boundaries; actual receiving-size/admission limits; duplicate and conflicting parts; part/cancel and complete/cancel races; expiry; processing restart and bounded retry; cleanup outage; uncertain storage writes and SQL commit acknowledgement; video Range/416; soft deletion and no resurrection. Fault injection uses in-process test hooks with real SQL/storage boundaries; it is not a claim that arbitrary infrastructure failures have been simulated.

## Browser evidence

Installed Playwright with installed Google Chrome, headless, at loopback ports 33500/33501. The Browser plugin is not available; no browser or package was installed. Tests generate tiny real PNG/JPEG fixtures with the existing Sharp dependency. Media and screenshots stay outside Git.

| Workflow | Verified behavior |
| --- | --- |
| Links and photos | Invalid URL feedback; named/unnamed links; safe new-tab attributes; PNG/JPEG upload and refresh persistence; mixed list has explicit types and hides storage keys |
| Landscape video | Oversize rejection; multipart-session transfer and finalization; native play/pause/seek; exact same-origin 206 bytes; 416 for an unsatisfiable range; refresh persistence |
| Interrupted upload | Intentionally failed PUT; confirmed progress retained; refresh/reselection; wrong-file hash rejected; missing chunks resumed; explicit cancel publishes nothing; confirmed missing recovery ID clears |
| Portrait / mixed deletion | Portrait orientation plays; native player contains it; 1440/834/390/320 widths have no horizontal overflow; video/link/photo delete with confirmations; survivor records persist after refresh; deleted video content is 404 and complete is 410 `ASSET_DELETED` |

The player error message is exercised by dispatching its DOM error event; it does not claim a particular unsupported codec was encoded for that check. Page identity, meaningful content, no framework overlay and no JavaScript page errors were checked. Resource errors for deliberately aborted PUTs, missing-session/content 404 and deleted-complete 410 are expected test outcomes; unexpected console errors fail the suite.

The local successful landscape sample was a user-authorized 15-second H.264/AAC copy, 14,187,243 bytes. The portrait sample is a derived MP4 with a 90-degree track transform, preserving encoded media, not an independently filmed portrait recording. Native intrinsic portrait orientation was checked after playback. The Downloads original was preserved and its over-limit rejection had been verified in increment 6. This is Chrome coverage, not cross-browser certification.

## Repeat the browser checks

Have the existing local PostgreSQL 17 / S3Mock 5.2.3 images and Google Chrome available. Provide two local MP4 files, each at most 20 MiB; the landscape file must exceed 5 MiB to exercise multiple parts. The second file must present in portrait orientation.

```bash
VIDEO_TEST_FILE=/absolute/landscape.mp4 \
PORTRAIT_VIDEO_TEST_FILE=/absolute/portrait.mp4 \
pnpm test:e2e
```

The runner checks port availability, creates dedicated containers with random storage ports, applies migrations/seeds only to its disposable database, generates photo fixtures, builds/starts both apps, runs `apps/web/e2e/mixed-assets.spec.ts`, then stops only its own app processes/containers/anonymous volumes. It prints an external evidence directory containing build/server logs and browser screenshots. It never pulls images, installs dependencies, fetches external link destinations or resets normal Compose volumes. Override `E2E_WEB_PORT` / `E2E_API_PORT` if the default test ports are occupied; `E2E_BROWSER_CHANNEL` selects an already installed Playwright browser channel.

These E2E tests are opt-in local verification, not part of the current hosted CI. Hosted CI results have not been checked in this task; no push, PR publication, cloud deployment or real AWS test is claimed.

## Deliberate remaining limits

One API/worker instance, 20 MiB MP4, bounded merge buffers and finite container checks. No auth, malware scanning, transcoding, HLS/DASH/CDN, generated poster, restore UI, completed-original purge or full orphan inventory sweeper. Temporary cleanup retries; soft-deleted originals remain stored. A whole-file hash verifies consistency, not safety or authorization. No full accessibility audit, high-concurrency load test, real AWS or other-browser coverage is claimed.

## AI assistance

Implementation, test scaffolding and documentation used AI assistance. The commands above were executed locally and their results recorded. Candidate understanding and reviewer sign-off should be assessed separately from automated test evidence.

## Readability and boundary review

A follow-up review retained the HTTP contracts and database schema while clarifying names and ownership: generic S3 object operations; video entities in `videos`; direct worker storage injection; explicit upload status responses; named processing limits; and separate claim/assemble/publish/failure operations. The frontend now composes one initial mixed response in `project-assets`, validates it before adaptation, and uses shared section/input/feedback recipes and components. Four additional composition tests protect the compatible photo shape and reject malformed/mismatched/unsupported responses.

The README is now an entry point for setup/configuration/API/checks; [architecture](ARCHITECTURE.md) records actual UI/module boundaries and consistency trade-offs. Coverage configuration includes assets/videos and the UI primitives rather than reporting only the earlier photo slice. No coverage percentage or threshold is claimed.

Current follow-up checks passed: 157 API unit cases, 36 web cases, 35 PostgreSQL/S3Mock integration cases and four Chrome E2E workflows; both typechecks/lints and API/Webpack builds passed. The existing local images briefly failed an initial Docker image lookup; inspection confirmed the cached images and a retry passed without downloading anything.

Before the follow-up, all 34 existing commits were inspected for structure and manifest/lockfile specifier consistency, with no mismatches or tracked environment/build/media paths found. The eight mixed-asset commits were additionally exported to isolated source snapshots and each passed API/web typechecks and unit/component tests using the existing installed dependencies. This is not a frozen reinstall or a claim of rerunning every historical emulator/browser/build check. That audit describes the pre-cleanup history; original refs are retained in an external Git bundle.

## History normalization

At the user’s request, local history was normalized to one `init project` root and a linear feature branch. The remote README-only initialization had the identical tree, and its connecting merge had no content difference from its first parent; both redundant history entries were removed. All 35 retained commits preserve their original file trees, messages, author and timestamp metadata. Five old local backup branches were archived in a verified external Git bundle before removal.

The application, configuration and test files are unchanged by this operation. The follow-up documentation commit updates history references and archive guidance only. Previously recorded functional checks apply to the identical application tree; no new execution of those checks is claimed by the history cleanup. Updating already-published remote refs is a separate action.
