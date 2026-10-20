#!/usr/bin/env bash
set -euo pipefail

# Dedicated containers, random loopback ports and no user volumes. Never pull images.
# An interrupted/failed test run cleans up only the container IDs created here.
cd "$(dirname "$0")/.."
db_container=''
s3_container=''
cleanup() {
  local result=$?
  trap - EXIT
  if [[ -n "$s3_container" ]]; then docker rm -fv "$s3_container" >/dev/null || true; fi
  if [[ -n "$db_container" ]]; then docker rm -fv "$db_container" >/dev/null || true; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker info >/dev/null
docker image inspect postgres:17-alpine adobe/s3mock:5.2.3 >/dev/null

db_container=$(docker run --pull=never -d \
  -e POSTGRES_USER=doc_home -e POSTGRES_PASSWORD=doc_home_test \
  -e POSTGRES_DB=doc_home_soft_delete_check \
  -p 127.0.0.1::5432 postgres:17-alpine)
s3_container=$(docker run --pull=never -d \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=doc-home-soft-delete-test \
  -p 127.0.0.1::9090 adobe/s3mock:5.2.3)
db_address=$(docker port "$db_container" 5432/tcp)
s3_address=$(docker port "$s3_container" 9090/tcp)
export PHOTO_INTEGRATION_DATABASE_URL="postgresql://doc_home:doc_home_test@${db_address}/doc_home_soft_delete_check"
export PHOTO_INTEGRATION_S3_ENDPOINT="http://${s3_address}"

ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$db_container" pg_isready -U doc_home -d doc_home_soft_delete_check >/dev/null 2>&1 \
    && curl --fail --silent --max-time 1 "${PHOTO_INTEGRATION_S3_ENDPOINT}/favicon.ico" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker logs "$db_container"
  docker logs "$s3_container"
  printf 'Local integration services did not become ready within the startup budget.\n' >&2
  exit 1
fi
pnpm test:unit --runTestsByPath src/assets/project-assets.integration.spec.ts
