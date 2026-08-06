-- =====================================================================
-- Migration 0003 — reporting views
--
-- CSV export is the escape hatch and the handoff mechanism (§7), and the
-- ACGME view is what converts this from a personal tool into something
-- the program depends on (§8).
--
-- ⚠️ The ACGME column list below is a best guess. Confirm it against the
-- report the program coordinator currently assembles by hand BEFORE
-- treating this view as final. It is deliberately a view, not app code,
-- so that reshaping it is a one-file change.
-- =====================================================================

-- security_invoker: views run under the caller's permissions, so RLS on
-- the underlying tables still applies. Without this, a view would be a
-- hole straight through the policies in 0002.

-- ---------------------------------------------------------------------
-- 1. Flattened project export — one row per project
-- ---------------------------------------------------------------------

create view project_export
with (security_invoker = true) as
select
  p.id,
  p.title,
  p.project_type,
  ws.label                                    as work_status,
  p.academic_year,
  p.academic_year || '-' || (p.academic_year + 1) as academic_year_label,
  (select string_agg(pe.display_name, '; ' order by pe.display_name)
     from project_authors pa
     join people pe on pe.id = pa.person_id
    where pa.project_id = p.id)               as authors,
  (select string_agg(pe.display_name, '; ' order by pe.display_name)
     from project_authors pa
     join people pe on pe.id = pa.person_id
    where pa.project_id = p.id
      and pe.staff_position = 'resident')               as resident_authors,
  p.irb_status,
  p.next_action,
  p.next_action_due_date,

  -- venues, collapsed for a single spreadsheet cell
  (select string_agg(
            v.venue_name
              || case when v.other_venue_description is not null
                      then ' [' || v.other_venue_description || ']'
                      else '' end
              || ' (' || ss.label || ')',
            '; ' order by v.created_at)
     from project_venues v
     join submission_statuses ss on ss.code = v.submission_status
    where v.project_id = p.id)                as venues,
  (select count(*) from project_venues v where v.project_id = p.id) as venue_count,
  (select bool_or(v.submission_status = 'presented_published')
     from project_venues v where v.project_id = p.id)
                                              as any_presented_or_published,

  -- type-specific columns; null for the other three types
  cr.case_number,
  cr.diagnosis,
  cr.why_unique,
  cr.year_seen,
  cr.patient_consent_obtained,
  att.display_name                            as case_attending,
  coalesce(qa.description, rs.description, rv.description) as description,
  qa.aim_statement,
  qa.measure,
  rs.study_design,
  rs.data_source,
  rv.review_type,
  rv.research_question,

  p.notes,
  cb.display_name                             as created_by,
  p.created_at,
  p.updated_at,
  p.archived_at,
  (p.archived_at is not null)                 as is_archived
from projects p
join work_statuses ws              on ws.code = p.work_status
left join case_report_details cr   on cr.project_id = p.id
left join people att               on att.id = cr.attending_id
left join qa_qi_details qa         on qa.project_id = p.id
left join research_details rs      on rs.project_id = p.id
left join review_details rv        on rv.project_id = p.id
left join people cb                on cb.id = p.created_by;

comment on view project_export is
  'One row per project, everything flattened. Backs the CSV export and the monthly backup drop (§11). Contains no PHI.';

-- ---------------------------------------------------------------------
-- 2. Venue-level export — one row per project per venue
-- ---------------------------------------------------------------------
-- ACGME counts presentations and publications, not projects, so a
-- project with a poster and a journal submission is two lines.

create view venue_export
with (security_invoker = true) as
select
  v.id                                        as venue_id,
  p.id                                        as project_id,
  p.title,
  p.project_type,
  p.academic_year,
  p.academic_year || '-' || (p.academic_year + 1) as academic_year_label,
  (select string_agg(pe.display_name, '; ' order by pe.display_name)
     from project_authors pa
     join people pe on pe.id = pa.person_id
    where pa.project_id = p.id)               as authors,
  v.venue_type,
  v.other_venue_description,
  v.venue_name,
  ss.label                                    as submission_status,
  ss.is_terminal                              as status_is_final,
  v.target_date,
  v.notes                                     as venue_notes,
  p.archived_at is not null                   as is_archived
from project_venues v
join projects p             on p.id = v.project_id
join submission_statuses ss on ss.code = v.submission_status;

-- ---------------------------------------------------------------------
-- 3. ACGME scholarly activity — one row per resident per venue
-- ---------------------------------------------------------------------
-- ⚠️ Confirm shape with the program coordinator before relying on it.

create view acgme_scholarly_activity
with (security_invoker = true) as
select
  pe.display_name                             as resident,
  pe.pgy_level,
  p.academic_year || '-' || (p.academic_year + 1) as academic_year,
  p.project_type                                      as activity_type,
  p.title,
  v.venue_type,
  v.venue_name,
  ss.label                                    as status,
  v.target_date,
  p.irb_status
from projects p
join project_authors pa       on pa.project_id = p.id
join people pe               on pe.id = pa.person_id
left join project_venues v   on v.project_id = p.id
left join submission_statuses ss on ss.code = v.submission_status
where pe.staff_position in ('resident', 'fellow')
  and p.archived_at is null
order by pe.display_name, p.academic_year desc, p.title;

-- ---------------------------------------------------------------------
-- 4. Dashboard counts (§7, "should have")
-- ---------------------------------------------------------------------

create view dashboard_counts
with (security_invoker = true) as
select
  p.project_type,
  p.work_status,
  ws.label            as work_status_label,
  ws.sort_order,
  p.academic_year,
  count(*)            as project_count,
  count(*) filter (where p.updated_at < now() - interval '90 days') as stale_count
from projects p
join work_statuses ws on ws.code = p.work_status
where p.archived_at is null
group by p.project_type, p.work_status, ws.label, ws.sort_order, p.academic_year;

grant select on project_export, venue_export,
               acgme_scholarly_activity, dashboard_counts
  to authenticated;

-- 0002 revokes everything from `anon`, but that ran before these views
-- existed and a REVOKE does not apply to objects created later. Supabase
-- also configures default privileges that grant new objects to anon, so
-- without this the reporting views could be the one anonymous read in the
-- system. They are security_invoker, so RLS would still return no rows —
-- this is the second lock on the same door, not the only one.
revoke all on project_export, venue_export,
              acgme_scholarly_activity, dashboard_counts
  from anon;
