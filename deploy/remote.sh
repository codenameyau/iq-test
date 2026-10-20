#!/usr/bin/env bash
# Rolls the already-built image onto this machine. The database is the
# Postgres listening on localhost; this script does not install Postgres
# and does not touch any other stack.
set -euo pipefail

: "${IMAGE:?IMAGE is required}"
: "${DATABASE_URL_B64:?DATABASE_URL_B64 is required}"

install -d -m 700 /opt/iq-test
umask 077
{
  printf 'DATABASE_URL=%s\n' "$(printf '%s' "$DATABASE_URL_B64" | base64 -d)"
  printf 'PORT=%s\n' "${PORT:-3300}"
} > /opt/iq-test/.env

docker pull "$IMAGE"
docker rm -f iq-test-web >/dev/null 2>&1 || true
docker run -d \
  --name iq-test-web \
  --restart unless-stopped \
  --network host \
  --env-file /opt/iq-test/.env \
  -e STATIC_DIR=/app/dist \
  "$IMAGE" >/dev/null

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:${PORT:-3300}/api/health" >/dev/null; then
    echo "iq-test-web is healthy"
    exit 0
  fi
  sleep 2
done
echo "iq-test-web did not become healthy" >&2
docker logs --tail 50 iq-test-web >&2 || true
exit 1
