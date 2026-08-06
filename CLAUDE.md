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
- `test/01_tests.sql` — behavioural assertions over schema, RLS and views. `test/00_supabase_stub.sql` is a local
  stand-in for Supabase's `auth` schema and roles; **never apply it to a real project.**
- `prototype/` — Vite + React UI prototype, browser-only, mock data, no backend.
  `src/lib/` holds the list logic as pure functions with `*.test.js` beside them;
  `src/components/` holds the panels. Put new behaviour in `lib/` and write the scenario.
  `components/primitives.jsx` holds the controls with no domain knowledge (`Field`,
  `Modal`, `ChoiceButtons`, `DateInput`); anything that knows what a person or a project
  *is* gets its own file, like `NewPersonForm.jsx`.
- `scripts/preflight.sh` — the pre-push gate. `.github/workflows/ci.yml` runs the same
  script with `--require-db` on every push and PR.
- `.github/workflows/deploy-pages.yml` — publishes the prototype to GitHub Pages.

The Next.js application does not exist yet. That is the next block of work.

## Commands

```bash
./scripts/preflight.sh                         # must pass before pushing anything
cd prototype && npm install && npm run dev     # prototype, local
cd prototype && npm test                       # 350 assertions: logic + components
cd prototype && npm run lint                   # unused imports and variables only
```

`preflight.sh` checks, in order: no secrets or dumps tracked; no PHI identifier in live
migration SQL and `year_seen` still `smallint`; the prototype builds; **lint passes**; the
tests pass; **`docs/FEATURES.md` was updated if the interface changed**; the database
suite passes. It skips the database section when it cannot reach Postgres and says so —
CI runs it with `--require-db`, so a green local run with a skip is a weaker claim.

**`docs/FEATURES.md` is a deliverable, not a courtesy.** It is what the department is
handed to understand what the system does, so a push that changes
`ProjectTracker.jsx`, anything in `components/`, or `lib/domain|projects|exportCsv.js`
must also touch it: delete what is gone, correct what changed, add what is new, and move
the date at the top. Write it in the user's language, not the schema's. A refactor with
genuinely no user-visible effect says `[no-user-impact]` in the commit message — that is
a claim on the record, not a way to skip the step.

The lint config is deliberately one rule, not a style guide: **no unused variables or
imports**. That is how a removed feature leaves a trace, and nothing else in the build
notices — the bundle still compiles and the tests still pass while a new reader cannot
tell residue from something load-bearing. Do not add formatting rules to it; do not
silence it with a disable comment. If something is genuinely unused, delete it.

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
  sentence of explanation to a DBA, it is the wrong name. The exception is domain jargon:
  `qa_qi` and `pgy_level` stay exactly as they are, because they are what the department
  and ACGME call these things, and inventing a clearer-sounding name for a term of art
  makes it worse rather than better.
- **Sort keys are computed once per row, never inside a comparator.** A comparator runs
  O(n log n) times; the authors key maps ids to names and sorts them. Doing it per
  comparison measured 51ms at 1,000 rows against 0.9ms per row-wise.
- **Never hard-delete a person attached to a project.** Deactivate. Historical
  attribution has to survive residents graduating.

## Removing functionality

A feature is not removed until nothing in the repo still refers to it. Half a removal is
worse than none: the leftovers read as an accident, and the next person restores the
feature from the evidence you left behind. That has already happened here once, with
`purpose`.

Delete, in the same commit:

- the UI, and the logic behind it
- the column, its constraints, its index, its search weighting, its line in every view
- the seed and fixture values
- **the test scenarios for it** — a test for a feature that does not exist is noise, and
  it will be read as a specification
- **every description of it** — `docs/FEATURES.md`, `README.md`, `docs/SPEC.md`, and any
  comment or placeholder that names it. Documentation of something that no longer exists
  is worse than no documentation, because it is believed.

Then add **one** entry to `docs/DECISIONS.md` saying what went and why. That entry is the
only thing that should survive, and it is not a description of the feature — it is the
reason the feature is absent, which is what stops it coming back. Keep it short.

Two supporting notes:

- **Grep before you call it done.** `grep -rn "<name>" .` should return the decision entry
  and nothing else.
- **Keep an "it is not there" test only when its absence is load-bearing** — something a
  reader would otherwise restore, as `purpose` was. One test across all the cases it could
  reappear in, pointing at the decision entry. Not a tombstone for every deleted button.

## The bug this codebase keeps having

Every user-reported bug here has had the same shape: **a rule applied at one site instead
of at the level it belongs to.** The code looks right where you look, and is wrong one
field over.

- `Enter` saved from the roster's name box and nowhere else — the handler was on that one
  input rather than on the form.
- `createProject` wrote `type` while every reader wanted `project_type`; `addPerson`
  wrote `role` while every reader wanted `staff_position`.
- `changeProjectType` stamped `updated_at`, so switching type and switching back left a
  project permanently unsaved — the one edit path that broke "put it back and there is
  nothing to save".

All three passed a full green suite. So when reviewing, the question is not "does this
work?" but **"does the rule hold everywhere it should, and is it expressed once?"**

Three smells worth stopping on:

1. **A handler bound to one specific control** where the behaviour is really the form's,
   the panel's, or the list's. Bind it at that level instead.
2. **A writer naming a field differently from its readers.** Record-building is logic:
   it lives in `lib/` (`newProject`, `newPerson`) precisely so a test can reach it. Both
   name bugs lived in `ProjectTracker.jsx` because that was the file nothing tested.
3. **A draft-time operation touching a saved-time field.** `updated_at` is stamped when
   something is saved, never while it is being edited — dirty is a comparison against the
   last saved state, so any extra difference makes it permanent.

### Write tests that enumerate, not tests that name one case

This is the part that actually prevents recurrence. A test naming one field catches the
bug you already know about; a test that walks whatever is really there catches the next
one, including things added after the test was written.

- `RosterPanel.test.jsx` presses Enter in **every input the edit form contains**, found at
  runtime, and reports which one failed. A fifth field wired up wrong fails it with no new
  test written.
- `ProjectTracker.test.jsx` compares the **whole key set** of a created record against a
  seeded one, rather than asserting named fields are present. A renamed or dropped field
  fails it in milliseconds, whatever it was renamed to.
- `it.each` over `TYPES` rather than picking one type. Both name bugs were invisible for
  three of the four.
- `schema-parity.test.js` reads the SQL rather than restating it.

### A test that asserts what the code does is not a test of the rule

Two tests here actively held bugs in place: one asserted the created project's field was
called `type`, and one asserted `changeProjectType` "touches updated_at, because a retype
is an edit". Both were written from the implementation rather than from the requirement,
so they turned a defect into a specification.

When a test fails after a fix, decide which is wrong before making it green.

## Pitfalls

- **RLS denies writes by matching zero rows, not by raising.** A blocked `UPDATE`
  returns success with nothing changed, and Supabase clients report an empty array
  rather than an exception. Any write path in the frontend must treat "0 rows affected"
  as "not permitted" and tell the user. Column guards do raise; only RLS is quiet.
  `src/lib/supabaseWrite.js` exists so this cannot be got wrong — use `writeOne`/`writeMany`
  rather than checking `error` by hand.
- Functions that write during `INSERT` on `projects` need `SECURITY DEFINER`, because
  the row has no owner yet and the owner-based `UPDATE` policy would reject them. This
  already bit `refresh_project_search` and `assign_case_number`.
- Privilege guards intentionally step aside when `auth.uid()` is null. That path means
  service role, migration, or SQL editor, and it is how the first admin is bootstrapped.
- Views must be created `with (security_invoker = true)` or they bypass RLS entirely.
- The `anon` role has everything revoked. There are no anonymous reads or writes.

## Committing

- **Ask before landing anything: "PR, or commit to main?"** Never commit silently, and
  never leave finished work sitting uncommitted without saying so — the owner tests
  against the deployed Pages build, so uncommitted work and a broken fix look identical
  from their side. If they start reporting bugs while work is uncommitted, say so at once.
- PRs once this is live; direct-to-main is only acceptable while it is still a demo.
- CI runs on `pull_request` and on pushes to `main` only, so pushing a bare branch
  validates nothing — including the database suite, which is the only place the SQL is
  actually exercised.
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

They live in **one place**: the `## Still open` section at the end of `docs/DECISIONS.md`.
Read it before answering anything that sounds like a product decision, and add to it
rather than deciding. That list used to be restated in four files, which is how it ended
up four different lengths.

The two that most often get guessed at: the ACGME export shape (the program coordinator
has the real field list) and the brand hex values (everything derives from the `brand`
object in `lib/domain.js`; no logo, seal or wordmark may be used — text wordmark only).
