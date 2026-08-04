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

Case reports carry a generated `case_id` and nothing else. The mapping to a patient
lives in the EMR or REDCap and is never stored here, referenced, or linked.

If a request would need PHI, stop and say so rather than working around it. That is a
scope change requiring a BAA, IT security review, and most likely REDCap instead of
this application.

## Layout

- `supabase/migrations/` — `0001` schema, `0002` RLS and auth, `0003` reporting views.
  Apply in order.
- `test/01_tests.sql` — 45 behavioral assertions. `test/00_supabase_stub.sql` is a local
  stand-in for Supabase's `auth` schema and roles; **never apply it to a real project.**
- `prototype/` — Vite + React UI prototype, browser-only, mock data, no backend.
- `.github/workflows/deploy-pages.yml` — publishes the prototype to GitHub Pages.

The Next.js application does not exist yet. That is the next block of work.

## Commands

```bash
cd prototype && npm install && npm run dev     # prototype, local
cd prototype && npm run build                  # must pass before committing prototype changes
```

Database tests need a scratch Postgres 16. Load in order: stub → 0001 → 0002 → 0003 →
tests. Every assertion prints PASS or aborts the run.

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
  `academic_year_of(date)` is the single source of truth. Case IDs follow it:
  `CR-2026-014`.
- **Soft delete by default.** "Delete" sets `archived_at`. Hard delete is admin-only and
  needs a confirmation step in the UI.
- **Never hard-delete a person attached to a project.** Deactivate. Historical
  attribution has to survive residents graduating.

## Pitfalls

- **RLS denies writes by matching zero rows, not by raising.** A blocked `UPDATE`
  returns success with nothing changed, and Supabase clients report an empty array
  rather than an exception. Any write path in the frontend must treat "0 rows affected"
  as "not permitted" and tell the user. Column guards do raise; only RLS is quiet.
- Functions that write during `INSERT` on `projects` need `SECURITY DEFINER`, because
  the row has no owner yet and the owner-based `UPDATE` policy would reject them. This
  already bit `refresh_project_search` and `assign_case_id`.
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

## Open questions — do not invent answers to these

Ask rather than guessing:

1. The ACGME export shape. `acgme_scholarly_activity` is a placeholder guess. The
   program coordinator has the real field list.
2. Brand guide hex values. Everything comes from the `brand` object at the top of
   `ProjectTracker.jsx`. No logo, seal, or wordmark may be used — text wordmark only.
3. SSO vs magic link. Schema supports both; the choice depends on UMMC IT's timeline.
4. Whether the repo and hosting accounts move to a departmental owner. The spec (§11)
   says they should.
