/* ---------------------------------------------------------------------
   CSV export.

   Spec §7 calls this the escape hatch and the handoff mechanism: whatever
   else happens to this application, the department's data has to be able
   to leave it in a form anyone can open. That makes it worth testing, so
   building the text is separated from downloading it.

   The column names match `project_export` in 0003_views.sql, so the
   browser export and a `select * from project_export` produce the same
   spreadsheet.
   --------------------------------------------------------------------- */

import {
  TYPES, WORK_STATUSES, SUBMISSION_STATUSES, IRB_STATUSES, CONSENT,
  label, ayLabel,
} from "./domain.js";

export const CSV_COLUMNS = [
  "title", "project_type", "work_status", "academic_year", "authors", "resident_authors",
  "case_number", "diagnosis", "why_unique", "year_seen", "consent", "attending",
  "description", "irb_status", "purpose", "venues", "next_action",
  "next_action_due_date", "updated_at", "archived",
];

/* RFC 4180: quote when the value contains a comma, a quote or a newline,
   and double any quote inside. A title with a comma in it is the single
   most common way a hand-rolled CSV writer corrupts a whole file. */
export function escapeCsv(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function venueLabel(venue) {
  return venue.venue_type === "other" && venue.other_venue_description
    ? `${venue.venue_name} [${venue.other_venue_description}]`
    : venue.venue_name;
}

export function projectsToCsv(projects, people) {
  const nameOf = (id) => people.find((p) => p.id === id)?.display_name ?? "—";
  const isResident = (id) => people.find((p) => p.id === id)?.staff_position === "resident";

  const rows = projects.map((p) => [
    p.title,
    label(TYPES, p.project_type),
    label(WORK_STATUSES, p.work_status),
    ayLabel(p.academic_year),
    p.authors.map(nameOf).join("; "),
    p.authors.filter(isResident).map(nameOf).join("; "),
    p.details?.case_number || "",
    p.details?.diagnosis || "",
    p.details?.why_unique || "",
    p.details?.year_seen || "",
    p.details?.patient_consent_obtained ? label(CONSENT, p.details.patient_consent_obtained) : "",
    p.details?.attending_id ? nameOf(p.details.attending_id) : "",
    p.details?.description || "",
    label(IRB_STATUSES, p.irb_status),
    p.purpose,
    p.venues.map((v) => `${venueLabel(v)} (${label(SUBMISSION_STATUSES, v.submission_status)})`).join("; "),
    p.next_action,
    p.next_action_due_date,
    p.updated_at.slice(0, 10),
    p.archived_at ? "yes" : "no",
  ]);

  return [CSV_COLUMNS.join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
}

/* Browser-only. Kept apart from projectsToCsv so the text can be tested
   without a DOM. */
export function downloadCsv(projects, people, now = Date.now()) {
  const csv = projectsToCsv(projects, people);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `derm-projects-${new Date(now).toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
