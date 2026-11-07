# Delivery verification

Date: 2026-10-20 (Australia/Perth). Scope: Links + Photos + Videos with shared soft deletion.

Evidence below spans multiple revisions. The latest code review reran typechecks, lint and unit/component tests; integration, browser and local build results come from the earlier mixed-asset verification. Documentation-only changes do not constitute another execution of those suites. Hosted CI status is available in [PR #2 checks](https://github.com/HAIXIN-ZHANG/Doc-home/pull/2/checks).

## Latest local code checks

Executed after the naming and response-validation changes in `1617e4c`:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Both applications passed |
| `pnpm lint` | Both applications passed |
| `pnpm --filter api test` | 12 suites, 157 passed; 35 opt-in integration cases skipped |
| `pnpm --filter web test` | 4 suites, 37 passed |

That review clarified controller/DTO/entity names and explicit public-field mapping. Mixed-response parsing now verifies every asset's project association before adapting photos to the legacy DTO; a new regression covers a mismatched photo project. No dependency or migration SQL changed.

## Earlier integration, browser and build checks

These passed during the mixed-asset delivery and architecture follow-up, before `1617e4c`. They were not rerun for that final naming/validation review.

| Check | Recorded result |
| --- | --- |
| `VIDEO_TEST_FILE=/absolute/sample.mp4 pnpm --filter api test:integration` | 20 asset + 15 video cases passed with disposable PostgreSQL/S3Mock |
| `pnpm --filter api build` | Passed |
| `pnpm --filter web exec next build --webpack` | Passed; also used by the local E2E runner |
| `pnpm test:e2e` with two external video inputs | Four serial Chrome workflows passed against real API/storage/production web builds |
| Shell syntax / whitespace | Runner and CI change-detection script syntax passed `bash -n`; `git diff --check` passed |

Integration coverage includes existing photo/tombstone migration and rollback guards; preserved originals/IDs; link validation/transaction rollback; correct project/type boundaries; actual receiving-size/admission limits; duplicate and conflicting parts; part/cancel and complete/cancel races; expiry; processing restart and bounded retry; cleanup outage; uncertain storage writes and SQL commit acknowledgement; video Range/416; soft deletion and no resurrection. Fault injection uses in-process test hooks with real SQL/storage boundaries; it is not a claim that arbitrary infrastructure failures have been simulated.

## Browser evidence

The automated run used the existing Playwright and Google Chrome installations, headless, at loopback ports 33500/33501. Tests generate real PNG/JPEG fixtures with the existing Sharp dependency. Input videos and generated runner artifacts stay outside Git; the selected documentation screenshots below are committed separately.

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

These E2E tests are opt-in local verification, not part of the current hosted CI. The counts here record local execution. Hosted CI status is reported separately in the pull request checks; cloud deployment and real AWS remain outside these checks.

## Deliberate remaining limits

One API/worker instance, 20 MiB MP4, bounded merge buffers and finite container checks. No auth, malware scanning, transcoding, HLS/DASH/CDN, generated poster, restore UI, completed-original purge or full orphan inventory sweeper. Temporary cleanup retries; soft-deleted originals remain stored. A whole-file hash verifies consistency, not safety or authorization. No full accessibility audit, high-concurrency load test, real AWS or other-browser coverage is claimed.

## AI assistance

Codex assisted implementation, test scaffolding, review and documentation. The results above record executed checks, not candidate understanding or reviewer sign-off. Personal interview notes remain outside this repository.

## History and review boundaries

Feature increments and review fixes remain separate. At the user's request, the feature history was made linear on the existing README-only `main`; earlier histories and retired backup branches were preserved in verified external Git bundles. History normalization retained application file trees and did not itself rerun functional tests. A prior audit checked historical source snapshots with existing dependencies; it was not a frozen reinstall or a full browser/integration/build run for every commit.

## Current mixed-asset screenshots

Captured the already-running localhost:3000 page on 2026-10-20 at 1440px desktop, 834px tablet and 390px mobile widths. Each full-page image includes the link list, all three existing photo cards and the complete native video card, including playback controls and the delete action. The captures preserve the current sample records; “PR closed” is a user-created link name. The visible Next.js development indicator is retained. No sample records were added or deleted for the screenshots.

[Desktop](images/mixed-assets-desktop.jpg) · [Tablet](images/mixed-assets-tablet.jpg) · [Mobile](images/mixed-assets-mobile.jpg). These are visual evidence, not a new execution of the integration/E2E suite.
