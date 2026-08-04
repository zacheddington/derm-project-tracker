# Dermatology Project Tracker

A shared registry where residents and faculty record and track scholarly projects.
Built for the UMMC Department of Dermatology against an internal specification (v0.1).

**Live prototype:** <https://zacheddington.github.io/derm-project-tracker/>

---

## No protected health information

This system stores none, by design, and that is a structural property rather than a
policy. Case reports carry a system-generated `case_id` and nothing else. There are no
columns for patient name, MRN, date of birth, or date of service. Date of service is
an explicit HIPAA identifier, and date plus attending plus diagnosis is a self-decoding
lookup key in a department this size.

The mapping from case ID to patient lives in the EMR or REDCap and is never stored in,
referenced by, or linked from this repository or its database.

The hosted prototype runs entirely in the browser on invented sample data. It has no
backend, saves nothing, and transmits nothing.

---

## What is here

```
CLAUDE.md               project context loaded by Claude Code every session
docs/SPEC.md            the original build specification
docs/DECISIONS.md       what was decided and why
prototype/              Vite + React UI prototype (deployed to Pages)
  src/ProjectTracker.jsx
supabase/migrations/
  0001_schema.sql       tables, constraints, case-ID generation, search, audit log
  0002_rls.sql          role helpers, auth linking, Row Level Security policies
  0003_views.sql        CSV export, venue export, ACGME view, dashboard counts
test/
  00_supabase_stub.sql  local stand-in for Supabase's auth schema (not deployed)
  01_tests.sql          45 behavioral assertions
scripts/
  preflight.sh          everything that must pass before pushing
.github/workflows/
  ci.yml                runs preflight, database suite included
  deploy-pages.yml      builds and publishes the prototype
```

The Next.js application is not built yet. The prototype is a single component with mock
data — no routing, no auth, not wired to Supabase. The schema was settled first so the
app gets built against something stable.

---

## Running it

**Prototype, locally:**

```bash
cd prototype
npm install
npm run dev
```

**Database:** run the migrations against a Supabase project in order — `0001`, `0002`,
`0003`. Do *not* run `test/00_supabase_stub.sql`; Supabase provides the `auth` schema
and the `anon` / `authenticated` / `service_role` roles itself. Then name your first
admin:

```sql
update people set app_role = 'admin', role = 'research_coordinator'
where email = 'coordinator@umc.edu';
```

**Tests:** load stub → 0001 → 0002 → 0003 → tests against any scratch Postgres 16.
Every assertion prints PASS or aborts the run.

---

## Before you push

```bash
./scripts/preflight.sh
```

Four sections, in the order a mistake costs the most:

1. **Secrets** — no `.env`, no JWT-shaped string, no database dump tracked by git, and
   no migration referencing the local-only test stub.
2. **No PHI** — no forbidden identifier in live migration SQL, and `year_seen` is still
   a `smallint`. Comments are stripped before the search, because the migrations discuss
   these identifiers at length in order to explain why they are absent. This is the one
   rule the whole design rests on, so it is checked mechanically rather than remembered.
3. **Prototype build** — `npm ci && npm run build`, the same thing Pages publishes.
4. **Database suite** — stub → 0001 → 0002 → 0003 → 45 assertions.

The database section needs a scratch Postgres 16. Set `DATABASE_URL`, or let it skip
locally and rely on CI. **It is destructive to whatever database it connects to** — it
builds the schema from nothing, so never aim it at anything holding real data.

`.github/workflows/ci.yml` runs the identical script with `--require-db` against a
Postgres 16 service container on every push and pull request, so the database section
cannot be quietly skipped on the way in. A local run that skipped it has not made the
promise CI makes.

If the PHI section fails, that is not a lint to silence.

---

## Deployment

GitHub Pages hosts the **prototype only**, via `.github/workflows/deploy-pages.yml`.
To enable it: Settings → Pages → Source → **GitHub Actions**. The first push to `main`
publishes it. The workflow derives the base path from the repository name, so renaming
the repo will not break every asset URL.

The production application is specified for Vercel, not Pages, and that should not
change without thought. Pages serves static files and nothing else: no server-side
rendering, no API routes, no middleware, no server-side redirect to a login screen. A
Next.js app talking to Supabase *can* be exported statically and served from Pages,
because authentication and data access both happen client-side against Supabase — but
you give up every server-side option permanently, and Vercel's free tier already covers
this scale with automatic HTTPS and Git deploys.

Use Pages for what it is genuinely good at here: a zero-friction link you can send the
program coordinator and faculty so they can click through the interface and give
feedback before anyone writes production code.

---

## About this being a public repository

**Safe to commit:** the migrations, the RLS policies, the prototype, and — once the real
app exists — the Supabase project URL and the `anon` key. The anon key is designed to be
public; it is a client identifier, not a secret. What actually protects the data is Row
Level Security, which is enforced in the database and covered by the test suite. Note
that `0002_rls.sql` revokes everything from the `anon` role, so that key alone opens
nothing at all.

**Never commit:** the `service_role` key, which bypasses RLS entirely and would hand
over the whole database. Any `.env` file. Any `pg_dump` taken after the tracker is in
real use — those contain live project data, resident names, and unpublished work.
`.gitignore` covers all three, but the habit matters more than the file.

**Worth deciding deliberately:** whether this belongs on a personal account at all. The
specification (§11) says hosting, database, and domain accounts should be registered to
a departmental email rather than a personal or resident one, because residents graduate
and the accounts should not leave with them. A personal GitHub repository is the same
problem wearing a different hat. A departmental organization, or an early transfer plan
with a named successor, resolves it.

**Licensing is unset.** There is no LICENSE file, so default copyright applies and
nobody can reuse this. That is the safe default until someone confirms who owns work
product created for a UMMC department — likely a question for the department, not for
whoever wrote the code.

---

## Decisions taken from the spec's open list

Each is reversible.

**`project_venues` ships in v1.** The table costs almost nothing in SQL, and the seed
data contains the case it exists for: a poster accepted while the manuscript is still in
revision. Collapsing that into one field loses information you cannot reconstruct.

**Status vocabularies are lookup tables, not Postgres enums**, so "editable by admins
without a code change" is literally true — a native enum would need `ALTER TYPE`, which
is a migration. Everything genuinely fixed stays a native enum. Transitions are enforced
nowhere; any status is settable from any other, and there is a test for moving backwards.

**Type-specific fields live in four 1:1 child tables**, not nullable columns. It is the
only way the fields the spec marks required — `diagnosis`, `why_unique`, `description` —
can actually be `NOT NULL`. `project_export` flattens them back to one row per project
for CSV.

**Zero Postgres extensions.** `gen_random_uuid()` has been core since PG13 and email
case-insensitivity is a normalizing trigger rather than `citext`, so the `pg_dump`
restores on any stock Postgres. That is the handoff criterion.

**Academic year is the July 1 start year.** `2026` means AY 2026–2027.
`academic_year_of(date)` is the single source of truth.

---

## One thing to know before building the frontend

Row Level Security denies a write by matching **zero rows**, not by raising an error. A
blocked `UPDATE` returns success with nothing changed, and Supabase clients report that
as an empty array rather than an exception. The app must treat "0 rows affected" as
"not permitted" and say so, or users will watch edits silently evaporate. Column-level
guards do raise properly; only RLS is quiet.

---

## Still open

1. **App registration from UMMC IT** for institutional SSO — the longest external lead
   time. Start it even if magic link ships first; switching is Supabase config, not a
   rewrite.
2. **ACGME export fields.** `acgme_scholarly_activity` is a best guess and marked as
   such. Ask the program coordinator what she assembles by hand today. It is a view
   precisely so reshaping it is a one-file change.
3. **Confirm the case-ID mapping location** — REDCap or an EMR patient list. Nothing in
   the code depends on the answer, but the design is not complete until that mapping has
   a documented home.
4. **Whether UMMC IT wants a security review** for a de-identified, unbranded site on
   external hosting.
5. **Brand guide hex values.** Every color comes from the `brand` object at the top of
   `ProjectTracker.jsx`; drop the real values in and the whole interface follows. No
   logo, seal, or wordmark is used.
6. **Initial admins, and a named successor.**
