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

## 2026-08-03 — The no-PHI rule is enforced by a script, not by memory

`scripts/preflight.sh` is the pre-push gate, and `ci.yml` runs the same script on every
push and pull request against a Postgres 16 service container.

The database suite was already the real check on the security model; what it could not do
was run automatically. Loading five files into a scratch Postgres by hand is exactly the
step that gets skipped on a small change, and RLS failures are silent by nature — the
class of bug least likely to be noticed without a test is also the one this repo already
got caught by once.

The part worth arguing about is the PHI section. Every prohibition in this repo was
written as prose, and prose degrades: a contributor who never reads `CLAUDE.md` adds a
`date_of_service` column and nothing stops them. Grepping live migration SQL for the
forbidden identifiers turns the one structural rule into something a machine refuses.
Comments are stripped before the search, because the migrations discuss those identifiers
at length in order to explain their absence, and a guard that fires on its own
documentation gets disabled within a week.

It is deliberately a shallow check. It cannot catch PHI arriving as free text in
`why_unique`, which is what the MRN-shaped-pattern warning in the prototype is for. It
catches the schema change, which is the irreversible one.

## 2026-08-04 — The prototype has no signed-in user, and everyone can edit

The "signed in as" selector is gone, along with the `mineOnly` filter and the Mine
counter that depended on it.

It was standing in for SSO, but it also quietly decided two other things. New projects
were auto-assigned to whoever was selected, which guesses wrong constantly — coordinators
enter projects on behalf of residents, and a wrong author that arrives silently is worse
than a blank one, because nobody notices it. And it drove an owner-only read-only mode,
which is why opening someone else's project appeared to be an unfixable bug: every field
was disabled except the author picker, which had never been wired to the same flag.

Anyone can now edit anything. This is a department's shared record of its own work; a
resident fixing an attending's typo is the system working. The audit log in `0001` is
what makes it safe, and it is a better answer than a lock that stops the wrong edits by
also stopping the right ones.

Authorship is now a property of the project, chosen deliberately, rather than a side
effect of who was holding the keyboard.

## 2026-08-04 — Authors can be emptied, but an empty project cannot be saved

Removing the last author used to be blocked outright. That makes replacing a single
author a puzzle: you have to add the new one before removing the old, and if you thought
of it in the other order the interface simply refuses without explaining.

Removal is now unrestricted and the constraint moved to save time, where it belongs. This
is also why the detail panel gained an explicit Save: it was previously writing every
keystroke straight through, which left no moment at which a save could be refused. A
draft plus a Save button gives the refusal somewhere to happen, and gives Cancel a
meaning it did not have.

The dialog explains rather than greying out a button. A disabled control with no
explanation is the most common way an interface stops telling you what it wants.

## 2026-08-04 — Case IDs come from the highest issued, not the count

Found while adding the ability to change a project's type. The old implementation
numbered a new case report as `count of case reports this year + 1`, which collides the
moment one is archived or retyped: two live plus one archived reissues `003`.

Changing type made this reachable in normal use rather than only in theory, so the
sequence now derives from the highest number already issued in that academic year. A case
ID, once issued, is never reissued or renumbered — including when a project is typed away
from case report and back. The sequence is a count of case reports opened that year, and
reusing a number makes that count wrong.

## 2026-08-04 — Sort keys are computed per row, not per comparison

Prompted by a question about how many rows the table can take before it feels slow, which
turned out to be worth measuring rather than estimating.

Filtering was never the problem: 0.4ms at a thousand rows, 4.4ms at ten thousand. Sorting
by author was, at 51ms and 584ms respectively — visible jank on every keystroke. The
cause was the sort key. Comparators run O(n log n) times, and the authors key maps owner
ids to names and sorts them, so a thousand rows meant that work happened roughly ten
thousand times instead of a thousand.

Decorate-sort-undecorate, plus one shared `Intl.Collator` instead of
`String.prototype.localeCompare` building a fresh one per call, took a thousand rows to
0.9ms and ten thousand to 10ms — about fifty times faster.

The regression test asserts that `nameOf` is called exactly twice per row rather than
asserting a wall-clock time, so it states the actual invariant and cannot go flaky on a
slow CI runner.

Pagination at twenty rows a page was added at the same time, and matters more than either
number: rendering thousands of table rows costs far more than filtering them. Filters run
over the whole set, not the visible page.

## 2026-08-04 — "Research fellow" is a label change, not an enum change

*Superseded the same day — see "The database says what the interface says" below.*

The UI now reads "Research fellow". The Postgres `person_role` enum still says
`research_coordinator`.

Renaming an enum value is `ALTER TYPE`, which is a migration, and it would touch
`0002_rls.sql`, the ACGME view, the test suite and the bootstrap SQL in this README. The
request was for wording. The code and the label are allowed to differ, and both places
now say so in a comment, because the failure mode is someone later "fixing" one to match
the other and breaking the half they did not look at.

Worth doing properly before the schema is deployed anywhere. It is cheap now and
expensive once there are rows.

## 2026-08-04 — The database says what the interface says

Supersedes the entry above. Nothing is deployed, so there are no rows to migrate and a
rename is an edit to `0001` rather than an `ALTER TYPE`. The reason for the compromise
had expired; keeping it would have meant shipping a schema where a DBA has to be told,
out of band, that `research_coordinator` and "Research fellow" are the same thing.

Renamed, with the reasoning in each case:

| was | is | why |
|---|---|---|
| `person_role` / `people.role` | `staff_position` | Two columns were called some kind of role. One is what you are; the other is what you may do. |
| `app_role` | `permission_level` | See above. `permission_level = 'admin'` needs no explanation. |
| `research_coordinator` | `research_fellow` | The department's own word for the job. |
| `people.is_active` | `employment_end_date` | A boolean cannot answer "who was here when this ran?", and "active" could mean the row or the person. |
| `project_owners` | `project_authors` | The interface says Author(s). |
| `case_report_details.case_id` | `case_number` | `case_id` reads as a foreign key to a `cases` table. It is a human-readable sequence. |
| `case_id_counters.last_seq` | `case_number_counters.last_sequence_number` | Abbreviations cost more than they save. |
| `projects.type` | `project_type` | `select type from ...` in a join is ambiguous. |
| `projects.next_action_due` | `next_action_due_date` | Due what? It is a date. |
| `audit_log.action` | `operation` | `action` collided conceptually with `next_action`. |
| `audit_log.entity_type` / `entity_id` | `audited_table` / `audited_record_id` | "Entity" is ORM vocabulary. The values are a table name and a primary key. |
| `audit_log.actor_label` | `actor_display_name` | It is a name, not a label. |
| `work_statuses.is_active` | `is_selectable` | It controls whether the option is *offered*, not whether rows using it are live. |

Added: `people.external_position`, `project_venues.other_venue_description`, and
`is_currently_employed(date)` so the employment rule is written once. Both new text
columns carry a CHECK tying them to the value that makes them meaningful, so a stale
description cannot survive a change of kind.

Kept deliberately: `qa_qi` and `pgy_level` are the department's and ACGME's own terms.
Inventing clearer-sounding names for domain jargon makes it worse, not better. They have
`COMMENT ON` instead.

The guard is `prototype/src/lib/schema-parity.test.js`, which parses `0001_schema.sql`
and asserts every vocabulary matches the UI's, in the same order. The order matters
because the table sorts work status by array position; if SQL `sort_order` and the array
disagree, the list and the reports disagree. Prose could not have prevented the drift
that caused this entry. A test can.

## 2026-08-04 — RLS now matches the decision that any member can edit

The prototype was changed so anyone can edit any project, but `projects_update` still
required authorship. That is precisely the kind of gap this round was about: the security
model and the interface disagreeing about what the product is.

`projects_update`, `project_authors_*` and the child-table policies are now `is_member()`.
Hard delete stays admin-only — it is the one operation the audit log cannot undo.

`owns_project` became `is_project_author` and is explicitly no longer a gate. It stays
because the application still wants to say "your projects", and reimplementing that join
client-side would be worse.

Roster edits were NOT loosened. `people_update_self` still restricts changing someone's
record to that person or an admin. The prototype has no sign-in, so its open roster is
the absence of a model rather than a decision — renaming a colleague is a different act
from correcting a project, and nobody has asked for it to be open.

## 2026-08-04 — Employment is a date range, not a flag

`is_active` became `end_date`. Pickers show people with no end date, or an end date still
in the future; someone who has given notice is still on the list until they go.

The flag could not express "left in June", which is the only form the question actually
takes. It also gave no way to answer "who was here when this project ran". People are
never deleted — historical attribution has to survive residents graduating — so leaving
had to be representable as data rather than as a removal.

Renaming is the same shape of problem solved the same way: projects reference a person's
ID and never their name, so a marriage is one edit to one row and every association
follows it. That property is now covered by a test, because it is the kind of thing a
future refactor could quietly break.

---

## 2026-08-05 — The capture timer and the staleness banners are gone, and stay gone

The new-project form once showed an elapsed-seconds counter, and the list once carried
"not been touched in 90 days" banners with an age filter to match.

The timer measured the spec's thirty-second capture target. That is an instrument for
judging the design, not information the person typing can act on, and it put a running
stopwatch on someone writing up a case report. Measure the target in usability testing.

The banners scolded people for the natural rhythm of academic work — a project genuinely
does sit still between IRB submission and approval — and the amber-then-red escalation
made the list feel like an overdue-bills notice. `stalenessLabel` survives because the
Updated column still reads "3 days ago"; the judgement attached to it does not.
`dashboard_counts.stale_count` also survives, because "how many have gone quiet" is a
fair reporting question even though a banner was the wrong way to ask it.

Recorded here rather than guarded by tests. Three assertions existed purely to prove
these features were still absent; they could never fail unless someone deliberately
re-added the feature, and they left a new reader wondering what a staleness banner was.
A decision log is the right place for "we removed this on purpose".

## 2026-08-05 — `purpose` is back in the detail panel

It should never have left. `projects.purpose` is spec §5, it is a real column, it is
weighted into the search vector, `project_export` selects it, the prototype's search
box offers it by name in its own placeholder — and the panel had no field for it. The
only purposes in the system were the ones the seed data shipped with, and the app
invited people to search a field it gave them no way to write.

There was no decision recorded for removing it, and a test asserting its absence was
holding the gap open. Restored as an optional textarea under Author(s), with the
identifier tripwire attached like the other free-text fields.

## 2026-08-05 — Lint is one rule, and it is not about style

`npm run lint` enforces exactly one thing: no unused variables or imports. It is a
preflight section and it blocks a push.

It is not a formatter and must not become one. Nothing in it reformats code or fails a
build over a quote character, because that turns a useful gate into noise people learn
to skip. The single rule earns its place because an unused import is how a deleted
feature leaves a trace, and nothing else in the build notices — the bundle still
compiles and the tests still pass while a new reader cannot tell residue from something
load-bearing. Two hand audits missed exactly this; the linter found it in a second.

If something is genuinely unused, delete it. Do not silence the rule with a disable
comment.

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
8. **Whether the repo stays public.** It holds no secrets and no PHI, and preflight
   enforces both, so public is defensible — but it should be a decision rather than a
   default.
9. **Whether `prototype/src/lib/supabaseWrite.js` stays.** It is reachable from nothing
   today because the Next.js app does not exist, so it is the one file that reads as
   dead weight to someone new. It exists ahead of the app deliberately, so the app gets
   built on it rather than on a warning in a document. Keep it or drop it, but decide.
