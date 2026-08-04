-- =====================================================================
-- Dermatology Resident Project Tracker
-- Migration 0001 — core schema
--
-- UMMC Department of Dermatology
-- Assumes PHI Option A (§2): NO protected health information is stored.
-- Case reports are keyed by a system-generated case_id only. The
-- case_id -> patient mapping lives in the EMR / REDCap and is never
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

create type person_role as enum (
  'resident', 'fellow', 'attending', 'medical_student',
  'research_coordinator', 'external_collaborator'
);

create type app_role as enum ('member', 'admin');

create type project_type as enum ('case_report', 'qa_qi', 'research', 'review');

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
  code        text primary key,
  label       text not null,
  sort_order  integer not null,
  is_terminal boolean not null default false,
  is_active   boolean not null default true
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
  code        text primary key,
  label       text not null,
  sort_order  integer not null,
  is_terminal boolean not null default false,
  is_active   boolean not null default true
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
-- 4. people — the owner roster (§5)
-- ---------------------------------------------------------------------
-- Exists to stop "J. Smith", "John Smith" and "Smith, John" from
-- becoming three people. NEVER hard-delete a person attached to a
-- project — deactivate instead, so historical attribution survives
-- after a resident graduates.

create table people (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  display_name  text not null check (length(btrim(display_name)) > 0),
  email         text,   -- normalized to lowercase on write
  role          person_role not null,
  app_role      app_role not null default 'member',
  pgy_level     smallint check (pgy_level between 1 and 9),
  is_active     boolean not null default true,
  merged_into   uuid references people(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- pgy_level is meaningful for residents only
  constraint pgy_residents_only
    check (pgy_level is null or role = 'resident'),
  -- a merged record is by definition inactive and points elsewhere
  constraint merged_is_inactive
    check (merged_into is null or is_active = false),
  constraint no_self_merge
    check (merged_into is null or merged_into <> id)
);

create unique index people_email_unique
  on people (lower(email)) where email is not null;
create index people_active_name on people (is_active, display_name);

comment on column people.merged_into is
  'Set by the admin merge-duplicates action. Historical rows keep pointing at this person; the UI follows the pointer.';

-- ---------------------------------------------------------------------
-- 5. projects — common fields for all types (§5)
-- ---------------------------------------------------------------------

create table projects (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(btrim(title)) > 0),
  type             project_type not null,
  work_status      text not null default 'idea'
                     references work_statuses(code) on update cascade,
  purpose          text,                  -- the goal / why this matters
  notes            text,                  -- the notepad. Markdown-rendered.
  next_action      text,
  next_action_due  date,
  irb_status       irb_status not null default 'not_applicable',
  academic_year    integer not null,      -- start year; auto-derived, editable
  created_by       uuid references people(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz,           -- soft delete (§3)
  search_vector    tsvector
);

create index projects_type            on projects (type);
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
-- 6. project_owners — many-to-many, at least one required (§5, §7)
-- ---------------------------------------------------------------------

create table project_owners (
  project_id uuid not null references projects(id) on delete cascade,
  person_id  uuid not null references people(id)   on delete restrict,
  added_at   timestamptz not null default now(),
  primary key (project_id, person_id)
);

create index project_owners_person on project_owners (person_id);

-- "at least one owner" is checked at COMMIT, not per-statement, so the
-- app can swap owners inside a single transaction.
create or replace function assert_project_has_owner()
returns trigger
language plpgsql
as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
begin
  if exists (select 1 from projects where id = pid)
     and not exists (select 1 from project_owners where project_id = pid) then
    raise exception 'Every project needs at least one owner.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger project_owners_min_one
  after insert or update or delete on project_owners
  deferrable initially deferred
  for each row execute function assert_project_has_owner();

-- ---------------------------------------------------------------------
-- 7. project_venues — one project, many destinations (§5)
-- ---------------------------------------------------------------------
-- Shipped in v1. A case report can be a regional poster AND under
-- review at a journal at the same time; a single field loses that.

create table project_venues (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  venue_type        venue_type not null,
  venue_name        text not null check (length(btrim(venue_name)) > 0),
  submission_status text not null default 'not_yet_submitted'
                      references submission_statuses(code) on update cascade,
  target_date       date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
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
  case_id                   text not null unique,   -- e.g. CR-2026-014
  diagnosis                 text not null check (length(btrim(diagnosis)) > 0),
  why_unique                text not null check (length(btrim(why_unique)) > 0),
  attending_id              uuid references people(id) on delete set null,
  year_seen                 smallint check (year_seen between 1990 and 2100),
  patient_consent_obtained  consent_status not null default 'not_yet'
);

comment on table case_report_details is
  'Contains NO PHI. case_id is an opaque handle; its mapping to a patient lives only in the EMR/REDCap.';
comment on column case_report_details.year_seen is
  'Year only. A full date of service is a HIPAA identifier and must never be stored here.';

-- case_id sequence, per academic year
create table case_id_counters (
  academic_year integer primary key,
  last_seq      integer not null default 0
);

-- SECURITY DEFINER: case_id_counters is not writable by end users.
create or replace function assign_case_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ay  integer;
  seq integer;
begin
  if new.case_id is not null and length(btrim(new.case_id)) > 0 then
    return new;                              -- explicit override (migrations)
  end if;

  select academic_year into ay from projects where id = new.project_id;
  ay := coalesce(ay, academic_year_of(current_date));

  insert into case_id_counters (academic_year, last_seq)
    values (ay, 1)
  on conflict (academic_year)
    do update set last_seq = case_id_counters.last_seq + 1
  returning last_seq into seq;

  new.case_id := format('CR-%s-%s', ay, lpad(seq::text, 3, '0'));
  return new;
end;
$$;

create trigger case_report_assign_case_id
  before insert on case_report_details
  for each row execute function assign_case_id();

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
  select type into actual from projects where id = new.project_id;
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
-- owner, so it must not be subject to the owner-based UPDATE policy.
create or replace function refresh_project_search(p_id uuid)
returns void
language sql
security definer
set search_path = public
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
  id             bigserial primary key,
  actor_id       uuid references people(id) on delete set null,
  actor_label    text,          -- denormalized, survives person deletion
  action         text not null, -- insert | update | delete
  entity_type    text not null,
  entity_id      text not null,
  changed_fields jsonb,
  occurred_at    timestamptz not null default now()
);

create index audit_log_entity   on audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_occurred on audit_log (occurred_at desc);

create or replace function current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from people where auth_user_id = auth.uid();
$$;

create or replace function write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
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

  insert into audit_log (actor_id, actor_label, action, entity_type, entity_id, changed_fields)
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
create trigger audit_project_owners  after insert or delete on project_owners
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
