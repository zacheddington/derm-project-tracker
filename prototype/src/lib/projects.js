/* ---------------------------------------------------------------------
   Project list behaviour: filtering, sorting, pagination, age labels and
   validation. Pure functions, no React, no clock of their own.
   --------------------------------------------------------------------- */

import { WORK_STATUSES, TYPES, label, nextCaseId, academicYearOf, collator } from "./domain.js";

const DAY = 864e5;
export const PAGE_SIZE = 20;

/* ------------------------------- dates --------------------------------- */

/* Typing a date.

   The native <input type="date"> walks you through three separate
   segments and fights anyone who types straight through. These back a
   plain text box that accepts digits and puts the slashes in itself, so
   MM/DD/YYYY can be typed without stopping.

   The stored value stays ISO yyyy-mm-dd — that is what Postgres wants and
   what sorts correctly. Only the display is American. */

/* A date that could plausibly be meant.

   Not a validity check — 01/01/1200 is a real date — but a sanity one.
   Nobody entering a due date or an employment end date means the
   thirteenth century, and a mistyped year is far likelier than a genuine
   one outside this window. The floor matches `year_seen`'s 1990 so the
   two do not disagree about what counts as absurd. */
export const DATE_MIN_YEAR = 1990;
export const dateMaxYear = (now = Date.now()) => new Date(now).getFullYear() + 10;

function dateOutOfRange(iso, now = Date.now()) {
  if (!iso) return false;
  const year = Number(String(iso).slice(0, 4));
  if (!Number.isFinite(year)) return true;
  return year < DATE_MIN_YEAR || year > dateMaxYear(now);
}

/* Blank or complete — never half.

   `displayDateToIso` returns "" for anything partial, which is right for
   storage and wrong as the last word: "08/04" would silently save as no
   date at all, and the person who typed it would never find out. This
   says whether what is in the box is a state worth saving from. */
export function dateEntryState(text, now = Date.now()) {
  const digits = String(text ?? "").replace(/\D/g, "");
  if (digits.length === 0) return { empty: true, complete: true, problem: null };

  if (digits.length < 8) {
    return { empty: false, complete: false, problem: "incomplete" };
  }
  const iso = displayDateToIso(text);
  if (!iso) return { empty: false, complete: false, problem: "impossible" };
  if (dateOutOfRange(iso, now)) {
    return { empty: false, complete: false, problem: "out-of-range" };
  }
  return { empty: false, complete: true, problem: null, iso };
}

export function describeDateProblem(problem, label, now = Date.now()) {
  switch (problem) {
    case "incomplete":
      return `${label} is only partly filled in. Enter the whole date, or clear it.`;
    case "impossible":
      return `${label} is not a real date.`;
    case "out-of-range":
      return `${label} must be between ${DATE_MIN_YEAR} and ${dateMaxYear(now)}.`;
    default:
      return null;
  }
}

export function maskDateInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/* "" for anything not yet a complete, real date. Half-typed input is not
   an error — it is someone mid-keystroke — so it stores nothing rather
   than something wrong. */
export function displayDateToIso(display) {
  const digits = String(display ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const mm = digits.slice(0, 2), dd = digits.slice(2, 4), yyyy = digits.slice(4);
  const month = Number(mm), day = Number(dd), year = Number(yyyy);
  // Only impossibility is judged here. Whether a real date is a plausible
  // one is a separate question, and dateEntryState owns it — otherwise
  // 08/04/1776 reports as "not a real date", which is untrue and unhelpful.
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return "";
  // Round-trip through Date to reject 02/31 and friends.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return "";
  return `${yyyy}-${mm}-${dd}`;
}

export function isoToDisplayDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/* Dates are shown, never parsed back. ISO in, readable out; the day is
   what anyone means by "when was this submitted". */
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* --------------------------------- age --------------------------------- */

export const ageInDays = (project, now = Date.now()) =>
  Math.floor((now - new Date(project.updated_at).getTime()) / DAY);

export function stalenessLabel(project, now = Date.now()) {
  const d = ageInDays(project, now);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 60) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  const years = Math.floor(d / 365);
  return years === 1 ? "over a year ago" : `over ${years} years ago`;
}

/* ------------------------------ filtering ------------------------------ */

/* Three states, not two.

   A two-way toggle can show active OR archived and never both, so
   "everything this person has ever done" was unaskable — which is exactly
   what you want when you click a name in the roster. The cycle is
   active → archived → both, starting where the day-to-day view starts. */
export const ARCHIVED_VIEWS = [
  { code: "active", label: "Active" },
  { code: "archived", label: "Archived" },
  { code: "both", label: "Both" },
];

export function nextArchivedView(current) {
  const i = ARCHIVED_VIEWS.findIndex((v) => v.code === current);
  return ARCHIVED_VIEWS[(i + 1) % ARCHIVED_VIEWS.length].code;
}

export const EMPTY_FILTERS = {
  q: "",
  type: "all",
  status: "all",
  author: "all",
  year: "all",
  archived: "active",   // "active" | "archived" | "both"
};

/* Everything the search box looks at, for one project.

   Two rules, and they pull in opposite directions on purpose.

   Everything VISIBLE in the table is searchable, because otherwise typing
   a word you can see in front of you returns nothing: "research" has to
   match the Type column, an author's name has to match the Authors
   column, a venue has to match Venues.

   Everything HIDDEN but useful stays searchable too — purpose, notes,
   diagnosis. Those are where the substance of a project lives, and losing
   them would make the box worse at the one job it is best at. The cost is
   that a hit can land on a row without showing why; that is a fair trade
   for being able to find "the gliptin one" from memory. */
function searchableText(project, nameOf = (id) => id) {
  return [
    // Visible columns
    project.title,
    label(TYPES, project.project_type),
    label(WORK_STATUSES, project.work_status),
    ...project.authors.map(nameOf),
    ...project.venues.map((v) => v.venue_name),
    ...project.venues.map((v) => v.other_venue_description),
    // Not on the table, but worth finding by
    project.purpose,
    project.notes,
    project.details?.diagnosis,
    project.details?.case_number,
    project.details?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterProjects(projects, filters = {}, options = {}) {
  const { nameOf = (id) => id } = options;
  const f = { ...EMPTY_FILTERS, ...filters };
  const t = f.q.trim().toLowerCase();

  return projects.filter((p) => {
    if (f.archived === "active" && p.archived_at) return false;
    if (f.archived === "archived" && !p.archived_at) return false;
    if (f.type !== "all" && p.project_type !== f.type) return false;
    if (f.status !== "all" && p.work_status !== f.status) return false;
    if (f.author !== "all" && !p.authors.includes(f.author)) return false;
    if (f.year !== "all" && String(p.academic_year) !== String(f.year)) return false;
    if (t && !searchableText(p, nameOf).includes(t)) return false;
    return true;
  });
}

/* ------------------------------- sorting ------------------------------- */

/* Which way a column sorts on its FIRST click.

   Ascending is right for names and categories: A before B is what anyone
   expects from a first click. Dates are the exception — nobody opens a
   project list wanting the oldest thing first, so Updated leads with the
   most recent. */
const FIRST_SORT_DIRECTION = { updated: "desc" };
const firstDirection = (column) => FIRST_SORT_DIRECTION[column] ?? "asc";

/* Tri-state: first click sorts, second reverses, third returns to the
   default order. Moving to a different column always starts that column
   at ITS OWN first direction rather than inheriting the previous one. */
export function nextSort(current, column) {
  const first = firstDirection(column);
  if (!current || current.column !== column) return { column, dir: first };
  if (current.dir === first) return { column, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

const cmpString = (a, b) => collator.compare(a, b);

function sortValue(project, column, nameOf) {
  switch (column) {
    case "title":
      return project.title ?? "";
    case "type":
      return label(TYPES, project.project_type);
    // Work status sorts by its position in the vocabulary, not
    // alphabetically: "Idea → Complete" is the order people think in, and
    // "Abandoned, Analyzing, Collecting…" is meaningless.
    case "status":
      return WORK_STATUSES.findIndex((s) => s.code === project.work_status);
    case "authors":
      return project.authors.map(nameOf).sort(cmpString)[0] ?? "";
    case "venues":
      return project.venues.length;
    case "updated":
      return new Date(project.updated_at).getTime();
    default:
      return 0;
  }
}

/* Default order when no column is selected: most recently touched first.
   That is the answer to "what was I doing?", which is the question the
   list exists to answer. */
/* Decorate, sort, undecorate.

   A comparator runs O(n log n) times, so anything computed inside one is
   computed roughly 10n times at a thousand rows. The authors key maps the
   owner ids to names and sorts them; doing that per comparison instead of
   per row measured 51ms at 1,000 rows and 584ms at 10,000 — visibly
   janky while typing. Computing each key once brings it to about 1ms and
   14ms respectively. Keep the key computation out of the comparator. */
export function sortProjects(projects, sort, nameOf = (id) => id) {
  const column = sort ? sort.column : "updated";
  const sign = sort && sort.dir === "desc" ? -1 : 1;
  // No explicit sort means most recently touched first, which is
  // descending on the same key the "updated" column uses.
  const defaultSign = sort ? sign : -1;

  const decorated = projects.map((p) => ({
    p,
    k: sortValue(p, column, nameOf),
    t: p.title ?? "",
  }));

  decorated.sort((a, b) => {
    let c;
    if (typeof a.k === "string" && typeof b.k === "string") c = collator.compare(a.k, b.k);
    else c = a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
    if (c !== 0) return c * defaultSign;
    // Tiebreak stays ascending regardless of direction, so equal values
    // hold the same relative order in both directions instead of the
    // whole block flipping when you reverse the sort.
    return collator.compare(a.t, b.t);
  });

  return decorated.map((d) => d.p);
}

/* ----------------------------- pagination ------------------------------ */

export function pageCount(total, pageSize = PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/* Clamps rather than trusting the caller: deleting the only row on the
   last page must not leave you staring at an empty table. */
export function paginate(rows, page = 1, pageSize = PAGE_SIZE) {
  const pages = pageCount(rows.length, pageSize);
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: current,
    pages,
    total: rows.length,
    from: rows.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, rows.length),
  };
}

/* ------------------------------ dirtiness ------------------------------ */

/* Has anything actually changed?

   Tracking edits with a boolean flag says "dirty" the moment a key is
   pressed and never takes it back, so typing a character and deleting it
   leaves the form claiming unsaved work and putting a dialog in the way
   of leaving. Comparing values answers the question that was actually
   asked: is this different from what we started with?

   Deep by necessity — a project carries nested details and an array of
   venues, and a shallow compare would miss every edit inside them. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  // Treat a missing key and an explicitly empty one as the same thing:
  // a form that writes `notes: ""` where the record had no notes has not
  // changed anything a person would recognise as a change.
  const blank = (v) => v === undefined || v === null || v === "";
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (blank(a[k]) && blank(b[k])) continue;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export const hasChanges = (draft, original) => !deepEqual(draft, original);

/* ------------------------------ validation ----------------------------- */

/* A project may be edited down to zero authors — you have to be able to
   take the wrong name off before putting the right one on. It just
   cannot be SAVED that way. */
export function validateProject(draft, now = Date.now()) {
  const errors = [];
  if (!draft.title || !draft.title.trim()) {
    errors.push({ field: "title", message: "A project needs a title." });
  }
  if (!draft.authors || draft.authors.length === 0) {
    errors.push({
      field: "authors",
      message: "A project needs at least one author. Add someone before saving.",
    });
  }
  /* A venue with no name is a row the schema refuses:
     `venue_name text not null check (length(btrim(venue_name)) > 0)`.
     Letting it save here means the prototype accepts what the database
     will reject, and the person who typed it finds out from an error in
     production rather than from the form in front of them. An unnamed
     venue is also unreadable on the table — a bare status badge attached
     to nothing. */
  const unnamedVenues = (draft.venues ?? []).filter((v) => !v.venue_name || !v.venue_name.trim());
  if (unnamedVenues.length > 0) {
    errors.push({
      field: "venue_name",
      message: unnamedVenues.length === 1
        ? "A venue needs a name. Name it, or remove it."
        : `${unnamedVenues.length} venues have no name. Name them, or remove them.`,
    });
  }
  if (draft.project_type === "case_report") {
    const y = draft.details?.year_seen;
    if (y !== "" && y != null) {
      const year = Number(y);
      const thisYear = new Date(now).getFullYear();
      if (!Number.isInteger(year) || year < 1990 || year > thisYear) {
        errors.push({
          field: "year_seen",
          message: `Year seen must be between 1990 and ${thisYear}. It cannot be in the future.`,
        });
      }
    }
  }
  return errors;
}

export const maxYearSeen = (now = Date.now()) => new Date(now).getFullYear();

/* --------------------------- changing the type -------------------------- */

/* Someone picks the wrong type on capture; that must be fixable without
   recreating the project and losing its history.

   Detail fields are kept in one bag and rendered by type, so switching
   away and back does not discard what was typed. A case ID, once issued,
   is never reissued or renumbered — the sequence is a count of case
   reports opened that year, and burning a number would make it lie. */
export function changeProjectType(project, nextType, allProjects, now = Date.now()) {
  if (project.project_type === nextType) return project;
  const details = { ...project.details };
  if (nextType === "case_report" && !details.case_number) {
    const ay = project.academic_year ?? academicYearOf(new Date(now));
    details.case_number = nextCaseId(allProjects, ay);
    details.patient_consent_obtained = details.patient_consent_obtained ?? "not_yet";
  }
  return { ...project, project_type: nextType, details, updated_at: new Date(now).toISOString() };
}
