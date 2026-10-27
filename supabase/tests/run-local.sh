#!/usr/bin/env bash
# Runs the migrations, seed and permission tests against a throwaway
# database on a plain Postgres 15+ (no Docker or Supabase needed).
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=margins_test_$$
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT

run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

run supabase/tests/local-stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  run "$f"
done
echo "seed: seed.sql"
run supabase/seed.sql
echo "tests: permissions.sql"
psql -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/permissions.sql 2>&1 | sed -n 's/.*NOTICE:  //p'
