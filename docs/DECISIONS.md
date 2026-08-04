# Decision log

What was decided, and why. This exists because the reasoning behind a choice is the part
that gets lost, and the part a future maintainer needs in order to know whether a
decision still applies.

Append to this file when a real decision gets made. One entry, dated, with the reasoning
rather than just the outcome.

---

## 2026-08-03 — PHI: Option A, de-identified

Per spec §2. No protected health information anywhere in the system. The relevant
columns do not exist, which makes this structural rather than a policy anyone has to
remember.

Practical consequence: no BAA, near-zero hosting cost, and IT security review becomes a
courtesy conversation rather than a gate. If a future requirement genuinely needs PHI,
that is a new project, not a migration — and the spec's own recommendation stands: use
REDCap.

## 2026-08-03 — Ship `project_venues` in v1

Spec §12 left this open. The table costs almost nothing in SQL, and the seed data
already contains the case it exists for: a poster accepted while the manuscript is still
in revision. Collapsing that into one field loses information you cannot reconstruct
afterwards.

## 2026-08-03 — Status vocabularies are lookup tables, not native enums

Spec §6 asks that admins be able to edit statuses without a code change. A native
Postgres enum needs `ALTER TYPE`, which is a migration. So `work_statuses` and
`submission_statuses` are ordinary tables with an admin write policy.

Everything genuinely fixed — project type, IRB status, venue type, person role — stays a
native enum. The distinction is whether the program might reasonably want to change the
vocabulary, not whether it is technically possible.

## 2026-08-03 — Type-specific fields go in 1:1 child tables

The alternative was nullable columns on `projects`. Child tables are the only way the
fields the spec marks *required* — `diagnosis`, `why_unique`, `description` — can
actually be `NOT NULL`. A nullable column in a wide table enforces nothing.

Cost is a join. `project_export` absorbs it and flattens everything back to one row per
project, so the CSV shape is unaffected.

## 2026-08-03 — Zero Postgres extensions

Initially the schema used `pgcrypto`, `citext`, and `unaccent`. The local test Postgres
had none of them, which forced the question of whether they were needed.

They were not. `gen_random_uuid()` has been core since PG13, email case-insensitivity is
a normalizing trigger, and `to_tsvector('english', …)` handles the search cases that
matter here. The payoff is that a `pg_dump` restores on any stock Postgres, which is the
spec §1 handoff criterion. Worth keeping.

## 2026-08-03 — Academic year is the July 1 start year

Stored as an integer: `2026` means AY 2026–2027. `academic_year_of(date)` is the single
source of truth and views render the span. Case IDs follow the academic year rather than
the calendar year, because ACGME reporting is the point of §8.

## 2026-08-03 — RLS denies writes silently, and the frontend must handle it

Found while writing the test suite. A test asserting that a non-owner *cannot* update
someone else's project failed — not because the write succeeded, but because Row Level
Security blocks a write by matching **zero rows** rather than raising an error.

The security model was correct. The assertion was wrong.

This matters well beyond the tests: Supabase clients report a blocked write as an empty
array, not an exception. If the frontend treats that as success, users will watch edits
silently evaporate with no error shown. Every write path needs to check the affected-row
count and surface a refusal.

Column-level guards (role changes, merges) raise properly. Only RLS is quiet.

## 2026-08-03 — Privilege guards step aside when `auth.uid()` is null

Bootstrapping the first admin failed because the guard trigger on `people` blocks
`app_role` changes by non-admins, and there was no admin yet.

A null `auth.uid()` means the call is not coming through the API: service role,
migration, or SQL editor. Those contexts are already privileged. The guards protect the
API surface, so they now return early on that path.

## 2026-08-03 — `SECURITY DEFINER` on triggers that write during `INSERT`

`refresh_project_search` and `assign_case_id` both fire during `INSERT` on a project that
has no owner yet, so the owner-based `UPDATE` policy would reject them. Both are
`SECURITY DEFINER`. Any future trigger in the same position needs the same treatment.

## 2026-08-03 — GitHub Pages hosts the prototype only; production stays on Vercel

Pages serves static files: no server-side rendering, no API routes, no middleware. A
Next.js app talking to Supabase *can* be exported statically and served from Pages, since
auth and data access are both client-side — but it permanently forecloses every
server-side option, and Vercel's free tier already covers this scale.

Pages earns its place as a zero-friction link to send the program coordinator and faculty
for design feedback before production code exists.

---

## Still open

Do not invent answers to these; ask.

1. **ACGME export shape.** `acgme_scholarly_activity` is a guess and is marked as such in
   the SQL. The program coordinator has the real field list. It is a view specifically so
   reshaping it is a one-file change.
2. **SSO vs magic link.** Schema supports both. Depends on UMMC IT's app-registration
   timeline, which is the longest external dependency in the project.
3. **Brand guide hex values.** Everything derives from the `brand` object at the top of
   `ProjectTracker.jsx`.
4. **Case ID mapping location** — REDCap or an EMR patient list. Nothing in the code
   depends on the answer, but Option A is not complete until the mapping has a documented
   home.
5. **Whether UMMC IT wants a security review** for a de-identified, unbranded site on
   external hosting.
6. **Initial admins, and a named successor.** Spec §11 says accounts should belong to a
   departmental email rather than a personal one; a personal GitHub account is the same
   problem in different clothing.
7. **Licensing.** No LICENSE file, so default copyright applies. Who owns work product
   created for a UMMC department is a question for the department.
