#!/usr/bin/env bash
# Per-boot reconciliation: start PostgreSQL, ensure the app role/database exist,
# and apply the (idempotent) schema + seed. Tolerates restarts and returns.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="$PG_BIN:$PATH"
PGDATA="${PGDATA:-$HOME/.local/share/ukarts-pgdata}"

# Cluster may be absent if start runs without a prior install.
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "==> Initializing Postgres cluster at $PGDATA…"
  mkdir -p "$(dirname "$PGDATA")"
  initdb -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 >/dev/null
  {
    echo "unix_socket_directories = '/tmp'"
    echo "listen_addresses = 'localhost'"
    echo "port = 5432"
  } >> "$PGDATA/postgresql.conf"
fi

# Start the server only if not already running (idempotent).
if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  echo "==> Starting PostgreSQL…"
  pg_ctl -D "$PGDATA" -l /tmp/pg.log -w start
else
  echo "==> PostgreSQL already running."
fi

# Wait for readiness.
for _ in $(seq 1 30); do
  if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then break; fi
  sleep 1
done
pg_isready -h localhost -p 5432 >/dev/null 2>&1 || {
  echo "PostgreSQL did not become ready" >&2
  cat /tmp/pg.log >&2 || true
  exit 1
}

# Ensure application role and database exist.
if ! psql -h localhost -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='ukarts'" | grep -q 1; then
  psql -h localhost -U postgres -c "CREATE ROLE ukarts LOGIN PASSWORD 'ukarts' CREATEDB;"
fi
if ! psql -h localhost -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='ukarts'" | grep -q 1; then
  psql -h localhost -U postgres -c "CREATE DATABASE ukarts OWNER ukarts;"
fi

# Apply schema + seed (idempotent).
export DATABASE_URL="${DATABASE_URL:-postgres://ukarts:ukarts@localhost:5432/ukarts}"
echo "==> Applying schema and seed…"
npm run db:setup

# Next.js comes up only after Postgres is ready, so the dev server does not
# race the database. Hold it in the foreground. A rerun leaves an existing
# listener alone.
if (echo >/dev/tcp/127.0.0.1/3000) >/dev/null 2>&1; then
  echo "==> Next.js already listening on port 3000."
  exit 0
fi

echo "==> Starting Next.js dev server on http://0.0.0.0:3000…"
exec npm run dev -- --hostname 0.0.0.0 --port 3000
