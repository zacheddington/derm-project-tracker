# Dermatology Project Tracker

A shared registry where residents and faculty record and track scholarly projects.
Built for the UMMC Department of Dermatology against an internal specification (v0.1).

**Live prototype:** <https://zacheddington.github.io/derm-project-tracker/>

---

## No protected health information

This system stores none, by design, and that is a structural property rather than a
policy. Case reports carry a system-generated `case_number` and nothing else. There are no
columns for patient name, MRN, date of birth, or date of service. Date of service is
an explicit HIPAA identifier, and date plus attending plus diagnosis is a self-decoding
lookup key in a department this size.

The mapping from case number to patient lives in the EMR or REDCap and is never stored in,
referenced by, or linked from this repository or its database.

The hosted prototype runs entirely in the browser on invented sample data. It has no
backend, saves nothing, and transmits nothing.

---

## What is here

```
CLAUDE.md               project context loaded by Claude Code every session
docs/SPEC.md            the original build specification
docs/DECISIONS.md       what was decided and why, plus the open questions (one copy)
docs/FEATURES.md        the client-facing rundown of what the site does
docs/AUDIT.md           scratchpad for an in-progress audit; cleared on commit
prototype/              Vite + React UI prototype (deployed to Pages)
  src/ProjectTracker.jsx    the app: list, filters, table, pagination
  src/lib/                  pure logic, no React — this is what the tests cover
    domain.js               vocabularies, people, academic year, case numbers
    projects.js             filter, sort, paginate, staleness, validation
    exportCsv.js            the CSV handoff (§7), separated from the download
    supabaseWrite.js        write guards for the future app — see DECISIONS.md
    *.test.js               350 assertions: logic, schema parity, components
  src/components/           panels, with jsdom tests beside them
    primitives.jsx          controls with no domain knowledge (Field, Modal, DateInput)
    NewPersonForm.jsx       "add someone to the roster", shared by the picker and roster
  eslint.config.js          one rule: no unused imports or variables. Not a style guide.
supabase/migrations/
  0001_schema.sql       tables, constraints, case-number generation, search, audit log
  0002_rls.sql          role helpers, auth linking, Row Level Security policies
  0003_views.sql        CSV export, venue export, ACGME view, dashboard counts
test/
  00_supabase_stub.sql  local stand-in for Supabase's auth schema (not deployed)
  01_tests.sql          76 behavioural assertions
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

## Reading the schema

Names are meant to be self-explanatory; these are the few that carry departmental
meaning rather than general meaning.

| name | what it is |
|---|---|
| `staff_position` | What someone **is**: resident, fellow, attending, medical student, research fellow, external collaborator. |
| `permission_level` | What someone **may do** in this application: `member` or `admin`. Independent of `staff_position` — an attending is not automatically an admin. |
| `employment_end_date` | Last day of employment; `NULL` means still here. People are never deleted, so attribution survives residents graduating. `is_currently_employed(date)` is the single expression of the rule. |
| `academic_year` | Integer start year of the July 1 – June 30 year. `2026` = AY 2026–2027. |
| `pgy_level` | Postgraduate year, 1–9. Residents only. Standard US residency term. |
| `qa_qi` | Quality Assurance / Quality Improvement — a departmental process-improvement project, not a research study. The term the department and ACGME both use, so it is kept verbatim. |
| `case_number` | Human-readable sequence, `CR-<academic year>-<nnn>`, restarting each year. **Not** a foreign key, and not a patient identifier — the mapping to a patient lives only in the EMR. |
| `is_terminal` | A status nothing normally moves out of. Used for reporting; never enforced. |
| `is_selectable` | Whether a status is still offered in pickers. Retiring one must not rewrite the projects already in it. |
| `external_position` | Free text, external collaborators only: what they do and where. |
| `other_venue_description` | Free text, `venue_type = 'other'` only. A CHECK stops it surviving a change of kind. |

The interface uses these same words. `prototype/src/lib/schema-parity.test.js` reads
`0001_schema.sql` and fails the build if any vocabulary drifts.

**Who can edit what:** any member may create, edit and archive **any** project and its
authorship — this is a shared departmental record, and `audit_log` records every change
with actor and before/after values. Hard delete, roster permission changes and merges are
admin-only.

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
update people set permission_level = 'admin', staff_position = 'research_fellow'
where email = 'coordinator@umc.edu';
```

**Tests:** load stub → 0001 → 0002 → 0003 → tests against any scratch Postgres 16.
Every assertion prints PASS or aborts the run.

---

## Before you push

```bash
./scripts/preflight.sh
```

Seven sections, in the order a mistake costs the most:

1. **Secrets** — no `.env`, no JWT-shaped string, no database dump tracked by git, and
   no migration referencing the local-only test stub.
2. **No PHI** — no forbidden identifier in live migration SQL, and `year_seen` is still
   a `smallint`. Comments are stripped before the search, because the migrations discuss
   these identifiers at length in order to explain why they are absent. This is the one
   rule the whole design rests on, so it is checked mechanically rather than remembered.
3. **Prototype build** — `npm ci && npm run build`, the same thing Pages publishes.
4. **Lint** — no unused imports or variables. Deliberately one rule and not a style
   guide: an unused import is how a deleted feature leaves a trace, and it is invisible
   to everything else in the build.
5. **Prototype tests** — 350 assertions over `prototype/src/lib` and `src/components`, including a parity
   check that reads `0001_schema.sql` and fails if any vocabulary has drifted from the
   interface.
6. **User-facing documentation** — a push that changes the interface must also update
   `docs/FEATURES.md`, the feature rundown the department is handed. A feature list
   describing a button that no longer exists is worse than no feature list. A refactor
   with no user-visible effect declares `[no-user-impact]` in its commit message.
7. **Database suite** — stub → 0001 → 0002 → 0003 → behavioural assertions, including the new constraints.

Add to the tests whenever you change behaviour. The list logic lives in
`prototype/src/lib` as pure functions specifically so a scenario can be written for it
instead of clicked through by hand:

```bash
cd prototype && npm test          # once
cd prototype && npx vitest        # watch, while working
```

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
Pages is already enabled here, with Settings → Pages → Source set to **GitHub Actions**.
The workflow derives the base path from the repository name, so renaming the repo will
not break every asset URL.

The deploy workflow is filtered to `prototype/**`, which is what you want day to day —
a documentation commit should not redeploy the site. The consequence is that it does
*not* fire on a push that changes nothing under `prototype/`, including the very first
push to a new repository. Run it by hand that once:

```bash
gh workflow run deploy-pages.yml --ref main
```

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

## Why it is built this way

Every design decision, and the reasoning behind it, is in **[docs/DECISIONS.md](docs/DECISIONS.md)**
— one entry per decision, dated. The list of questions still waiting on a human answer is
the **Still open** section at the bottom of that same file, and it is the only copy. It
used to be restated here, in `CLAUDE.md`, and in the audit, and the four copies had
already drifted to different lengths.

**The one thing to know before building the frontend:** Row Level Security denies a write
by matching **zero rows**, not by raising an error. A blocked `UPDATE` returns success
with nothing changed, and Supabase clients report that as an empty array rather than an
exception. The app must treat "0 rows affected" as "not permitted" and say so, or users
will watch edits silently evaporate. Column-level guards do raise properly; only RLS is
quiet. `prototype/src/lib/supabaseWrite.js` exists so this cannot be got wrong.

---

## Going to production

### Installing the database

Against a brand-new empty Postgres 16 / Supabase project, in this order:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_views.sql
```

**Do not run `test/00_supabase_stub.sql`.** It invents Supabase's `auth` schema and the
`anon` / `authenticated` / `service_role` roles for local testing; against a real project
it collides with the managed originals.

**Do not run `test/01_tests.sql` against anything real.** It is destructive and creates
fake people and projects.

Then name the first admin — the one manual step:

```sql
update people set permission_level = 'admin', staff_position = 'research_fellow'
where email = 'coordinator@umc.edu';
```

This works from the SQL editor because the privilege guards step aside when `auth.uid()`
is null. Through the API it would be refused, which is the point.

Set the allowed domains if `umc.edu` is not right:

```sql
update app_settings set value = '["umc.edu"]'::jsonb where key = 'allowed_email_domains';
```

### Launch checklist

Tasks, not decisions — the open *questions* are in `docs/DECISIONS.md`.

- [ ] Move the repo and hosting to a departmental owner. Longest-lead item, and nothing
      in the code can fix it.
- [ ] Turn on backups and **test a restore**. A backup nobody has restored is a hypothesis.
- [ ] Put the `service_role` key in the host's secret store — never in the repo, never in
      a `NEXT_PUBLIC_` variable. Preflight catches a committed JWT; it cannot catch a
      leaked one.
- [ ] Require CI to pass before merge. Today CI reports and nothing blocks; a branch
      ruleset on `main` makes the gate real.
- [ ] Add a LICENSE, or record the decision that default copyright is right.

### Carry into the Next.js app

- **Use `supabaseWrite.js` for every write.** See above; this is the single most likely
  production bug in this codebase.
- **CSV escaping is client-side today.** A server-side export needs the same
  formula-injection neutralisation — a cell starting `=`, `+`, `-`, `@`, tab or CR gets a
  leading apostrophe. `project_export` does not do it for you.
- **The schema calls `notes` "Markdown-rendered".** The prototype renders plain text, so
  there is no XSS today. The moment a real Markdown renderer is added, raw HTML must be
  disabled or sanitised. This is the most likely way XSS enters this app.
- **Do not insert a type-specific detail row until its required fields are filled.**
  `diagnosis`, `why_unique` and each `description` are `NOT NULL`, and quick capture
  deliberately collects none of them.
