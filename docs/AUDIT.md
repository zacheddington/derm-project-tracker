# Pre-production audit

Started 2026-08-04. Goal: get this repo from "healthy prototype on a personal GitHub
account" to something that can be pointed at a real URL and a real database in about a
month, without carrying a hidden problem into production with it.

**If you are resuming this work:** read this file top to bottom, find the first section
marked ☐, and continue there. Every finding records what was wrong, what was done, and
where. Sections marked ☑ are finished and verified — do not redo them.

Run `./scripts/preflight.sh` before any push. Stop the Vite dev server first, or `npm ci`
fails on Windows with `EPERM … esbuild.exe`.

---

## Status at a glance

| # | Section | Status |
|---|---|---|
| 1 | Remove the capture timer | ☑ |
| 2 | Dependency vulnerabilities | ☑ |
| 3 | Database deployability (no test data, clean install) | ☑ |
| 4 | Security review — findings and fixes | ☑ |
| 5 | Test scenario audit — quality of what exists | ☑ |
| 6 | Component tests | ☑ |
| 7 | Production readiness checklist | ☑ written; the decisions are yours |

Current gate: **224 prototype assertions + 76 database assertions**, all green in CI.

---

## 1. Remove the capture timer ☑

The elapsed-seconds counter in the new-project form measured the spec's "capture an idea
in under 30 seconds" target. It was an instrument for judging the design, not information
the person typing could act on, and it put a running stopwatch on someone recording a
case report. Removed.

---

## 2. Dependency vulnerabilities ☑

`npm audit --omit=dev` reported **0 production vulnerabilities** before and after.
Nothing shipped to Pages was ever affected.

Five dev-only findings — a critical in vitest (UI server could read and execute arbitrary
files), a high in vite (path traversal in optimized-deps `.map` handling), and the esbuild
issue where any website can send requests to the dev server and read the response. These
matter to a developer running `npm run dev` on an untrusted network.

Fixed by upgrading to `vite@8.2.0` and `vitest@4.1.10`, both semver-major. All tests pass
and the build is faster. Vite 8 requires Node `^20.19 || >=22.12`, so both workflows moved
to Node 22 and to `actions/checkout@v5` / `setup-node@v5`, which also cleared GitHub's
Node 20 deprecation warning.

---

## 3. Database deployability ☑

**Answering the question directly: the SQL is `CREATE`, not `ALTER`.** Nothing in
`supabase/migrations/` modifies an existing object — it is a from-nothing install. Run
`0001`, `0002`, `0003` in order against an empty database and you have the whole schema.
There is nothing to un-migrate, because nothing was ever deployed.

**No test data ships.** The only top-level `INSERT`s in the migrations are:

- `work_statuses` (9 rows) and `submission_statuses` (9 rows) — the status vocabularies.
  These are *reference data*, not samples: `projects.work_status` has a foreign key into
  `work_statuses(code)`, so without them nothing can be saved.
- `app_settings` (1 row) — the allowed email domain list.

Every fake person, project and case report lives in `test/01_tests.sql` (never deployed)
or the prototype's in-memory seed (browser only).

**Kept true mechanically.** `preflight.sh` gained a Deployability section, both checks
negative-tested by injecting a violation and confirming the failure names the line:

- *migrations seed only the status vocabularies* — any top-level `INSERT` into another
  table fails. Dollar-quoted function bodies are stripped first, so a trigger writing to
  `audit_log` at runtime is not mistaken for seed data.
- *migrations create rather than alter* — an `ALTER TABLE/TYPE` fails. Until the first
  real deployment, edit `0001` in place rather than adding a change-migration.

Deployment steps are in §7.

---

## 4. Security review ☑

Five findings, all fixed, all covered by assertions, all verified in CI against real
Postgres 16.

### 4.1 `search_path` did not exclude `pg_temp` — moderate

All 11 `SECURITY DEFINER` functions set `search_path = public`. That is the pattern
everyone writes and it is not sufficient: Postgres searches the **temporary schema first**
for relation names unless `pg_temp` is listed explicitly. A caller who can create temp
tables — `PUBLIC` holds `TEMP` on the database by default — could create `pg_temp.people`
and have a definer function read it with the owner's privileges, bypassing RLS.

Fixed: every one now sets `search_path = public, pg_temp`, naming it last. There is a
comment in `0002` saying not to drop it.

### 4.2 CSV formula injection — high, and the most likely to be exploited

Every free-text field reaches the export, and the program coordinator opens it in Excel.
A project titled `=HYPERLINK("http://evil","Q4 report")` becomes a live link in her
spreadsheet; the `=cmd|…` form has historically executed on open. Quoting does **not**
help — spreadsheet parsers strip quotes before evaluating.

Fixed in `prototype/src/lib/exportCsv.js`: any cell starting with `=`, `+`, `-`, `@`, tab
or CR gets a leading apostrophe, which spreadsheets render invisibly and never evaluate.
Both real payloads are asserted end to end.

**Carry this into the real app.** If the Next.js build generates CSV server-side, or you
export from `project_export` with `COPY … TO CSV`, the same escaping must be applied
there. The database view does not do it.

### 4.3 `is_allowed_email` used LIKE against operator-supplied text — low, latent

The domain allowlist pattern-matched the whole address: `lower(addr) like '%@' || d`. A
configured domain containing `_` or `%` would be a wildcard (`my_school.edu` would also
admit `myXschool.edu`), and a trailing match accepts `someone@evil.com@umc.edu`.

Fixed: compares the domain part for equality and requires exactly one `@`. The bypass is
asserted.

### 4.4 Members could edit roster facts on their own row — moderate

`people_update_self` lets a member update their own record, and the column guard blocked
only `permission_level`, `merged_into` and `auth_user_id`. That left:

- `staff_position` — decides who counts as a resident in the ACGME report and who appears
  in the attending picker.
- `employment_end_date` — decides who is still a member. A way to lock yourself out.
- `email` — the key a sign-in matches a roster row against.

All three are now admin-only. Renaming yourself is still allowed, and that is asserted so
the guard cannot over-reach.

### 4.5 The `anon` revoke did not reach the views — low, defence in depth

`0002` revokes everything from `anon`, but `0003` creates the four reporting views
*afterwards*, and a `REVOKE` does not apply to objects created later — while Supabase
configures default privileges that **grant** new objects to `anon`. The views are
`security_invoker`, so RLS would still have returned zero rows; this was the difference
between one lock and two. Explicit revoke added to `0003`.

### Checked and found sound

- All four views are `security_invoker = true`. Without it a view is a hole straight
  through RLS.
- `audit_log` has a read policy only and no insert/update/delete policy for anyone. Rows
  arrive via `SECURITY DEFINER` triggers that bypass RLS, so the log cannot be rewritten
  through the API even by an admin. Asserted.
- `default_new_person_privileges` forces `permission_level = 'member'` on inline roster
  additions regardless of what the client sends. Asserted.
- Privilege guards step aside when `auth.uid()` is null — service role, migration or SQL
  editor, all already privileged, and how the first admin is bootstrapped.
- No secrets, `.env` files or dumps tracked; preflight enforces it.
- React escapes interpolated text, so free-text fields are not an XSS vector **as
  currently rendered**. See the Markdown warning in §7.

---

## 5. Test scenario audit ☑

### The real defect: `denied()` could pass without testing anything

`denied()` treats "zero rows affected" as a successful denial, which is correct for RLS —
it blocks by matching no rows rather than raising. The problem is that **a WHERE clause
matching nothing looks identical**. A typo'd email in a security test would have reported
PASS while asserting nothing at all, in the suite whose entire job is proving people
cannot reach each other's data.

Fixed by adding a `precondition` argument: a boolean expression that must be TRUE for the
denial to be meaningful — normally "the row exists and does not already hold the value I
am trying to set". Every denial targeting a specific row now carries one.

A self-test proves the precondition bites: it runs a denial against an email that does not
exist and fails if that is reported as a pass. If that test ever goes quiet, the security
assertions have stopped asserting.

### Scenarios rewritten

- The "non-owner cannot edit" block still asserted the old author-only model. It now
  asserts what is true — any member may edit, hard delete is still refused — and reverts
  its own changes so later assertions see the state they expect.
- Two of my own expectations were wrong when first written: the author sort order, and a
  staleness boundary test that put both thresholds in one array where a 365-day row
  satisfies the 90-day threshold too, so the test could not have failed. Both corrected;
  each threshold is now checked in isolation.
- A stale section header claiming "Tomi cannot edit Rae's project" was corrected.

### Judged sound

`ok()` raises on NULL as well as false, so an assertion whose subquery returns no row
fails rather than passing quietly. Blocked writes are followed by a positive check that
the value did not change. The prototype suite injects `now` everywhere rather than reading
the clock, so nothing is time-flaky.

---

## 6. Component tests ☑

82 component assertions across three files, run in jsdom under the same `npm test`.
Vitest defaults to the `node` environment so the pure-logic suites stay fast; the
component files opt in with a `@vitest-environment jsdom` docblock.

- `DetailPanel.test.jsx` (26) — the draft/save/cancel cycle, the refusal to save with no
  authors, venue delete confirmation, type change preserving an issued case number, the
  attendings-only picker, archive/restore.
- `RosterPanel.test.jsx` (15) — current vs former as exclusive views, search within the
  active tab, rename patching by id, and the end date going out as `null` rather than `""`.
- `AuthorPicker.test.jsx` (19, including quick capture) — removing the last chip,
  excluding people already selected or departed, inline roster creation, and quick
  capture refusing to create a project with no author or no title.

### They found a real accessibility bug on the first run

`Field` wrapped its children in a `<label>`. A label may be associated with exactly ONE
control, so the four project-type buttons all sat inside one label and the
accessible-name algorithm gave every one of them the label's entire text:

> "Type QA/QI Research Review Set the wrong one on capture? Change it here…"

Four buttons, indistinguishable to anyone using a screen reader, and invalid HTML. The
same applied to the author picker and the attending picker.

Fixed with a `group` prop: a single control keeps the implicit `<label>`, while a field
holding several controls renders `role="group"` with `aria-labelledby` and
`aria-describedby`, leaving each control its own name. Verified in a real browser — the
type buttons now compute as "Case report", "QA/QI", "Research", "Review", and single
inputs still read "Title" and "Diagnosis".

Two smaller fixes fell out of the same pass: the panel's header X and its footer button
were both named "Close" (the header is now "Close panel"), and the roster list gained
`role="list"` / `role="listitem"`, which is both correct semantics and what makes a row
addressable in a test.

### Also added: the RLS write guard — `src/lib/supabaseWrite.js` (22 assertions)

Not a component test, but the fix for the production bug flagged in §7. There is no
Next.js app yet, so there was no bug to fix — there was a trap to remove.

RLS refuses a write by matching **zero rows**, so PostgREST returns
`{ data: [], error: null }`: identical to a successful update of nothing, and identical
to what `if (error)` treats as success. Written the obvious way, a user without
permission is told their edit saved. It did not.

`rowsFromWrite` / `rowFromWrite` / `writeOne` / `writeMany` turn that into a thrown
`NotPermittedError` carrying a message worth showing. They also refuse to guess when
`.select()` was omitted — a successful write without it returns `data: null`, which is
indistinguishable from a refusal if you are counting rows — and they keep genuine
database errors distinct from denials.

**This module is not prototype code.** It lives in `src/lib` because that is where the
repo's tested, framework-free logic lives, and it exists ahead of the app so the app is
built on it rather than on a warning in a document. Move it with the app.

---

## 7. Production readiness checklist ☑ written; the decisions are yours

### Deploying the database

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

### Before the switch

- [ ] **Move the repo and hosting to a departmental owner.** Spec §11. A personal GitHub
      account is the same problem as a personal email: residents graduate. Longest-lead
      item, and nothing in the code can fix it.
- [ ] **Decide SSO vs magic link** and start the UMMC IT app registration — the longest
      external dependency. Switching later is Supabase config, not a rewrite.
- [ ] **Confirm the ACGME export shape** with the program coordinator.
      `acgme_scholarly_activity` is a guess and is marked as one. It is a view, so
      reshaping it is a one-file change.
- [ ] **Add a LICENSE**, or decide deliberately that default copyright is right. Today
      nobody can reuse this, including the department.
- [ ] **Decide whether the repo stays public.** It holds no secrets and no PHI, and
      preflight enforces both. Public is defensible; it should still be a decision.
- [ ] **Turn on backups and test a restore** before there is anything to lose. A backup
      nobody has restored is a hypothesis.
- [ ] **Handle the `service_role` key properly.** It bypasses RLS entirely. Host secret
      store only — never in the repo, never in a `NEXT_PUBLIC_` variable. Preflight
      catches a committed JWT; it cannot catch a leaked one.
- [ ] **Require CI to pass before merge.** Today CI reports but nothing blocks. A branch
      ruleset on `main` makes the gate real.
- [ ] **Confirm the case-number → patient mapping has a documented home** (REDCap or an
      EMR list). Option A is not complete until it does.

### Carry into the Next.js app

- **RLS denies by matching zero rows, not by raising.** Supabase clients report a blocked
  write as an empty array, not an exception. Every write path must treat "0 rows affected"
  as "not permitted" and say so, or users will watch edits evaporate silently. This is the
  single most likely production bug in this codebase.
- **CSV escaping is client-side today.** Server-side export needs the same formula
  neutralisation — see §4.2.
- **The schema calls `notes` "Markdown-rendered".** The prototype renders plain text, so
  there is no XSS today. The moment a real Markdown renderer is added, raw HTML must be
  disabled or sanitised. Most likely way XSS enters this app.
- **The `anon` key is safe to expose; `service_role` is not.** `anon` has every grant
  revoked and is protected by RLS regardless.

---

## Things deliberately NOT changed

Recorded so a later session does not "fix" them by mistake:

- `qa_qi` and `pgy_level` stay. Department and ACGME terminology; inventing
  clearer-sounding names for domain jargon makes it worse.
- Roster edits stay self-or-admin in RLS. The prototype has no sign-in, so its open roster
  is the absence of a model, not a decision to loosen the policy.
- Status transitions are never enforced. Real projects move backwards.
- Hard delete stays admin-only, while editing is open to any member. The audit log makes
  open editing survivable; it cannot undo a hard delete.
