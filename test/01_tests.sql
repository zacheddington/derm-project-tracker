-- =====================================================================
-- Behavioral tests. Run against a scratch database after the migrations.
-- Every check raises on failure, so a clean run means everything passed.
-- =====================================================================

create or replace function ok(cond boolean, label text)
returns void language plpgsql as $fn$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end $fn$;

-- Asserts that a statement is rejected, and that it is rejected for the
-- expected reason rather than a typo.
-- Row Level Security denies a write by matching ZERO ROWS, not by
-- raising. Only column guards and constraints raise. Both count as
-- denial; the app layer must treat "0 rows affected" as "not permitted"
-- rather than as success.
create or replace function denied(stmt text, label text, expect text default null)
returns void language plpgsql as $fn$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n = 0 then
    raise notice 'PASS  % (blocked by RLS: zero rows)', label;
    return;
  end if;
  raise exception 'FAIL  % (% row(s) affected; should have been none)', label, n;
exception
  when insufficient_privilege or check_violation then
    raise notice 'PASS  %', label;
  when others then
    if sqlstate = '42501' or sqlerrm ilike '%policy%' or sqlerrm ilike '%permission%'
       or (expect is not null and sqlerrm ilike '%' || expect || '%') then
      raise notice 'PASS  %', label;
    else
      raise exception 'FAIL  % (wrong error: % / %)', label, sqlstate, sqlerrm;
    end if;
end $fn$;

-- ---------------------------------------------------------------------
-- Fixtures: three users arriving through the auth trigger
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'coordinator@umc.edu', '{"full_name":"Dana Reyes"}'),
  ('22222222-2222-2222-2222-222222222222', 'rleblanc@umc.edu',    '{"full_name":"Rae LeBlanc"}'),
  ('33333333-3333-3333-3333-333333333333', 'tokafor@umc.edu',     '{"full_name":"Tomi Okafor"}');

do $t$ begin
  perform ok((select count(*) from people) = 3,
             'auth signup creates a roster entry for each user');
  perform ok((select display_name from people where email = 'coordinator@umc.edu') = 'Dana Reyes',
             'display_name comes from the identity provider');
end $t$;

-- Outside domains are rejected at the database, not just at the provider.
do $t$ begin
  perform denied($$insert into auth.users (email) values ('someone@gmail.com')$$,
                 'non-UMMC email is refused at signup', 'not permitted');
end $t$;

-- Promote the coordinator to admin (as the service role would, at setup).
update people set permission_level = 'admin', staff_position = 'research_fellow'
  where email = 'coordinator@umc.edu';
update people set staff_position = 'resident', pgy_level = 2 where email = 'rleblanc@umc.edu';
update people set staff_position = 'resident', pgy_level = 3 where email = 'tokafor@umc.edu';

-- ---------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------
do $t$ begin
  perform denied(
    $$insert into people (display_name, staff_position, pgy_level)
      values ('Dr Attending', 'attending', 4)$$,
    'pgy_level is rejected on non-residents');

  perform ok((select email from people where display_name = 'Rae LeBlanc') = 'rleblanc@umc.edu',
             'email is stored lowercased');
end $t$;

insert into people (display_name, staff_position, email)
  values ('Priya Raman', 'attending', 'PRaman@UMC.edu');
do $t$ begin
  perform ok((select email from people where display_name = 'Priya Raman') = 'praman@umc.edu',
             'mixed-case email is normalized on insert');
  perform denied(
    $$insert into people (display_name, staff_position, email) values ('Dup', 'attending', 'praman@umc.edu')$$,
    'duplicate email is refused', 'unique');
end $t$;

-- external_position exists only for people the vocabulary cannot describe.
do $t$ begin
  perform denied(
    $$insert into people (display_name, staff_position, external_position)
      values ('Wrong', 'attending', 'Pathologist')$$,
    'external_position is rejected on departmental staff');

  insert into people (display_name, staff_position, external_position)
    values ('Ben Iwu', 'external_collaborator', 'Dermatopathologist, Baptist Health');
  perform ok((select external_position from people where display_name = 'Ben Iwu')
             = 'Dermatopathologist, Baptist Health',
             'external_position is accepted on an external collaborator');
end $t$;

-- Employment is a date range. NULL means still here; a future date means
-- notice has been given but they have not left yet.
do $t$ begin
  perform ok(is_currently_employed(null),
             'no end date means currently employed');
  perform ok(is_currently_employed(current_date),
             'the last day of employment still counts as employed');
  perform ok(is_currently_employed(current_date + 30),
             'someone who has given notice is still employed');
  perform ok(not is_currently_employed(current_date - 1),
             'the day after the end date they are former staff');
end $t$;

-- ---------------------------------------------------------------------
-- Now act as real users, through RLS
-- ---------------------------------------------------------------------
set role authenticated;

-- --- Rae (resident, member) creates a case report ---------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $t$
declare pid uuid; rae uuid;
begin
  select id into rae from people where email = 'rleblanc@umc.edu';

  insert into projects (title, project_type, purpose, created_by)
    values ('Disseminated gonococcal rash', 'case_report',
            'Atypical presentation worth writing up', rae)
    returning id into pid;
  insert into project_authors (project_id, person_id) values (pid, rae);
  insert into case_report_details (project_id, diagnosis, why_unique)
    values (pid, 'Disseminated gonococcal infection',
            'Pustular rash preceded joint symptoms by nine days');

  perform ok((select case_number from case_report_details where project_id = pid)
             = 'CR-' || academic_year_of(current_date) || '-001',
             'first case report of the academic year gets sequence 001');
  perform ok((select work_status from projects where id = pid) = 'idea',
             'new projects default to Idea');
  perform ok((select academic_year from projects where id = pid) = academic_year_of(current_date),
             'academic year is derived from the creation date');
  perform ok((select search_vector from projects where id = pid) @@ to_tsquery('english', 'gonococcal'),
             'search finds a term that only appears in the diagnosis');
end $t$;

-- Second case report increments within the same year
do $t$
declare pid uuid; rae uuid;
begin
  select id into rae from people where email = 'rleblanc@umc.edu';
  insert into projects (title, project_type, created_by)
    values ('Bullous pemphigoid after gliptin exposure', 'case_report', rae) returning id into pid;
  insert into project_authors (project_id, person_id) values (pid, rae);
  insert into case_report_details (project_id, diagnosis, why_unique)
    values (pid, 'Bullous pemphigoid', 'Onset 14 months after starting therapy');
  perform ok((select case_number from case_report_details where project_id = pid)
             = 'CR-' || academic_year_of(current_date) || '-002',
             'case IDs increment within an academic year');
end $t$;

-- A project cannot be left with no author
do $t$
declare pid uuid; rae uuid;
begin
  select id into rae from people where email = 'rleblanc@umc.edu';
  begin
    insert into projects (title, project_type, created_by)
      values ('Orphan project', 'review', rae) returning id into pid;
    insert into project_authors (project_id, person_id) values (pid, rae);
    delete from project_authors where project_id = pid;
    -- deferred constraint fires at commit; force it now
    set constraints all immediate;
    raise exception 'FAIL  removing the last author was allowed';
  exception when check_violation then
    raise notice 'PASS  a project cannot be left with zero authors';
  end;
end $t$;
rollback;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- Details must match the parent project's type
do $t$
declare pid uuid; rae uuid;
begin
  select id into rae from people where email = 'rleblanc@umc.edu';
  insert into projects (title, project_type, created_by)
    values ('Clinic no-show reduction', 'qa_qi', rae) returning id into pid;
  insert into project_authors (project_id, person_id) values (pid, rae);

  perform denied(
    format($$insert into case_report_details (project_id, diagnosis, why_unique)
             values (%L, 'x', 'y')$$, pid),
    'case report details cannot attach to a QI project');

  insert into qa_qi_details (project_id, description, aim_statement, measure)
    values (pid, 'Reduce no-show rate in resident clinic',
            'Cut no-shows from 22% to 15% by June',
            'Monthly no-show rate from the scheduling report');
  perform ok(true, 'matching details attach normally');
end $t$;

-- --- Tomi (a different resident) edits Rae's project, which is allowed ---
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $t$
declare pid uuid;
begin
  select id into pid from projects where title = 'Disseminated gonococcal rash';

  perform ok((select count(*) from projects) >= 3,
             'every member can read every project');

  -- Editing is open to any member, not just a project's own authors.
  -- See projects_update in 0002 and the entry in docs/DECISIONS.md: this
  -- is a shared departmental record, and it is made safe by the audit log
  -- rather than by a lock that also blocks legitimate corrections.
  execute format($$update projects set work_status = 'abandoned' where id = %L$$, pid);
  perform ok((select work_status from projects where id = pid) = 'abandoned',
             'a member can edit a project they did not author');

  execute format($$update projects set archived_at = now() where id = %L$$, pid);
  perform ok((select archived_at from projects where id = pid) is not null,
             'a member can archive a project they did not author');

  execute format($$insert into project_venues (project_id, venue_type, venue_name)
                   values (%L, 'poster', 'Added by a non-author')$$, pid);
  perform ok(exists (select 1 from project_venues where venue_name = 'Added by a non-author'),
             'a member can add a venue to a project they did not author');

  -- Hard delete stays admin-only. Open editing is survivable because
  -- every change is recorded and archiving is reversible; a hard delete
  -- is neither.
  perform denied(
    format($$delete from projects where id = %L$$, pid),
    'a member still cannot hard-delete a project');
  perform ok(exists (select 1 from projects where id = pid),
             'the blocked delete did not remove the project');

  -- Undo, so the assertions further down see the state they expect. That
  -- a non-author can also undo their own edit is the point.
  execute format($$update projects set work_status = 'idea', archived_at = null where id = %L$$, pid);
  delete from project_venues where venue_name = 'Added by a non-author';
  perform ok((select work_status from projects where id = pid) = 'idea'
               and (select archived_at from projects where id = pid) is null,
             'a non-author can revert what they changed');
end $t$;

-- Privilege escalation attempts. Tomi is signed in and is a plain member.
do $t$ begin
  perform denied(
    $$update people set permission_level = 'admin' where email = 'tokafor@umc.edu'$$,
    'a member cannot promote themselves to admin');
  perform ok((select permission_level from people where email = 'tokafor@umc.edu') = 'member',
             'the blocked promotion did not take effect');

  perform denied(
    $$update people set display_name = 'Renamed' where email = 'rleblanc@umc.edu'$$,
    'a member cannot edit another person''s roster entry');
  perform ok((select display_name from people where email = 'rleblanc@umc.edu') = 'Rae LeBlanc',
             'the blocked rename did not take effect');

  -- Roster facts are an admin's to set, even on your own row. Each of
  -- these is a self-edit, which people_update_self otherwise permits.
  perform denied(
    $$update people set staff_position = 'attending' where email = 'tokafor@umc.edu'$$,
    'a member cannot change their own staff position');
  perform ok((select staff_position from people where email = 'tokafor@umc.edu') = 'resident',
             'the blocked position change did not take effect');

  perform denied(
    $$update people set employment_end_date = current_date - 1 where email = 'tokafor@umc.edu'$$,
    'a member cannot set their own employment end date');
  perform ok((select employment_end_date from people where email = 'tokafor@umc.edu') is null,
             'the blocked end date did not take effect');

  perform denied(
    $$update people set email = 'someone.else@umc.edu' where email = 'tokafor@umc.edu'$$,
    'a member cannot change the address their sign-in matches on');
  perform ok((select count(*) from people where email = 'tokafor@umc.edu') = 1,
             'the blocked email change did not take effect');

  -- A member may still correct their own display name.
  update people set display_name = 'Tomi Albrecht' where email = 'tokafor@umc.edu';
  perform ok((select display_name from people where email = 'tokafor@umc.edu') = 'Tomi Albrecht',
             'a member can still rename themselves');
  update people set display_name = 'Tomi Okafor' where email = 'tokafor@umc.edu';

  perform ok((select count(*) from audit_log) = 0,
             'a member reads zero audit rows');
end $t$;

-- The email domain gate. Equality on the domain part, not a LIKE, so a
-- configured domain containing _ or % cannot silently widen the allowlist
-- and a second @ cannot smuggle a foreign domain past a trailing match.
do $t$ begin
  perform ok(is_allowed_email('someone@umc.edu'),
             'a UMMC address is allowed');
  perform ok(not is_allowed_email('someone@gmail.com'),
             'an outside address is refused');
  perform ok(not is_allowed_email('someone@evil.com@umc.edu'),
             'a second @ cannot smuggle a foreign domain past the gate');
  perform ok(not is_allowed_email('someone@sub.umc.edu'),
             'a subdomain is not the allowed domain');
  perform ok(not is_allowed_email('someone@umcXedu'),
             'the dot in the domain is a literal, not a wildcard');
  perform ok(not is_allowed_email(''), 'an empty address is refused');
  perform ok(not is_allowed_email(null), 'a null address is refused');
end $t$;

-- Inline "add new person" from the author picker is allowed, but the new
-- person is always a plain member regardless of what the client sends.
insert into people (display_name, staff_position, permission_level)
  values ('Sam Whitfield', 'medical_student', 'admin');
do $t$ begin
  perform ok((select permission_level from people where display_name = 'Sam Whitfield') = 'member',
             'inline-added people are forced to member, not admin');
end $t$;

-- --- Rae edits her own project ----------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $t$
declare pid uuid; tomi uuid;
begin
  select id into pid from projects where title = 'Disseminated gonococcal rash';
  select id into tomi from people where email = 'tokafor@umc.edu';

  update projects set work_status = 'rough_draft' where id = pid;
  perform ok((select work_status from projects where id = pid) = 'rough_draft',
             'an author can advance their own project');

  -- statuses move backwards; transitions are never enforced
  update projects set work_status = 'planning' where id = pid;
  perform ok((select work_status from projects where id = pid) = 'planning',
             'work status can move backwards');

  insert into project_authors (project_id, person_id) values (pid, tomi);
  perform ok((select count(*) from project_authors where project_id = pid) = 2,
             'an author can add a co-author');

  -- two live venues at once, at different stages
  insert into project_venues (project_id, venue_type, venue_name, submission_status)
    values (pid, 'poster', 'Mississippi Dermatology Society Annual', 'accepted'),
           (pid, 'journal', 'JAAD Case Reports', 'in_review');
  perform ok((select count(*) from project_venues where project_id = pid) = 2,
             'a project can hold two venues at different stages at once');

  -- A free-text description of "other" must not survive a change of kind,
  -- or the row quietly starts lying about what it is.
  perform denied(
    format($$insert into project_venues (project_id, venue_type, venue_name, other_venue_description)
             values (%L, 'poster', 'Somewhere', 'Grand rounds elsewhere')$$, pid),
    'other_venue_description is rejected unless the kind is Other');

  insert into project_venues (project_id, venue_type, venue_name, other_venue_description)
    values (pid, 'other', 'Regional teaching day', 'Grand rounds at another institution');
  perform ok((select other_venue_description from project_venues
               where venue_name = 'Regional teaching day')
             = 'Grand rounds at another institution',
             'other_venue_description is accepted when the kind is Other');
  delete from project_venues where venue_name = 'Regional teaching day';
end $t$;

-- Swapping the only author inside one transaction. The min-one rule is a
-- DEFERRED constraint precisely so this works: the project is briefly
-- authorless mid-transaction and nobody should have to add-then-remove.
do $t$
declare pid uuid; rae uuid; tomi uuid;
begin
  select id into rae  from people where email = 'rleblanc@umc.edu';
  select id into tomi from people where email = 'tokafor@umc.edu';
  insert into projects (title, project_type, created_by)
    values ('Author swap', 'review', rae) returning id into pid;
  insert into project_authors (project_id, person_id) values (pid, rae);

  delete from project_authors where project_id = pid;          -- now zero
  insert into project_authors (project_id, person_id) values (pid, tomi);
  set constraints all immediate;                                -- force the check

  perform ok((select person_id from project_authors where project_id = pid) = tomi,
             'the sole author can be swapped inside one transaction');
end $t$;

-- Tomi, now a co-author, can edit
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $t$
declare pid uuid;
begin
  select id into pid from projects where title = 'Disseminated gonococcal rash';
  update projects set notes = 'Added the immunofluorescence images.' where id = pid;
  perform ok((select notes from projects where id = pid) is not null,
             'a newly added co-author can now edit');
end $t$;

-- --- Admin powers ------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $t$
declare pid uuid;
begin
  select id into pid from projects where title = 'Bullous pemphigoid after gliptin exposure';

  update projects set work_status = 'on_hold' where id = pid;
  perform ok((select work_status from projects where id = pid) = 'on_hold',
             'an admin can edit a project they do not own');

  update projects set archived_at = now() where id = pid;
  perform ok((select archived_at from projects where id = pid) is not null,
             'an admin can archive any project');

  perform ok((select count(*) from audit_log) > 0,
             'an admin can read the audit log');

  perform ok(exists (select 1 from audit_log
                     where audited_table = 'projects'
                       and changed_fields ? 'work_status'),
             'the audit log records who changed a status');

  perform ok(not exists (select 1 from audit_log where changed_fields ? 'search_vector'),
             'the audit log ignores internal columns');
end $t$;

-- The audit log is append-only even for admins.
do $t$ begin
  perform denied($$delete from audit_log$$,
                 'even an admin cannot delete audit rows', 'permission');
  perform denied($$update audit_log set operation = 'x'$$,
                 'even an admin cannot rewrite audit rows', 'permission');
end $t$;

-- Admins can retune the status vocabulary without a migration (§6).
insert into work_statuses (code, label, sort_order)
  values ('awaiting_attending', 'Awaiting attending review', 55);
do $t$ begin
  perform ok((select count(*) from work_statuses) = 10,
             'an admin can add a work status without a code change');
end $t$;

-- Deactivating a graduate preserves historical attribution.
update people set employment_end_date = current_date - 1 where email = 'rleblanc@umc.edu';
do $t$ begin
  perform ok(exists (select 1 from project_authors po
                     join people pe on pe.id = po.person_id
                     where pe.email = 'rleblanc@umc.edu'),
             'a deactivated graduate stays attached to their projects');
  perform denied(
    $$delete from people where email = 'rleblanc@umc.edu'$$,
    'a person attached to a project cannot be hard-deleted', 'violates foreign key');
end $t$;

-- Reporting views
do $t$
declare r record;
begin
  select * into r from project_export where title = 'Disseminated gonococcal rash';
  perform ok(r.authors like '%Rae LeBlanc%' and r.authors like '%Tomi Okafor%',
             'the export view lists all authors in one cell');
  perform ok(r.venue_count = 2 and r.venues like '%JAAD Case Reports%',
             'the export view collapses venues for a spreadsheet cell');
  perform ok(r.case_number is not null and r.description is null,
             'type-specific columns populate only for the matching type');
  perform ok(r.academic_year_label like '20%-20%',
             'academic year renders as a span');

  perform ok((select count(*) from venue_export) = 2,
             'the venue export emits one row per venue');
  perform ok((select count(*) from acgme_scholarly_activity) >= 2,
             'the ACGME view reports resident activity');
end $t$;

-- --- Anonymous access ---------------------------------------------------
reset role;
set role anon;
do $t$ begin
  perform denied($$select id from projects$$,
                 'anonymous visitors can read nothing', 'permission');
  perform denied($$insert into projects (title, project_type, academic_year)
                   values ('junk', 'review', 2026)$$,
                 'there are no anonymous writes', 'permission');
end $t$;

reset role;
select 'ALL TESTS PASSED' as result;
