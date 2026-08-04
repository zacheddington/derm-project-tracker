#!/usr/bin/env bash
# =====================================================================
# Preflight — everything that must pass before pushing.
#
#   ./scripts/preflight.sh              run every check it can
#   ./scripts/preflight.sh --skip-db    skip the SQL suite explicitly
#   ./scripts/preflight.sh --require-db fail (don't skip) if psql is missing
#
# CI runs this same script with --require-db, so a green local run with a
# skipped database section is not the same promise CI makes. See ci.yml.
#
# The database section needs a scratch Postgres 16. Point DATABASE_URL at
# one; otherwise the script tries a local server on the default port.
# It is DESTRUCTIVE to whatever database it connects to — it loads the
# schema from nothing. Never aim it at a database holding real data.
# =====================================================================

set -uo pipefail

cd "$(dirname "$0")/.."

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
[ -t 1 ] || { RED=""; GREEN=""; YELLOW=""; DIM=""; OFF=""; }

FAILED=0
SKIPPED=0

pass() { printf '%s  PASS%s  %s\n' "$GREEN" "$OFF" "$1"; }
fail() { printf '%s  FAIL%s  %s\n' "$RED" "$OFF" "$1"; FAILED=$((FAILED + 1)); }
skip() { printf '%s  SKIP%s  %s\n' "$YELLOW" "$OFF" "$1"; SKIPPED=$((SKIPPED + 1)); }
head_() { printf '\n%s== %s%s\n' "$DIM" "$1" "$OFF"; }
detail() { printf '        %s\n' "$1"; }

SKIP_DB=0
REQUIRE_DB=0
for arg in "$@"; do
  case "$arg" in
    --skip-db)    SKIP_DB=1 ;;
    --require-db) REQUIRE_DB=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Files git actually tracks. Anything ignored is irrelevant to a push.
tracked() { git ls-files 2>/dev/null || true; }

# ---------------------------------------------------------------------
# 1. Secrets. The repo is public; these are the ones that would matter.
# ---------------------------------------------------------------------
head_ "Secrets"

if tracked | grep -qE '(^|/)\.env($|\.)'; then
  fail "a .env file is tracked by git"
  tracked | grep -E '(^|/)\.env($|\.)' | while read -r f; do detail "$f"; done
else
  pass "no .env file is tracked"
fi

# A Supabase service_role key is a JWT and bypasses RLS entirely. The anon
# key is also a JWT and is safe to commit, so this matches the JWT shape
# and asks a human to look rather than trying to tell them apart.
if tracked | xargs -r grep -lE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' 2>/dev/null | grep -q .; then
  fail "a JWT-shaped string is committed — confirm it is the anon key, never service_role"
  tracked | xargs -r grep -lE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' 2>/dev/null \
    | while read -r f; do detail "$f"; done
else
  pass "no JWT-shaped string is committed"
fi

if tracked | grep -qE '\.(dump|sql\.gz)$|^backups/'; then
  fail "a database dump is tracked — dumps contain real project data once in use"
  tracked | grep -E '\.(dump|sql\.gz)$|^backups/' | while read -r f; do detail "$f"; done
else
  pass "no database dump is tracked"
fi

# The stub invents Supabase's auth schema and roles. Applying it to a real
# project would collide with the managed originals.
if grep -q '00_supabase_stub' supabase/migrations/*.sql 2>/dev/null; then
  fail "a migration references the local-only test stub"
else
  pass "migrations do not reference the local-only test stub"
fi

# ---------------------------------------------------------------------
# 2. No PHI. The rule the whole design rests on, checked mechanically.
#
# Comments are stripped first: the migrations discuss these identifiers
# at length precisely to explain why they are absent, and that prose must
# not trip the guard. Only live SQL is searched.
# ---------------------------------------------------------------------
head_ "No PHI"

PHI_IDENTS='patient_name|patient_mrn|medical_record|\bmrn\b|date_of_birth|birth_date|\bdob\b|date_of_service|service_date|encounter_date|admission_date|\bssn\b|social_security'

phi_hits=$(
  for f in supabase/migrations/*.sql; do
    sed -e 's/--.*$//' "$f" | grep -inE "$PHI_IDENTS" | sed "s|^|$f:|"
  done
)

if [ -n "$phi_hits" ]; then
  fail "a PHI identifier appears in live migration SQL"
  printf '%s\n' "$phi_hits" | while read -r l; do detail "$l"; done
  detail "This is not a lint to silence. See CLAUDE.md — the columns must not exist."
else
  pass "no PHI identifier appears in live migration SQL"
fi

# year_seen is the field most likely to get "improved" into a full date.
# A date of service is an explicit HIPAA identifier; the year alone is not.
if grep -qE '^\s*year_seen\s+smallint\b' supabase/migrations/0001_schema.sql; then
  pass "year_seen is still year-only (smallint)"
else
  fail "year_seen is no longer a smallint — a full date of service is PHI"
fi

# ---------------------------------------------------------------------
# 3. Prototype build. Pages publishes exactly this.
# ---------------------------------------------------------------------
head_ "Prototype build"

if command -v npm >/dev/null 2>&1; then
  build_log=$(mktemp)
  # npm ci, not npm install: the lockfile is what CI and Pages build from,
  # so a local run that quietly resolves different versions proves nothing.
  if (cd prototype && npm ci --no-audit --no-fund && npm run build) >"$build_log" 2>&1; then
    pass "prototype builds"
    detail "$(sed 's/\x1b\[[0-9;]*m//g' "$build_log" | grep -E 'built in|^dist/' | tail -4 | tr '\n' ' ')"
  else
    fail "prototype build failed"
    tail -25 "$build_log" | while read -r l; do detail "$l"; done
  fi
  rm -f "$build_log"
else
  skip "prototype build — npm not found"
fi

# ---------------------------------------------------------------------
# 4. Prototype unit tests.
#
# The list behaviour — filtering, sorting, pagination, staleness
# thresholds, save validation, case-ID issuing — lives in
# prototype/src/lib as pure functions precisely so it can be checked
# here rather than by clicking around.
# ---------------------------------------------------------------------
head_ "Prototype tests"

if command -v npm >/dev/null 2>&1; then
  test_log=$(mktemp)
  # `npm ci` already ran in the build section, so dependencies are present.
  if (cd prototype && npm test) >"$test_log" 2>&1; then
    n=$(sed 's/\x1b\[[0-9;]*m//g' "$test_log" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
    pass "prototype tests — ${n:-?} assertions"
  else
    fail "prototype tests failed"
    sed 's/\x1b\[[0-9;]*m//g' "$test_log" | grep -E 'FAIL|✕|AssertionError|Expected|Received' | head -20 \
      | while read -r l; do detail "$l"; done
  fi
  rm -f "$test_log"
else
  skip "prototype tests — npm not found"
fi

# ---------------------------------------------------------------------
# 5. Database suite: stub -> 0001 -> 0002 -> 0003 -> tests.
#
# Every assertion prints PASS or aborts the run, so ON_ERROR_STOP plus a
# zero exit status is the whole verdict.
# ---------------------------------------------------------------------
head_ "Database suite"

if [ "$SKIP_DB" -eq 1 ]; then
  skip "database suite — --skip-db"
elif ! command -v psql >/dev/null 2>&1; then
  if [ "$REQUIRE_DB" -eq 1 ]; then
    fail "database suite — psql not found and --require-db was given"
  else
    skip "database suite — psql not found (CI runs it; see ci.yml)"
    detail "Install Postgres 16 client tools, or let CI cover this."
  fi
else
  DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/derm_tracker_test}"

  if ! psql "$DB_URL" -c 'select 1' >/dev/null 2>&1; then
    if [ "$REQUIRE_DB" -eq 1 ]; then
      fail "database suite — cannot connect to $DB_URL"
    else
      skip "database suite — cannot connect (set DATABASE_URL to a scratch db)"
    fi
  else
    sql_log=$(mktemp)
    ok=1
    for f in test/00_supabase_stub.sql \
             supabase/migrations/0001_schema.sql \
             supabase/migrations/0002_rls.sql \
             supabase/migrations/0003_views.sql \
             test/01_tests.sql; do
      if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >>"$sql_log" 2>&1; then
        fail "database suite — $f"
        tail -20 "$sql_log" | while read -r l; do detail "$l"; done
        ok=0
        break
      fi
    done
    if [ "$ok" -eq 1 ]; then
      n=$(grep -c 'PASS' "$sql_log" || true)
      pass "database suite — $n assertions"
    fi
    rm -f "$sql_log"
  fi
fi

# ---------------------------------------------------------------------
head_ "Result"

if [ "$FAILED" -gt 0 ]; then
  printf '%s%d check(s) failed.%s Do not push.\n\n' "$RED" "$FAILED" "$OFF"
  exit 1
fi

if [ "$SKIPPED" -gt 0 ]; then
  printf '%sAll checks passed, %d skipped.%s CI runs the full set.\n\n' "$YELLOW" "$SKIPPED" "$OFF"
else
  printf '%sAll checks passed.%s\n\n' "$GREEN" "$OFF"
fi
