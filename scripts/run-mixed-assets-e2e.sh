#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Private media and all logs/screenshots stay outside Git. Never install or pull.
for input in VIDEO_TEST_FILE PORTRAIT_VIDEO_TEST_FILE; do
  value=${!input:-}
  if [[ "$value" != /* || ! -f "$value" ]]; then
    printf 'Set %s to an absolute local MP4 path (at most 20 MiB).\n' "$input" >&2
    exit 1
  fi
done
export E2E_OUTPUT_DIR
E2E_OUTPUT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/doc-home-e2e.XXXXXX")
export E2E_WEB_ORIGIN="http://127.0.0.1:${E2E_WEB_PORT:-33500}"
export API_INTERNAL_URL="http://127.0.0.1:${E2E_API_PORT:-33501}"
export PORT="${E2E_API_PORT:-33501}"
export NEXT_TELEMETRY_DISABLED=1 MIXED_ASSET_E2E=isolated
api_pid=''; web_pid=''; db_id=''; s3_id=''
cleanup() {
  local result=$?
  trap - EXIT
  for pid in "$web_pid" "$api_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid" 2>/dev/null || true; wait "$pid" || true; fi
  done
  if [[ -n "$s3_id" ]]; then docker rm -fv "$s3_id" >/dev/null || true; fi
  if [[ -n "$db_id" ]]; then docker rm -fv "$db_id" >/dev/null || true; fi
  printf 'Local E2E evidence: %s\n' "$E2E_OUTPUT_DIR"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Reject occupied ports before creating services; never use an unrelated server for QA.
node --input-type=module <<'JS'
import net from 'node:net';
for (const origin of [process.env.E2E_WEB_ORIGIN, process.env.API_INTERNAL_URL]) {
  const url = new URL(origin);
  const server = net.createServer();
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(Number(url.port),'127.0.0.1',resolve); });
  await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
}
JS
docker info >/dev/null
docker image inspect postgres:17-alpine adobe/s3mock:5.2.3 >/dev/null
db_id=$(docker run --pull=never -d -e POSTGRES_USER=doc_home -e POSTGRES_PASSWORD=doc_home_test -e POSTGRES_DB=doc_home_e2e -p 127.0.0.1::5432 postgres:17-alpine)
s3_id=$(docker run --pull=never -d -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=doc-home-e2e -p 127.0.0.1::9090 adobe/s3mock:5.2.3)
export DATABASE_URL="postgresql://doc_home:doc_home_test@$(docker port "$db_id" 5432/tcp)/doc_home_e2e"
export S3_ENDPOINT="http://$(docker port "$s3_id" 9090/tcp)" S3_REGION=us-east-1 S3_BUCKET=doc-home-e2e S3_ACCESS_KEY_ID=local-test S3_SECRET_ACCESS_KEY=local-test
ready=false
for ((i=0;i<60;i++)); do
  if docker exec "$db_id" pg_isready -U doc_home >/dev/null 2>&1 && curl -fsS --max-time 1 "$S3_ENDPOINT/favicon.ico" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then printf 'Disposable storage services did not become ready.\n' >&2; exit 1; fi
pnpm --filter api build
(
  cd apps/api
  node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
  node dist/database/seed.js
  node --input-type=module <<'JS'
import sharp from 'sharp';
import path from 'node:path';
const image=sharp({create:{width:48,height:32,channels:3,background:'#0f766e'}});
await image.clone().png().toFile(path.join(process.env.E2E_OUTPUT_DIR,'test.png'));
await image.clone().jpeg().toFile(path.join(process.env.E2E_OUTPUT_DIR,'test.jpg'));
JS
)
node apps/api/dist/main.js > "$E2E_OUTPUT_DIR/api.log" 2>&1 & api_pid=$!
pnpm --filter web exec panda codegen
pnpm --filter web exec next build --webpack > "$E2E_OUTPUT_DIR/web-build.log" 2>&1
node apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port "${E2E_WEB_PORT:-33500}" > "$E2E_OUTPUT_DIR/web.log" 2>&1 & web_pid=$!
ready=false
for ((i=0;i<60;i++)); do
  if ! kill -0 "$api_pid" 2>/dev/null || ! kill -0 "$web_pid" 2>/dev/null; then printf 'An E2E app stopped; see evidence logs.\n' >&2; exit 1; fi
  if curl -fsS --max-time 1 "$API_INTERNAL_URL/health" >/dev/null 2>&1 && curl -fsS --max-time 2 "$E2E_WEB_ORIGIN" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then printf 'E2E apps did not become ready.\n' >&2; exit 1; fi
pnpm --filter web exec playwright test --config playwright.config.ts
