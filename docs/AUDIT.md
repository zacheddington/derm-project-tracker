# Pre-production audit

Started 2026-08-04. Goal: get this repo from "healthy prototype on a personal GitHub
account" to something that can be pointed at a real URL and a real database in about a
month, without carrying a hidden problem into production with it.

**If you are resuming this work:** read this file top to bottom, find the first section
marked ☐ or ◐, and continue there. Every finding below records what was wrong, what was
done, and where. Sections marked ☑ are finished and verified — do not redo them.

Run `./scripts/preflight.sh` before any push. Stop the Vite dev server first or `npm ci`
fails on Windows with `EPERM … esbuild.exe`.

---

## Status at a glance

| # | Section | Status |
|---|---|---|
| 1 | Remove the capture timer | ☑ |
| 2 | Dependency vulnerabilities | ☑ |
| 3 | Database deployability (no test data, clean install) | ☑ |
| 4 | Security review — findings and fixes | ☐ |
| 5 | Test scenario audit — quality of what exists | ☐ |
| 6 | Test coverage — what is not tested at all | ☐ |
| 7 | Production readiness checklist (for the real move) | ☐ |

Legend: ☐ not started · ◐ in progress · ☑ done and verified

---

## 1. Remove the capture timer ☑

The elapsed-seconds counter in the new-project form measured the spec's "capture an idea
in under 30 seconds" target. It was an instrument for judging the design, not information
the person typing can act on, and it put a stopwatch on someone recording a case report.
Asked about three times; removed.

---

## 2. Dependency vulnerabilities ☑

`npm audit --omit=dev` reports **0 production vulnerabilities**. Nothing shipped to Pages
or to a future production build is affected.

Five dev-only findings, all resolved by two semver-major upgrades:

| severity | package | what |
|---|---|---|
| critical | vitest | Vitest UI server can read/execute arbitrary files when listening |
| high | vite | Path traversal in optimized-deps `.map` handling |
| moderate | esbuild | Any website can send requests to the dev server and read the response |
| moderate | @vitest/mocker, vite-node | transitive on the above |

These matter to a developer running `npm run dev` or `npx vitest --ui` on an untrusted
network, not to the deployed site. Fix is `vite@8` and `vitest@4`, both major.

**Done.** Upgraded to `vite@8.2.0` and `vitest@4.1.10`; `npm audit` now reports 0
vulnerabilities including dev. All 137 tests pass and the build works (and got faster).
Vite 8 requires Node `^20.19 || >=22.12`, so both workflows moved to Node 22 and to
`actions/checkout@v5` / `setup-node@v5`, which also clears the Node 20 deprecation
warning GitHub was emitting.

---

## 3. Database deployability ☑

**Answering the question directly: the SQL is `CREATE`, not `ALTER`.** Nothing in
`supabase/migrations/` modifies an existing object — it is a from-nothing install. Run
`0001`, `0002`, `0003` in order against an empty database and you have the whole schema.
There is nothing to un-migrate because nothing was ever deployed.

**No test data ships.** The only `INSERT` statements in the migrations are:

- `work_statuses` (9 rows) and `submission_statuses` (9 rows) — the status vocabularies.
  These are *reference data*, not test data: `projects.work_status` has a foreign key to
  `work_statuses(code)`, so without them the application cannot save anything. They are
  the vocabulary the spec requires admins to be able to edit without a migration.
- `app_settings` (1 row) — the allowed email domain list.

Every person, project, venue and case report in this repo lives in either
`test/01_tests.sql` (never deployed) or the prototype's in-memory seed data (browser
only). Neither touches a real database.

**Kept true mechanically.** `preflight.sh` gained a Deployability section with two
checks, both negative-tested:

- *migrations seed only the status vocabularies* — any top-level `INSERT` into a table
  other than `work_statuses`, `submission_statuses` or `app_settings` fails the build.
  Dollar-quoted function bodies are stripped first, so a trigger writing to `audit_log`
  or `people` at runtime is not mistaken for seed data.
- *migrations create rather than alter* — an `ALTER TABLE/TYPE` fails, because nothing is
  deployed and a change-migration against a database that does not exist is a mistake.
  Edit `0001` in place until the first real deployment.

Deployment procedure is written up in §7.

---

## 4. Security review ☐

Findings are recorded here as they are confirmed, with severity and disposition.

---

## 5. Test scenario audit ☐

Reviewing every existing scenario for whether it tests what it claims, and rewriting the
ones that do not.

---

## 6. Test coverage gaps ☐

Known gap before this audit started: **no component-level tests.** Modals, the detail
panel's draft/save/cancel cycle, the author picker and the roster panel are verified by
hand in a browser and by nothing else.

---

## 7. Production readiness checklist ☐

For the actual move to a real URL and database. Not code changes — decisions and steps.

---

## Things deliberately NOT changed

Recorded so a later session does not "fix" them by mistake:

- `qa_qi` and `pgy_level` stay as they are. Department and ACGME terminology.
- Roster edits stay self-or-admin in RLS. The prototype has no sign-in, so its open
  roster is the absence of a model, not a decision to loosen the policy.
- Status transitions are never enforced. Real projects move backwards.
