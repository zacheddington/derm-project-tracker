-- =====================================================================
-- Dermatology Resident Project Tracker
-- Migration 0001 — core schema
--
-- UMMC Department of Dermatology
-- Assumes PHI Option A (§2): NO protected health information is stored.
-- Case reports are keyed by a system-generated case_number only. The
-- case_number -> patient mapping lives in the EMR / REDCap and is never
-- stored in, referenced by, or linked from this database.
-- =====================================================================

-- No extensions required. gen_random_uuid() is core Postgres since 13,
-- and email case-insensitivity is handled with a normalizing trigger
-- rather than citext. Zero extensions keeps the handoff to a new
-- maintainer (or a self-hosted Postgres) as simple as possible.

-- ---------------------------------------------------------------------
-- 1. Conventions
-- ---------------------------------------------------------------------
-- ACADEMIC YEAR is stored as an INTEGER equal to the START year of the
-- July 1 – June 30 academic year. 2026 means "AY 2026–2027".
--
-- Enums that are genuinely fixed (project type, IRB status, venue type)
-- are native Postgres enums. The two STATUS fields (§6) are lookup
-- TABLES instead, because the spec requires admins to be able to edit
-- them without a code change or migration.
-- ---------------------------------------------------------------------

create or replace function academic_year_of(d date)
returns integer
language sql
immutable
as $$
  select case when extract(month from d) >= 7
              then extract(year from d)::int
              else extract(year from d)::int - 1
         end;
$$;

comment on function academic_year_of(date) is
  'Returns the start year of the July 1 - June 30 academic year containing d. 2026 = AY 2026-2027.';

-- ---------------------------------------------------------------------
-- 2. Fixed enums
-- ---------------------------------------------------------------------

-- What someone IS in the department. Distinct from permission_level,
-- which is what they may DO in this application. An attending with no
-- admin rights has staff_position='attending', permission_level='member'.
create type staff_position as enum (
  'resident', 'fellow', 'attending', 'medical_student',
  'research_fellow', 'external_collaborator'
);

comment on type staff_position is
  'Academic/clinical position in the department. Not an application permission — see permission_level.';

create type permission_level as enum ('member', 'admin');

comment on type permission_level is
  'Application access only. admin can edit the status vocabularies, merge duplicate people, and hard-delete.';

-- 'qa_qi' is Quality Assurance / Quality Improvement: a departmental
-- process-improvement project rather than a research study. It is the
-- term the department and ACGME both use, so it is kept verbatim.
create type project_type as enum ('case_report', 'qa_qi', 'research', 'review');

comment on type project_type is
  'case_report = single patient writeup; qa_qi = Quality Assurance/Quality Improvement process project; research = original study; review = literature review.';

create type irb_status as enum (
  'not_applicable', 'not_yet_submitted', 'submitted',
  'approved', 'exempt_determination'
);

create type venue_type as enum (
  'conference_presentation', 'poster', 'journal',
  'internal_presentation', 'other'
);

create type consent_status as enum ('yes', 'no', 'not_yet', 'not_applicable');

create type study_design as enum (
  'survey', 'retrospective', 'prospective', 'cross_sectional', 'other'
);

create type review_type as enum ('narrative', 'systematic', 'scoping');

-- ---------------------------------------------------------------------
-- 3. Editable status vocabularies (§6)
-- ---------------------------------------------------------------------
-- Two independent axes. A project can be "in edit" for a journal while
-- already "accepted" for a poster. Transitions are NEVER enforced —
-- any status is settable from any other status. Real projects move
-- backwards.

create table work_statuses (
  code          text primary key,
  label         text not null,
  sort_order    integer not null,
  -- A status nothing normally moves out of. Used for reporting ("how many
  -- finished?"), NOT enforced: any status is settable from any other.
  is_terminal   boolean not null default false,
  -- Whether this option is still offered in pickers. Retiring a status
  -- must not rewrite the projects already sitting in it.
  is_selectable boolean not null default true
);

insert into work_statuses (code, label, sort_order, is_terminal) values
  ('idea',            'Idea',                  10, false),
  ('planning',        'Planning',              20, false),
  ('collecting_data', 'Collecting data',       30, false),
  ('analyzing',       'Researching/analyzing', 40, false),
  ('rough_draft',     'Rough draft',           50, false),
  ('in_edit',         'In edit',               60, false),
  ('complete',        'Complete',              70, true),
  ('on_hold',         'On hold',               80, false),
  ('abandoned',       'Abandoned',             90, true);

create table submission_statuses (
  code          text primary key,
  label         text not null,
  sort_order    integer not null,
  -- A status nothing normally moves out of. Used for reporting ("how many
  -- finished?"), NOT enforced: any status is settable from any other.
  is_terminal   boolean not null default false,
  -- Whether this option is still offered in pickers. Retiring a status
  -- must not rewrite the projects already sitting in it.
  is_selectable boolean not null default true
);

insert into submission_statuses (code, label, sort_order, is_terminal) values
  ('not_yet_submitted',   'Not yet submitted',   10, false),
  ('submitted',           'Submitted',           20, false),
  ('awaiting_review',     'Awaiting review',     30, false),
  ('in_review',           'In review',           40, false),
  ('revisions_requested', 'Revisions requested', 50, false),
  ('accepted',            'Accepted',            60, false),
  ('presented_published', 'Presented/Published', 70, true),
  ('declined',            'Declined',            80, true),
  ('withdrawn',           'Withdrawn',           90, true);

-- ---------------------------------------------------------------------
-- 4. people — the author roster (§5)
-- ---------------------------------------------------------------------
-- Exists to stop "J. Smith", "John Smith" and "Smith, John" from
-- becoming three people. NEVER hard-delete a person attached to a
-- project — deactivate instead, so historical attribution survives
-- after a resident graduates.

create table people (
  id                   uuid primary key default gen_random_uuid(),
  auth_user_id         uuid unique references auth.users(id) on delete set null,
  display_name         text not null check (length(btrim(display_name)) > 0),
  email                text,   -- normalized to lowercase on write
  staff_position       staff_position not null,
  permission_level     permission_level not null default 'member',
  -- Postgraduate year, 1-9. Residents only; null for everyone else.
  pgy_level            smallint check (pgy_level between 1 and 9),
  -- Free text, and only for external collaborators: the vocabulary
  -- cannot usefully enumerate what someone outside the department does.
  external_position    text,
  -- NULL means currently employed. A date in the future means they have
  -- given notice and are still here. Employment is a range, not a flag,
  -- because "who was here when this ran?" is a real question and a
  -- boolean cannot answer it.
  employment_end_date  date,
  merged_into          uuid references people(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint pgy_level_residents_only
    check (pgy_level is null or staff_position = 'resident'),
  constraint external_position_external_only
    check (external_position is null or staff_position = 'external_collaborator'),
  constraint no_self_merge
    check (merged_into is null or merged_into <> id)
);

create unique index people_email_unique
  on people (lower(email)) where email is not null;
create index people_currently_employed
  on people (employment_end_date, display_name);

comment on column people.merged_into is
  'Set by the admin merge-duplicates action. Points at the surviving record; historical rows keep pointing here and the UI follows the pointer. A row with merged_into set is a superseded duplicate and is excluded from pickers.';
comment on column people.employment_end_date is
  'Last day of employment. NULL = still here. People are never deleted: attribution has to survive residents graduating.';

-- One place that answers "is this person still here?", so the rule is not
-- retyped (and mistyped) in every policy, view and query.
create or replace function is_currently_employed(employment_end_date date)
returns boolean
language sql
stable
as $$
  select employment_end_date is null or employment_end_date >= current_date;
$$;

comment on function is_currently_employed(date) is
  'True when the person has not left yet. A future end date still counts as employed.';

-- ---------------------------------------------------------------------
-- 5. projects — common fields for all types (§5)
-- ---------------------------------------------------------------------

create table projects (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null check (length(btrim(title)) > 0),
  project_type         project_type not null,
  work_status          text not null default 'idea'
                         references work_statuses(code) on update cascade,
  purpose              text,              -- the goal / why this matters
  notes                text,              -- the notepad. Markdown-rendered.
  next_action          text,
  next_action_due_date date,
  irb_status           irb_status not null default 'not_applicable',
  -- Start year of the July 1 - June 30 academic year. 2026 = AY 2026-2027.
  academic_year        integer not null,
  created_by           uuid references people(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,       -- soft delete (§3)
  search_vector        tsvector
);

create index projects_type            on projects (project_type);
create index projects_work_status     on projects (work_status);
create index projects_academic_year   on projects (academic_year);
create index projects_updated_at      on projects (updated_at desc);
create index projects_active          on projects (archived_at) where archived_at is null;
create index projects_search          on projects using gin (search_vector);

comment on column projects.archived_at is
  'Soft delete. Set by archive; removes the row from default views. Hard delete is admin-only and requires confirmation.';

-- default academic_year from creation date, and keep updated_at honest
create or replace function projects_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.academic_year is null then
    new.academic_year := academic_year_of(current_date);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function people_before_write()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  return new;
end;
$$;

create trigger people_before_write
  before insert or update on people
  for each row execute function people_before_write();

create trigger projects_before_write
  before insert or update on projects
  for each row execute function projects_before_write();

-- ---------------------------------------------------------------------
-- 6. project_authors — many-to-many, at least one required (§5, §7)
-- ---------------------------------------------------------------------

create table project_authors (
  project_id uuid not null references projects(id) on delete cascade,
  person_id  uuid not null references people(id)   on delete restrict,
  added_at   timestamptz not null default now(),
  primary key (project_id, person_id)
);

create index project_authors_person on project_authors (person_id);

-- "at least one author" is checked at COMMIT, not per-statement, so the
-- app can swap authors inside a single transaction.
create or replace function assert_project_has_author()
returns trigger
language plpgsql
as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
begin
  if exists (select 1 from projects where id = pid)
     and not exists (select 1 from project_authors where project_id = pid) then
    raise exception 'Every project needs at least one author.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger project_authors_min_one
  after insert or update or delete on project_authors
  deferrable initially deferred
  for each row execute function assert_project_has_author();

-- ---------------------------------------------------------------------
-- 7. project_venues — one project, many destinations (§5)
-- ---------------------------------------------------------------------
-- Shipped in v1. A case report can be a regional poster AND under
-- review at a journal at the same time; a single field loses that.

create table project_venues (
  id                       uuid primary key default gen_random_uuid(),
  project_id               uuid not null references projects(id) on delete cascade,
  venue_type               venue_type not null,
  -- Free text, and only when venue_type = 'other': what this actually is.
  -- The constraint keeps a stale description from surviving a change of
  -- kind, which is the usual way a field like this starts lying.
  other_venue_description  text,
  venue_name               text not null check (length(btrim(venue_name)) > 0),
  submission_status        text not null default 'not_yet_submitted'
                             references submission_statuses(code) on update cascade,
  target_date              date,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint other_venue_description_other_only
    check (venue_type = 'other' or other_venue_description is null)
);

create index project_venues_project on project_venues (project_id);
create index project_venues_status  on project_venues (submission_status);

-- ---------------------------------------------------------------------
-- 8. Type-specific detail tables (§5)
-- ---------------------------------------------------------------------
-- Separate 1:1 tables rather than one wide sparse table, so that fields
-- the spec marks "required" can actually be NOT NULL. A flattening view
-- for export lives in migration 0003.

-- --- Case report ------------------------------------------------------
-- NOTE: patient name, MRN, date of birth and DATE OF SERVICE are
-- deliberately absent. Date of service is an explicit HIPAA identifier,
-- and date + attending + diagnosis is a self-decoding lookup key in a
-- department this size. Year alone is Safe Harbor-permissible and is
-- enough for sorting and cohort context. Do not add them back.

create table case_report_details (
  project_id                uuid primary key references projects(id) on delete cascade,
  case_number                   text not null unique,   -- e.g. CR-2026-014
  diagnosis                 text not null check (length(btrim(diagnosis)) > 0),
  why_unique                text not null check (length(btrim(why_unique)) > 0),
  attending_id              uuid references people(id) on delete set null,
  year_seen                 smallint check (year_seen between 1990 and 2100),
  patient_consent_obtained  consent_status not null default 'not_yet'
);

comment on table case_report_details is
  'Contains NO PHI. case_number is an opaque handle; its mapping to a patient lives only in the EMR/REDCap.';
comment on column case_report_details.year_seen is
  'Year only. A full date of service is a HIPAA identifier and must never be stored here.';

-- case_number sequence, per academic year
create table case_number_counters (
  academic_year integer primary key,
  last_sequence_number      integer not null default 0
);

-- SECURITY DEFINER: case_number_counters is not writable by end users.
create or replace function assign_case_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ay  integer;
  seq integer;
begin
  if new.case_number is not null and length(btrim(new.case_number)) > 0 then
    return new;                              -- explicit override (migrations)
  end if;

  select academic_year into ay from projects where id = new.project_id;
  ay := coalesce(ay, academic_year_of(current_date));

  insert into case_number_counters (academic_year, last_sequence_number)
    values (ay, 1)
  on conflict (academic_year)
    do update set last_sequence_number = case_number_counters.last_sequence_number + 1
  returning last_sequence_number into seq;

  new.case_number := format('CR-%s-%s', ay, lpad(seq::text, 3, '0'));
  return new;
end;
$$;

create trigger case_report_assign_case_id
  before insert on case_report_details
  for each row execute function assign_case_number();

-- --- QA / QI ----------------------------------------------------------
create table qa_qi_details (
  project_id    uuid primary key references projects(id) on delete cascade,
  description   text not null check (length(btrim(description)) > 0),
  aim_statement text,
  measure       text            -- "what are we measuring to know it worked"
);

-- --- Larger research project -----------------------------------------
create table research_details (
  project_id   uuid primary key references projects(id) on delete cascade,
  description  text not null check (length(btrim(description)) > 0),
  study_design study_design,
  data_source  text
);

-- --- Review -----------------------------------------------------------
create table review_details (
  project_id        uuid primary key references projects(id) on delete cascade,
  description       text not null check (length(btrim(description)) > 0),
  review_type       review_type,
  research_question text
);

-- Keep the detail row's type in step with its parent project.
create or replace function assert_detail_type_matches()
returns trigger
language plpgsql
as $$
declare
  expected project_type := tg_argv[0]::project_type;
  actual   project_type;
begin
  select project_type into actual from projects where id = new.project_id;
  if actual is distinct from expected then
    raise exception 'Project % is type %, cannot attach % details.',
      new.project_id, actual, expected
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger case_report_type_guard before insert or update on case_report_details
  for each row execute function assert_detail_type_matches('case_report');
create trigger qa_qi_type_guard before insert or update on qa_qi_details
  for each row execute function assert_detail_type_matches('qa_qi');
create trigger research_type_guard before insert or update on research_details
  for each row execute function assert_detail_type_matches('research');
create trigger review_type_guard before insert or update on review_details
  for each row execute function assert_detail_type_matches('review');

-- ---------------------------------------------------------------------
-- 9. Free-text search (§7)
-- ---------------------------------------------------------------------
-- Across title, purpose, notes and diagnosis. Diagnosis lives in a child
-- table, so the vector is trigger-maintained rather than generated.

-- SECURITY DEFINER: this fires during INSERT, before the project has an
-- author, so it must not be subject to the author-based UPDATE policy.
create or replace function refresh_project_search(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update projects p set search_vector =
      setweight(to_tsvector('english', coalesce(p.title, '')),   'A')
    || setweight(to_tsvector('english', coalesce(c.diagnosis, '')), 'A')
    || setweight(to_tsvector('english', coalesce(p.purpose, '')), 'B')
    || setweight(to_tsvector('english', coalesce(p.notes, '')),   'C')
  from (select 1) _
  left join case_report_details c on c.project_id = p_id
  where p.id = p_id;
$$;

create or replace function projects_search_sync()
returns trigger
language plpgsql
as $$
begin
  perform refresh_project_search(new.id);
  return null;
end;
$$;

create trigger projects_search_sync
  after insert or update of title, purpose, notes on projects
  for each row execute function projects_search_sync();

create or replace function case_details_search_sync()
returns trigger
language plpgsql
as $$
begin
  perform refresh_project_search(new.project_id);
  return null;
end;
$$;

create trigger case_details_search_sync
  after insert or update of diagnosis on case_report_details
  for each row execute function case_details_search_sync();

-- ---------------------------------------------------------------------
-- 10. audit_log — append-only (§5)
-- ---------------------------------------------------------------------
-- Cheap to build, and it pays for itself the first time someone asks
-- "who changed this status?"

create table audit_log (
  id                 bigserial primary key,
  actor_id           uuid references people(id) on delete set null,
  -- Denormalized on purpose: the name as it was at the time, so the log
  -- still reads correctly after a rename or a merge.
  actor_display_name text,
  operation          text not null check (operation in ('insert', 'update', 'delete')),
  audited_table      text not null,   -- the table the change happened in
  audited_record_id  text not null,   -- primary key of the changed row, as text
  changed_fields     jsonb,           -- {column: {from, to}} for updates
  occurred_at        timestamptz not null default now()
);

create index audit_log_record   on audit_log (audited_table, audited_record_id, occurred_at desc);
create index audit_log_occurred on audit_log (occurred_at desc);

create or replace function current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from people where auth_user_id = auth.uid();
$$;

create or replace function write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changes  jsonb := '{}'::jsonb;
  k        text;
  old_j    jsonb;
  new_j    jsonb;
  actor    uuid := current_person_id();
  ent_id   text;
begin
  old_j := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j := case when tg_op <> 'DELETE' then to_jsonb(new) end;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if k not in ('updated_at', 'search_vector')
         and (old_j -> k) is distinct from (new_j -> k) then
        changes := changes || jsonb_build_object(
          k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
      end if;
    end loop;
    if changes = '{}'::jsonb then
      return null;                      -- nothing meaningful changed
    end if;
  else
    changes := coalesce(new_j, old_j) - 'search_vector';
  end if;

  ent_id := coalesce(new_j ->> 'id', old_j ->> 'id',
                     new_j ->> 'project_id', old_j ->> 'project_id');

  insert into audit_log (actor_id, actor_display_name, operation, audited_table, audited_record_id, changed_fields)
  values (
    actor,
    (select display_name from people where id = actor),
    lower(tg_op),
    tg_table_name,
    ent_id,
    changes
  );
  return null;
end;
$$;

create trigger audit_projects        after insert or update or delete on projects
  for each row execute function write_audit_log();
create trigger audit_project_venues  after insert or update or delete on project_venues
  for each row execute function write_audit_log();
create trigger audit_project_authors after insert or delete on project_authors
  for each row execute function write_audit_log();
create trigger audit_people          after insert or update or delete on people
  for each row execute function write_audit_log();
create trigger audit_case_details    after insert or update or delete on case_report_details
  for each row execute function write_audit_log();
create trigger audit_qa_qi_details   after insert or update or delete on qa_qi_details
  for each row execute function write_audit_log();
create trigger audit_research_details after insert or update or delete on research_details
  for each row execute function write_audit_log();
create trigger audit_review_details  after insert or update or delete on review_details
  for each row execute function write_audit_log();
