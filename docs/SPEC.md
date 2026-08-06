# Dermatology Resident Project Tracker — Build Specification

**Institution:** University of Mississippi Medical Center, Department of Dermatology
**Purpose:** A shared, low-friction registry where residents and faculty record,
organize, and track the status of scholarly projects.
**Status:** Draft v0.1 — contains open decisions marked ⚠️

<!-- Original authored specification, preserved verbatim as the source of truth.
     Implementation decisions taken against it are logged in DECISIONS.md rather
     than edited into this file. -->

---

## 1. Product intent

This is an organizational tool, not a workflow engine. Think "well-structured shared
notebook," not "clinical system." There is no approval chain, no required sequence of
steps, and no enforced process. A user should be able to open the site, jot down an idea
in under 30 seconds, and come back to it three months later.

Design decisions should consistently favor fewer required fields, fast entry, and easy
retrieval over completeness or rigor.

### Success criteria

- A resident can capture a new project idea in under 30 seconds.
- Any resident or faculty member can see, at a glance, every active project and who owns it.
- The program can export a full scholarly-activity report at the end of the academic year
  without manual compilation.
- The entire system can be handed to a new maintainer with a database dump and a README.

---

## 2. ⚠️ Blocking decision: PHI handling

This must be resolved before any code is written.

### Option A — De-identified tracker (recommended, assumed by this spec)

The application stores no protected health information. Case reports are identified by a
system-generated case ID only (e.g. CR-2026-014). The mapping from case ID to patient
lives in the EMR or in an existing institutional system (REDCap).

Consequences:

- No BAA required with any vendor.
- Hosting cost approaches $0.
- IT security review is a courtesy conversation rather than a formal gate.
- Handoff is trivial.

### Option B — PHI-containing tracker

The application stores patient name and MRN.

Consequences:

- Requires a signed BAA with every vendor touching the data (hosting, database, auth,
  email, error monitoring, analytics). Free tiers generally do not include one.
- Requires encryption at rest and in transit, mandatory authentication for all access
  including writes, session timeouts, full audit logging, and a documented
  breach-response process.
- Requires UMMC IT security and privacy office review before launch.
- Realistically moves hosting to institution-approved infrastructure and pushes the
  timeline from weeks to months.
- Anonymous data entry becomes impossible.

If Option B is chosen, the honest recommendation is to not build a custom application and
instead use REDCap, which already satisfies these requirements and is typically free to
the institution.

**The remainder of this document assumes Option A.**

---

## 3. Users and roles

Keep the permission model as small as it can be while remaining useful. Two roles:

| Role | Can do |
| --- | --- |
| **Member** | View all projects. Create projects. Edit any project they are listed as an owner of. Add people to the owner roster. Archive their own projects. |
| **Admin** | Everything a Member can do, plus: edit or archive any project, permanently delete records, manage the owner roster (deactivate people, merge duplicates), assign roles, export data. |

Admins in practice: program director, program coordinator, chief resident, and the
current site maintainer.

Deletion is soft by default. "Delete" sets an `archived_at` timestamp and removes the
record from default views. Only an Admin can hard-delete, and hard deletion should
require a confirmation step. Nothing a resident spent a year on should be one misclick
from gone.

---

## 4. Authentication

### Requirements

- No new username/password for users to remember.
- Access restricted to UMMC-affiliated people.
- Every write is attributable to a person (non-negotiable — it is what makes the
  ownership feature work at all).

### Recommended: institutional SSO

If UMMC uses Microsoft 365 (very likely) or Google Workspace, use OAuth against the
institutional tenant, restricted to the UMMC domain. Users click "Sign in with UMMC,"
land in a login screen they already recognize, and are in. Zero new credentials,
strongest security, and offboarding is automatic when someone's institutional account is
deactivated.

Cost: requires an app registration from UMMC IT. This is a small, routine ask, but it is
a dependency on someone else's timeline. Start this conversation early.

### Fallback: email magic link, domain-restricted

User enters their `@umc.edu` address, receives a one-time link, clicks it, and gets a
session lasting 30–90 days. No password is ever created or stored. The domain allowlist
keeps outsiders out. Supabase, Clerk, and Auth0 all provide this on free tiers with
roughly an hour of integration work.

This is the pragmatic default if SSO cannot be obtained quickly, and it is genuinely
low-friction — most users will sign in two or three times a year.

### Considered and not recommended

- **Shared passcode.** Simplest possible, but produces no audit trail, no per-user
  permissions, and no ownership attribution. Rotating it when residents graduate is a
  manual chore everyone forgets. Only acceptable for a throwaway prototype.
- **Passkeys.** Modern and passwordless, but device-bound enrollment adds friction for a
  population that turns over annually.
- **Anonymous writes.** Rejected. It destroys attribution, invites junk data, and has no
  upside once magic links exist.

---

## 5. Data model

### `people` (owner roster)

The point of this table is to prevent "J. Smith," "John Smith," and "Smith, John" from
becoming three people.

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `display_name` | Required |
| `email` | Optional, institutional |
| `role` | Enum: resident, fellow, attending, medical student, research coordinator, external collaborator |
| `pgy_level` | Optional, residents only |
| `is_active` | Boolean, default true |
| `created_at` | |

Never hard-delete a person attached to a project. Deactivate instead: they stop appearing
in the owner picker but historical attribution survives. This matters when a resident
graduates and you still need to know who ran the 2024 QI project.

Provide an admin "merge duplicates" action. Duplicates will happen regardless of how good
the picker is.

### `projects` (common fields, all types)

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `title` | Required |
| `type` | Enum: case_report, qa_qi, research, review |
| `work_status` | See §6 |
| `owners` | Many-to-many with people, at least one required |
| `notes` | Free text, generous size. This is the notepad. Markdown-rendered. |
| `next_action` | Optional short text |
| `next_action_due` | Optional date |
| `irb_status` | Enum: not applicable, not yet submitted, submitted, approved, exempt determination |
| `academic_year` | Auto-derived from creation date, editable |
| `created_by` | FK to people |
| `created_at` / `updated_at` | |
| `archived_at` | Nullable |

### `project_venues` (child records, one project → many)

A project frequently has more than one destination, sequentially or simultaneously. A
case report can be a regional poster and under review at a journal. Modeling this as a
single field loses that.

| Field | Notes |
| --- | --- |
| `venue_type` | Enum: conference presentation, poster, journal, internal presentation, other |
| `venue_name` | Free text, e.g. "AAD Annual Meeting", "JAAD Case Reports" |
| `submission_status` | See §6 |
| `target_date` | Optional |
| `notes` | Optional |

If this feels like too much for v1, ship a single free-text "target venue" field instead
and add this table later — but the schema should be designed so the migration is easy.

### Type-specific fields

**Case report**

- `case_number` — system-generated, e.g. CR-2026-014. The only patient reference stored.
  Carries no information on its own.
- `diagnosis` — required
- `why_unique` — required, free text
- `attending` — FK to people. Who to ask about the case; usually a co-author.
- `year_seen` — year only, integer. Not a full date.
- `patient_consent_obtained` — enum: yes / no / not yet / not applicable

The project title should be descriptive enough to recognize at a glance ("Disseminated
gonococcal rash"). Titles appear in CSV exports and ACGME reports, so keep them
clinically descriptive rather than colorful about the patient.

⚠️ **Fields deliberately excluded:** patient name, MRN, date of birth, and date of
service. Date of service is an explicit HIPAA identifier, and date + attending +
diagnosis is a self-decoding lookup key in a department this size — anyone with EMR
access could re-identify the patient in under a minute. Year alone is permitted under
Safe Harbor and is sufficient for sorting and cohort context.

The UI must include a short inline note on the case report form reminding users not to
enter identifiers in free-text fields either. Consider a lightweight client-side warning
if a free-text field matches an MRN-shaped pattern.

**Case ID → patient mapping (lives outside this application)**

Recommended: a patient list in the EMR named e.g. "Derm Scholarly Projects," with the
case ID recorded on each entry. This requires no new infrastructure, sits inside UMMC's
existing compliance boundary, and inherits the EMR's existing access logging. REDCap is a
reasonable alternative if structured fields are wanted.

This mapping is never stored in, referenced by, or linked from the tracker.

**QA/QI**

- `description` — required
- `aim_statement` — optional
- `measure` — optional, "what are we measuring to know it worked"

**Larger research project**

- `description` — required
- `study_design` — enum: survey, retrospective, prospective, cross-sectional, other
- `data_source` — optional free text

**Review**

- `description` — required
- `review_type` — enum: narrative, systematic, scoping
- `research_question` — optional

### `audit_log`

Append-only: actor, action, entity type, entity id, timestamp, changed fields. Cheap to
build, and the first time someone asks "who changed this status?" it pays for itself.

---

## 6. Status fields

The statuses in the original brief mix two independent things. Keep them as separate
fields — a project can be actively in edit for a journal while already accepted for a
poster.

**Work status** (where the project itself stands)
Idea → Planning → Collecting data → Actively researching / analyzing → Rough draft →
In edit → Complete → On hold → Abandoned

**Submission status** (per venue, on `project_venues`)
Not yet submitted → Submitted → Awaiting review → In review → Revisions requested →
Accepted → Presented / Published → Declined → Withdrawn

Both should be simple enums, editable by admins without a code change if that's cheap to
build. Do not enforce transitions — any status should be settable from any other status.
Real projects move backwards.

---

## 7. Features — v1 scope

### Must have

- Project list view with filter by type, work status, owner, academic year, and archived state
- Free-text search across title, notes, and diagnosis
- Create / edit / archive project
- Owner picker with typeahead against the people roster, plus inline "add new person"
  without leaving the form
- Multi-owner assignment and removal
- Project detail view with full notes
- CSV export of all projects (build this in v1 — it is the escape hatch and the handoff
  mechanism)
- Responsive layout: usable on phone, tablet, laptop, and large monitor

### Should have

- "My projects" filtered view
- Sort by last updated, to surface stale projects
- Dashboard counts by type and status

### Explicitly out of scope for v1

- File, image, or document attachments
- Email notifications and reminders
- Comment threads
- Version history beyond the audit log
- Any integration with the EMR

---

## 8. ACGME reporting

Worth building deliberately, because it converts this from a personal tool into something
the program depends on: ACGME requires annual reporting of resident scholarly activity.
If the CSV export can be shaped to match the fields the program coordinator currently
assembles by hand, the tool earns institutional buy-in and a maintenance budget.

Ask the program coordinator what that report currently looks like before finalizing the
export format.

---

## 9. Technical stack

Selected for cost, portability, and ease of handoff.

| Layer | Choice | Rationale |
| --- | --- | --- |
| Frontend | Next.js (React) + Tailwind CSS | Responsive by default, large hiring pool, extensive documentation |
| Database | Postgres via Supabase | Standard SQL. Handoff is a `pg_dump`. Not locked into a proprietary datastore. |
| Auth | Supabase Auth (magic link + OAuth) | Free tier covers this scale; supports both auth options in §4 |
| Authorization | Postgres Row Level Security | Permissions enforced at the database layer, not just hidden in the UI |
| Hosting | Vercel | Free tier is sufficient; automatic HTTPS; deploys from Git |
| Domain | Registrar of choice, ~$12/yr | Or use the free `*.vercel.app` subdomain initially |

Expected cost: $0–25/month at this scale.

**Why Postgres over Firestore:** the handoff requirement. A future maintainer can move a
Postgres database to any host, or self-host Supabase entirely. Document-store data is
meaningfully harder to migrate out of.

**Alternative worth ten minutes of consideration:** if UMMC is on Microsoft 365, a
SharePoint List or Microsoft List provides most of this functionality with institutional
SSO, zero hosting, zero cost, and no maintainer required — inside the compliance boundary
from day one. It is less attractive and far less customizable. But if the goal is
"organized notepad that outlives me," it is a legitimate contender and should be ruled
out consciously rather than by default.

---

## 10. Design and branding

- Use UMMC's institutional blue and gray. Pull exact hex values from the official brand
  guide rather than sampling from a website screenshot.
- Do not use the UMMC logo, seal, wordmark, or any copyrighted imagery.
- Use a simple text wordmark, e.g. "Dermatology Project Tracker," in the institutional navy.
- Placeholder palette pending brand guide values: deep navy for primary actions and
  headers, mid-gray for secondary text and borders, near-white background, single accent
  color reserved for status badges.
- Target WCAG 2.1 AA contrast. This is a medical center; accessibility will be asked about.
- Mobile-first layout. Table views collapse to cards below ~768px.

---

## 11. Operations

- **Backups:** enable automated daily database backups. Additionally, schedule a monthly
  CSV export to a shared institutional drive. Redundant, cheap, and the version a
  non-technical successor can actually use.
- **Monitoring:** basic uptime check is sufficient.
- **Handoff package:** README covering local setup, environment variables, deploy
  process, admin procedures, and a named successor. Write this as you build, not at the end.
- **Account ownership:** register hosting, database, and domain accounts under a
  departmental email address, not a personal or resident one. Residents graduate; the
  accounts should not leave with them.

---

## 12. Open decisions

- ⚠️ PHI: Option A or Option B (§2)
- Auth: institutional SSO or magic link (§4) — begin the IT conversation now either way
- Who are the initial admins?
- Does UMMC IT require a security review for a de-identified, non-branded site on
  external hosting?
- Does this need to live at a `umc.edu` subdomain, or is an independent domain acceptable?
- Confirm the department has REDCap access as the identifier-mapping location
- Obtain the brand guide hex values
- Confirm ACGME scholarly-activity export fields with the program coordinator
- Named successor and maintenance owner after the current resident graduates
- Ship `project_venues` in v1, or start with a single free-text venue field?
