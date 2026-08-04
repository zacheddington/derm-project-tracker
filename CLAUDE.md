# Dermatology Project Tracker

Shared registry where UMMC dermatology residents and faculty record and track scholarly
projects. Built against `docs/SPEC.md`. Decision history is in `docs/DECISIONS.md`.

## The one rule that overrides everything

**This system stores no protected health information.** Not "avoids where practical" —
the columns do not exist and must not be added. Never introduce a field for patient
name, MRN, date of birth, or date of service, even if asked casually mid-task, and
never widen `year_seen` into a full date. Date of service is an explicit HIPAA
identifier, and date + attending + diagnosis re-identifies a patient in a department
this size.

Case reports carry a generated `case_number` and nothing else. The mapping to a patient
lives in the EMR or REDCap and is never stored here, referenced, or linked.

If a request would need PHI, stop and say so rather than working around it. That is a
scope change requiring a BAA, IT security review, and most likely REDCap instead of
this application.

## Layout

- `supabase/migrations/` — `0001` schema, `0002` RLS and auth, `0003` reporting views.
  Apply in order.
- `test/01_tests.sql` — 51 behavioral assertions. `test/00_supabase_stub.sql` is a local
  stand-in for Supabase's `auth` schema and roles; **never apply it to a real project.**
- `prototype/` — Vite + React UI prototype, browser-only, mock data, no backend.
  `src/lib/` holds the list logic as pure functions with `*.test.js` beside them;
  `src/components/` holds the panels. Put new behaviour in `lib/` and write the scenario.
- `scripts/preflight.sh` — the pre-push gate. `.github/workflows/ci.yml` runs the same
  script with `--require-db` on every push and PR.
- `.github/workflows/deploy-pages.yml` — publishes the prototype to GitHub Pages.

The Next.js application does not exist yet. That is the next block of work.

## Commands

```bash
./scripts/preflight.sh                         # must pass before pushing anything
cd prototype && npm install && npm run dev     # prototype, local
cd prototype && npm test                       # 119 assertions over src/lib
```

`preflight.sh` checks, in order: no secrets or dumps tracked; no PHI identifier in live
migration SQL and `year_seen` still `smallint`; the prototype builds; the database suite
passes. It skips the database section when it cannot reach Postgres and says so — CI
runs it with `--require-db`, so a green local run with a skip is a weaker claim.

Database tests need a scratch Postgres 16. Load in order: stub → 0001 → 0002 → 0003 →
tests. Every assertion prints PASS or aborts the run. Set `DATABASE_URL` and preflight
does it for you — **destructively**, so never point it at a database holding real data.

## Conventions that differ from the obvious default

- **Statuses are lookup tables, not Postgres enums.** `work_statuses` and
  `submission_statuses` must stay admin-editable without a migration. Do not convert
  them to native enums. Everything genuinely fixed — project type, IRB status, venue
  type — is a native enum and should stay one.
- **Status transitions are never enforced.** Any status is settable from any other.
  Real projects move backwards. Do not add transition guards.
- **Type-specific fields live in four 1:1 child tables**, not nullable columns on
  `projects`. This is what lets `diagnosis`, `why_unique`, and `description` be
  `NOT NULL`. Do not flatten them into `projects`; `project_export` already flattens
  them for CSV.
- **Zero Postgres extensions.** `gen_random_uuid()` is core; email case-insensitivity is
  a normalizing trigger, not `citext`. Keep it that way — a stock-Postgres `pg_dump`
  restore is the handoff requirement.
- **Academic year is the July 1 start year** as an integer. `2026` means AY 2026–2027.
  `academic_year_of(date)` is the single source of truth. Case numbers follow it:
  `CR-2026-014`.
- **Soft delete by default.** "Delete" sets `archived_at`. Hard delete is admin-only and
  needs a confirmation step in the UI.
- **A case number is issued from the highest already used, never from a count.** Counting
  reissues a number the moment a case report is archived or retyped. Once issued, a case
  number is never renumbered or reissued — the sequence is a count of case reports opened
  that year, and reusing a number makes it lie.
- **Authors can be emptied in the editor but not saved empty.** Removing the last chip is
  allowed on purpose: you have to be able to take the wrong name off before adding the
  right one. `validateProject` is the gate, and it raises a dialog rather than silently
  disabling Save.
- **Any member may edit any project — in the prototype and in RLS.** Authorship is a
  property of the project, not a lock on it. `audit_log` is what makes this safe, so do
  not reintroduce an author-only edit gate on either side. Hard delete stays admin-only,
  because that is the one change the audit log cannot undo.
- **Roster edits are still self-or-admin in RLS** (`people_update_self`). The prototype
  has no sign-in at all, so it cannot model this; do not read the prototype's open roster
  as a decision to loosen the policy.
- **The UI and the database use the same words, and a test enforces it.**
  `prototype/src/lib/schema-parity.test.js` reads `0001_schema.sql` and asserts that every
  enum and lookup vocabulary matches `domain.js` exactly, in the same order. Adding a
  status or a project type to one and not the other fails the build. Nothing is deployed
  yet, so a rename is still a free edit to `0001` rather than a migration — that stops
  being true the moment there are rows.
- **Column names say what they hold.** `staff_position` (what someone is) is separate from
  `permission_level` (what they may do); `case_number` is a human-readable sequence, not a
  foreign key; `employment_end_date` replaced an ambiguous `is_active`. If a name needs a
  sentence of explanation to a DBA, it is the wrong name.
- **Sort keys are computed once per row, never inside a comparator.** A comparator runs
  O(n log n) times; the authors key maps ids to names and sorts them. Doing it per
  comparison measured 51ms at 1,000 rows against 0.9ms per row-wise.
- **Never hard-delete a person attached to a project.** Deactivate. Historical
  attribution has to survive residents graduating.

## Pitfalls

- **RLS denies writes by matching zero rows, not by raising.** A blocked `UPDATE`
  returns success with nothing changed, and Supabase clients report an empty array
  rather than an exception. Any write path in the frontend must treat "0 rows affected"
  as "not permitted" and tell the user. Column guards do raise; only RLS is quiet.
- Functions that write during `INSERT` on `projects` need `SECURITY DEFINER`, because
  the row has no owner yet and the owner-based `UPDATE` policy would reject them. This
  already bit `refresh_project_search` and `assign_case_number`.
- Privilege guards intentionally step aside when `auth.uid()` is null. That path means
  service role, migration, or SQL editor, and it is how the first admin is bootstrapped.
- Views must be created `with (security_invoker = true)` or they bypass RLS entirely.
- The `anon` role has everything revoked. There are no anonymous reads or writes.

## Committing

- Never commit: the Supabase `service_role` key, any `.env`, or any `pg_dump` taken
  after the tracker holds real data. The repo is public.
- The Supabase `anon` key is safe to commit — it is a client identifier protected by
  RLS, and `anon` has no grants regardless.
- Run the prototype build before committing changes under `prototype/`.
- **Committing from Windows:** git has `core.filemode = true` by default there, NTFS has
  no executable bit, and so `git add -A` quietly resets `scripts/preflight.sh` from
  `100755` to `100644`. CI calls it as `bash ./scripts/preflight.sh` so this cannot
  break the run, but `git config core.filemode false` in your clone stops the churn.

## Open questions — do not invent answers to these

Ask rather than guessing:

1. The ACGME export shape. `acgme_scholarly_activity` is a placeholder guess. The
   program coordinator has the real field list.
2. Brand guide hex values. Everything comes from the `brand` object at the top of
   `ProjectTracker.jsx`. No logo, seal, or wordmark may be used — text wordmark only.
3. SSO vs magic link. Schema supports both; the choice depends on UMMC IT's timeline.
4. Whether the repo and hosting accounts move to a departmental owner. The spec (§11)
   says they should.
