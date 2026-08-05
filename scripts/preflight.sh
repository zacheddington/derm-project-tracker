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
# 3. Deployability. The migrations must install a schema onto an empty
# database and nothing else.
#
# Two things can go wrong here and both are quiet. Sample rows can drift
# into a migration during development and end up in the real database on
# day one — a fake resident nobody can explain, or worse, a real one.
# And a migration can start ALTERing an object, which only makes sense
# if something was already deployed; nothing has been, so `0001` must
# stay a from-nothing install.
# ---------------------------------------------------------------------
head_ "Deployability"

# Only statements at the top level count. A trigger function that writes
# to audit_log or people is runtime behaviour, not seed data, and its body
# is dollar-quoted — so strip $$ … $$ regions before looking.
strip_bodies() {
  awk '{ n = gsub(/\$\$/, "&"); if (!inbody) print; if (n % 2 == 1) inbody = !inbody }' "$1"
}

# The only tables a migration may seed are the vocabularies the schema
# cannot function without: projects.work_status has a foreign key into
# work_statuses, so an empty lookup table means nothing can be saved.
ALLOWED_SEED_TABLES='work_statuses|submission_statuses|app_settings'

seed_hits=$(
  for f in supabase/migrations/*.sql; do
    strip_bodies "$f" | sed -e 's/--.*$//' \
      | grep -inE '^[[:space:]]*insert[[:space:]]+into[[:space:]]+[a-z_]+' \
      | grep -viE "insert[[:space:]]+into[[:space:]]+($ALLOWED_SEED_TABLES)\b" \
      | sed "s|^|$f (top level):|"
  done
)

if [ -n "$seed_hits" ]; then
  fail "a migration seeds a table that is not a status vocabulary"
  printf '%s\n' "$seed_hits" | while read -r l; do detail "$l"; done
  detail "Sample data belongs in test/01_tests.sql or the prototype, never in a migration."
else
  pass "migrations seed only the status vocabularies"
fi

# Nothing is deployed, so there is nothing to alter. An ALTER here means
# someone wrote a change-migration against a database that does not exist.
alter_hits=$(
  for f in supabase/migrations/*.sql; do
    strip_bodies "$f" | sed -e 's/--.*$//' \
      | grep -inE '^[[:space:]]*alter[[:space:]]+(table|type)[[:space:]]' \
      | grep -viE 'enable row level security' \
      | sed "s|^|$f:|"
  done
)

if [ -n "$alter_hits" ]; then
  fail "a migration ALTERs an object — the schema is a from-nothing install"
  printf '%s\n' "$alter_hits" | while read -r l; do detail "$l"; done
  detail "Until the schema is deployed, edit 0001 in place instead of adding a migration."
else
  pass "migrations create rather than alter"
fi

# ---------------------------------------------------------------------
# 4. Prototype build. Pages publishes exactly this.
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
# 5. Lint: unreachable code, not style.
#
# One rule that matters here — no unused variables or imports. A removed
# feature leaves its icon import behind, and nothing else in the build
# notices: the bundle still compiles, the tests still pass, and the next
# person to read the file cannot tell residue from something
# load-bearing. Three such leftovers survived a hand audit and were found
# by this in about a second.
# ---------------------------------------------------------------------
head_ "Lint"

if command -v npm >/dev/null 2>&1; then
  lint_log=$(mktemp)
  # `npm ci` already ran in the build section, so dependencies are present.
  if (cd prototype && npm run lint) >"$lint_log" 2>&1; then
    pass "no unused imports or variables"
  else
    fail "lint failed"
    sed 's/\x1b\[[0-9;]*m//g' "$lint_log" | grep -E 'error|warning' | head -20 \
      | while read -r l; do detail "$l"; done
  fi
  rm -f "$lint_log"
else
  skip "lint — npm not found"
fi

# ---------------------------------------------------------------------
# 6. Prototype unit tests.
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
# 7. The client-facing feature list stays true.
#
# docs/FEATURES.md is what the department is handed to understand what
# this does. A feature list describing a button that no longer exists is
# worse than no feature list, and documentation kept true by remembering
# is documentation that drifts. So: if this push changes the interface,
# it has to touch that file too.
#
# The escape hatch is deliberate and deliberately visible. A refactor
# that genuinely changes nothing a user could notice says so in the
# commit message with [no-user-impact], which leaves a reviewable record
# of the claim rather than a silently skipped check.
# ---------------------------------------------------------------------
head_ "User-facing documentation"

UI_PATHS='^prototype/src/(ProjectTracker\.jsx|components/|lib/(domain|projects|exportCsv)\.js)'

base_ref=""
for candidate in "@{upstream}" "origin/main"; do
  if git rev-parse --verify --quiet "$candidate" >/dev/null 2>&1; then
    base_ref="$candidate"; break
  fi
done

if [ -z "$base_ref" ]; then
  skip "features doc — no upstream branch to compare against yet"
elif [ -z "$(git log --oneline "$base_ref"..HEAD 2>/dev/null)" ]; then
  pass "features doc — nothing new to push"
else
  changed=$(git diff --name-only "$base_ref"...HEAD)
  ui_changed=$(printf '%s\n' "$changed" | grep -E "$UI_PATHS" | grep -v '\.test\.' || true)
  doc_changed=$(printf '%s\n' "$changed" | grep -Fx 'docs/FEATURES.md' || true)
  # grep -c prints 0 and exits 1 when nothing matches, so keep the count
  # and swallow the status; default to 0 if anything unexpected happens.
  waived=$(git log "$base_ref"..HEAD --format='%B' | grep -Fc '[no-user-impact]' || true)
  waived=${waived:-0}

  if [ -z "$ui_changed" ]; then
    pass "features doc — this push does not touch the interface"
  elif [ -n "$doc_changed" ]; then
    pass "features doc updated alongside the interface"
  elif [ "$waived" -gt 0 ]; then
    pass "features doc — waived by [no-user-impact] in a commit message"
  else
    fail "the interface changed but docs/FEATURES.md did not"
    printf '%s\n' "$ui_changed" | head -8 | while read -r l; do detail "$l"; done
    detail "Remove what is gone, correct what changed, add what is new, and move the date."
    detail "If nothing a user could notice changed, say [no-user-impact] in the commit message."
  fi
fi

# ---------------------------------------------------------------------
# 8. Database suite: stub -> 0001 -> 0002 -> 0003 -> tests.
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
