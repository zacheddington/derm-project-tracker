/* ---------------------------------------------------------------------
   Project list behaviour: filtering, sorting, pagination, staleness and
   validation. Pure functions, no React, no clock of their own.
   --------------------------------------------------------------------- */

import { WORK_STATUSES, TYPES, label, nextCaseId, academicYearOf } from "./domain.js";

export const DAY = 864e5;
export const STALE_DAYS = 90;
export const ANCIENT_DAYS = 365;
export const PAGE_SIZE = 20;

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

/* The two banner counts.

   These deliberately OVERLAP: a project untouched for two years is also a
   project untouched for over three months, and the amber banner says
   "over three months", so it must include it. The red banner is a subset
   the amber one is telling the truth about. Clicking either applies the
   filter that matches its own wording exactly, so the number on the
   banner always equals the number of rows you land on. */
export function stalenessCounts(projects, now = Date.now()) {
  const live = projects.filter((p) => !p.archived_at);
  return {
    stale: live.filter((p) => ageInDays(p, now) > STALE_DAYS).length,
    ancient: live.filter((p) => ageInDays(p, now) > ANCIENT_DAYS).length,
  };
}

/* ------------------------------ filtering ------------------------------ */

export const EMPTY_FILTERS = {
  q: "",
  type: "all",
  status: "all",
  author: "all",
  year: "all",
  stale: "all", // "all" | "stale" | "ancient"
  archived: false,
};

export function filterProjects(projects, filters = {}, now = Date.now()) {
  const f = { ...EMPTY_FILTERS, ...filters };
  const t = f.q.trim().toLowerCase();

  return projects.filter((p) => {
    if (f.archived !== Boolean(p.archived_at)) return false;
    if (f.type !== "all" && p.project_type !== f.type) return false;
    if (f.status !== "all" && p.work_status !== f.status) return false;
    if (f.author !== "all" && !p.authors.includes(f.author)) return false;
    if (f.year !== "all" && String(p.academic_year) !== String(f.year)) return false;
    if (f.stale === "stale" && ageInDays(p, now) <= STALE_DAYS) return false;
    if (f.stale === "ancient" && ageInDays(p, now) <= ANCIENT_DAYS) return false;
    if (t) {
      const hay = [p.title, p.purpose, p.notes, p.details?.diagnosis, p.details?.case_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  });
}

/* ------------------------------- sorting ------------------------------- */

/* Column identifiers double as table header keys. */
export const SORT_COLUMNS = ["title", "type", "status", "authors", "venues", "updated"];

/* Which way a column sorts on its FIRST click.

   Ascending is right for names and categories: A before B is what anyone
   expects from a first click. Dates are the exception — nobody opens a
   project list wanting the oldest thing first, so Updated leads with the
   most recent. */
export const FIRST_SORT_DIRECTION = { updated: "desc" };
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

/* Clicking the banner that is already applied takes the filter off again.

   Without this the only way back is to hunt for the age dropdown, which
   is a strange thing to have to do when the control that got you here is
   still on screen. Clicking the OTHER banner switches to that one rather
   than clearing. */
export function nextStaleFilter(current, kind) {
  return current === kind ? "all" : kind;
}

/* One shared collator. `String.prototype.localeCompare` builds a fresh
   one on every call, which dominates the profile once the list is large. */
const collator = new Intl.Collator(undefined, { sensitivity: "base" });
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
