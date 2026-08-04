-- =====================================================================
-- Migration 0002 — authorization
--
-- Permissions are enforced at the database layer (§9), not hidden in the
-- UI. Two permission levels only (§3):
--   member — read everything; create, edit and archive ANY project;
--            edit authorship; add people to the roster
--   admin  — everything above, plus hard-delete, manage the roster,
--            assign permission levels, merge duplicates, read the audit log
--
-- Editing is intentionally not limited to a project's own authors. See
-- the note on projects_update, and docs/DECISIONS.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Access gate
-- ---------------------------------------------------------------------
-- Access is restricted to UMMC-affiliated people (§4). The primary gate
-- is the auth provider (institutional SSO, or magic link with a domain
-- allowlist). This is the belt-and-braces second gate.

create table app_settings (
  key   text primary key,
  value jsonb not null
);

insert into app_settings (key, value) values
  ('allowed_email_domains', '["umc.edu"]'::jsonb);

-- Compares the domain part for equality rather than pattern-matching the
-- whole address. LIKE would treat `_` and `%` in a configured domain as
-- wildcards — `my_school.edu` would also admit `myXschool.edu` — and an
-- allowlist that silently matches more than it says is the wrong kind of
-- surprise. Equality also rejects `someone@evil.com@umc.edu`, which a
-- trailing-match LIKE accepts.
create or replace function is_allowed_email(addr text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from app_settings s,
         jsonb_array_elements_text(s.value) d
    where s.key = 'allowed_email_domains'
      and length(coalesce(addr, '')) > 0
      and split_part(lower(btrim(addr)), '@', 2) = lower(btrim(d))
      and split_part(lower(btrim(addr)), '@', 3) = ''   -- exactly one @
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Role helpers
-- ---------------------------------------------------------------------
-- SECURITY DEFINER so they can read `people` without re-entering RLS
-- and recursing.
--
-- Every SECURITY DEFINER function in this schema sets
-- `search_path = public, pg_temp`, and the `pg_temp` part is load-bearing.
-- Postgres searches the temporary schema FIRST for relation names unless
-- pg_temp is listed explicitly, so a definer function that sets only
-- `= public` can be handed a caller-created `pg_temp.people` and will
-- happily read it with the owner's privileges. Naming pg_temp last puts
-- it after public and closes that. Do not drop it from any of them.

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select permission_level = 'admin' and is_currently_employed(employment_end_date)
       from people where auth_user_id = auth.uid()),
    false);
$$;

create or replace function is_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select is_currently_employed(employment_end_date) from people where auth_user_id = auth.uid()),
    false);
$$;

-- Whether the signed-in person is an author of this project.
--
-- NOT a permission gate. Editing is open to any member (see the projects
-- policies below); this exists so the application can show "your project"
-- affordances — highlighting, default filters, notifications — without
-- reimplementing the join client-side.
create or replace function is_project_author(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from project_authors pa
    join people pe on pe.id = pa.person_id
    where pa.project_id = p_id
      and pe.auth_user_id = auth.uid());
$$;

comment on function is_project_author(uuid) is
  'True when the signed-in person is an author of this project. Informational only — not used to grant or deny access.';

-- ---------------------------------------------------------------------
-- 3. Linking auth.users to people
-- ---------------------------------------------------------------------
-- On first sign-in, attach the auth account to an existing roster entry
-- with the same email, or create one. This is what makes every write
-- attributable (§4) without asking anyone to fill out a profile.

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing uuid;
begin
  if not is_allowed_email(new.email) then
    raise exception 'Email domain not permitted for this application.';
  end if;

  select id into existing
  from people
  where lower(email) = lower(new.email) and auth_user_id is null
  limit 1;

  if existing is not null then
    update people
      set auth_user_id = new.id,
          employment_end_date = null,
          updated_at   = now()
      where id = existing;
  else
    insert into people (auth_user_id, display_name, email, staff_position)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
               split_part(new.email, '@', 1)),
      lower(new.email),
      'resident'          -- sensible default; an admin corrects it
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 4. Column-level guards RLS cannot express
-- ---------------------------------------------------------------------

create or replace function guard_people_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null when the call is not coming through the API:
  -- the service role, a migration, or an admin in the SQL editor. Those
  -- paths are already privileged, and this is how the first admin gets
  -- bootstrapped. Guard the API path only.
  if auth.uid() is null or is_admin() then
    return new;
  end if;

  if new.permission_level is distinct from old.permission_level then
    raise exception 'Only an admin can change a permission level.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Roster facts, not self-description. staff_position decides who counts
  -- as a resident in the ACGME report and who appears in the attending
  -- picker, so letting people set their own means the reports say whatever
  -- the roster feels like that day.
  if new.staff_position is distinct from old.staff_position then
    raise exception 'Only an admin can change a staff position.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Employment dates decide who is still a member. Self-service here is a
  -- way to lock yourself out by accident, and a way to quietly remove
  -- someone from every picker if the policy is ever widened.
  if new.employment_end_date is distinct from old.employment_end_date then
    raise exception 'Only an admin can change an employment end date.'
      using errcode = 'insufficient_privilege';
  end if;

  -- The email is the key the auth provider matches a sign-in against.
  if new.email is distinct from old.email then
    raise exception 'Only an admin can change a roster email address.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.merged_into is distinct from old.merged_into then
    raise exception 'Only an admin can merge people.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Sign-in linkage cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger people_privileged_columns
  before update on people
  for each row execute function guard_people_privileged_columns();

-- New roster entries created inline from the author picker are plain
-- members, whatever the client sends.
create or replace function default_new_person_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.permission_level := 'member';
  end if;
  return new;
end;
$$;

create trigger people_default_privileges
  before insert on people
  for each row execute function default_new_person_privileges();

-- ---------------------------------------------------------------------
-- 5. Enable RLS
-- ---------------------------------------------------------------------

alter table people               enable row level security;
alter table projects             enable row level security;
alter table project_authors       enable row level security;
alter table project_venues       enable row level security;
alter table case_report_details  enable row level security;
alter table qa_qi_details        enable row level security;
alter table research_details     enable row level security;
alter table review_details       enable row level security;
alter table work_statuses        enable row level security;
alter table submission_statuses  enable row level security;
alter table audit_log            enable row level security;
alter table app_settings         enable row level security;
alter table case_number_counters     enable row level security;

-- --- people -----------------------------------------------------------
create policy people_read on people
  for select to authenticated using (is_member());

create policy people_insert on people
  for insert to authenticated with check (is_member());

create policy people_update_self on people
  for update to authenticated
  using (is_member() and (auth_user_id = auth.uid() or is_admin()))
  with check (is_member() and (auth_user_id = auth.uid() or is_admin()));

-- Deliberately no member-facing delete. Deactivate instead (§5).
create policy people_delete_admin on people
  for delete to authenticated using (is_admin());

-- --- projects ---------------------------------------------------------
-- Everyone sees everything, archived included; the default list view
-- filters archived rows out in the query, not in the policy.
create policy projects_read on projects
  for select to authenticated using (is_member());

create policy projects_insert on projects
  for insert to authenticated with check (is_member());

-- Any member edits and archives anything.
--
-- This is deliberate, and it is the department's own decision: this is a
-- shared record of the department's work, and a resident correcting an
-- attending's typo is the system functioning. An author-only lock stops
-- the wrong edits by also stopping the right ones, and the usual result
-- is that corrections never get made at all.
--
-- What makes it safe is that nothing is silently lost: audit_log records
-- every change with the actor and the before/after values, and archiving
-- is reversible. Hard delete stays admin-only.
create policy projects_update on projects
  for update to authenticated
  using (is_member())
  with check (is_member());

-- Hard delete is admin-only, and the UI must confirm first (§3).
create policy projects_delete on projects
  for delete to authenticated using (is_admin());

-- --- project_authors ---------------------------------------------------
create policy project_authors_read on project_authors
  for select to authenticated using (is_member());

-- Authorship is editable by any member, for the same reason projects are:
-- the commonest correction is adding the person who was left off.
create policy project_authors_write on project_authors
  for insert to authenticated
  with check (is_member());

-- Removing the last author is allowed here and refused at COMMIT by the
-- project_authors_min_one constraint trigger, so authors can be swapped
-- inside one transaction without a moment where the project has none.
create policy project_authors_remove on project_authors
  for delete to authenticated
  using (is_member());

-- --- child tables inherit the parent project's rules ------------------
do $$
declare t text;
begin
  foreach t in array array[
    'project_venues', 'case_report_details', 'qa_qi_details',
    'research_details', 'review_details'
  ] loop
    execute format($f$
      create policy %1$s_read on %1$I
        for select to authenticated using (is_member());

      create policy %1$s_insert on %1$I
        for insert to authenticated
        with check (is_member());

      create policy %1$s_update on %1$I
        for update to authenticated
        using (is_member())
        with check (is_member());

      create policy %1$s_delete on %1$I
        for delete to authenticated
        using (is_member());
    $f$, t);
  end loop;
end $$;

-- --- status vocabularies ---------------------------------------------
-- Readable by all, editable by admins without a code change (§6).
create policy work_statuses_read on work_statuses
  for select to authenticated using (is_member());
create policy work_statuses_write on work_statuses
  for all to authenticated using (is_admin()) with check (is_admin());

create policy submission_statuses_read on submission_statuses
  for select to authenticated using (is_member());
create policy submission_statuses_write on submission_statuses
  for all to authenticated using (is_admin()) with check (is_admin());

-- --- audit log --------------------------------------------------------
-- Append-only: rows arrive via SECURITY DEFINER triggers, which bypass
-- RLS. No insert, update or delete policy exists for anyone, so the log
-- cannot be edited through the API even by an admin.
create policy audit_log_read on audit_log
  for select to authenticated using (is_admin());

-- --- settings and counters -------------------------------------------
create policy app_settings_read on app_settings
  for select to authenticated using (is_member());
create policy app_settings_write on app_settings
  for all to authenticated using (is_admin()) with check (is_admin());

-- case_number_counters is written only by the SECURITY DEFINER trigger.
create policy case_id_counters_read on case_number_counters
  for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------
-- RLS does the real work; these just open the door to the policies.

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  people, projects, project_authors, project_venues,
  case_report_details, qa_qi_details, research_details, review_details,
  work_statuses, submission_statuses, app_settings
  to authenticated;
grant select on audit_log, case_number_counters to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- The anon role gets nothing. There are no anonymous writes (§4).
revoke all on all tables in schema public from anon;
