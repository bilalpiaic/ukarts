#!/usr/bin/env bash
# Idempotent repository setup: install PostgreSQL (if missing), Node deps, and
# initialize a local Postgres data directory. Safe to run repeatedly.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. System dependency: PostgreSQL server + client tools.
if [ ! -d /usr/lib/postgresql ]; then
  echo "==> Installing PostgreSQL…"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="$PG_BIN:$PATH"

# 2. Node dependencies (prefer the reproducible lockfile install).
echo "==> Installing Node dependencies…"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# 3. Initialize the local Postgres cluster (durable state) if absent.
PGDATA="${PGDATA:-$HOME/.local/share/ukarts-pgdata}"
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

echo "==> install complete."
