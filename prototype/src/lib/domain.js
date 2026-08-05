/* ---------------------------------------------------------------------
   Vocabularies and pure domain helpers.

   Everything here is free of React so it can be tested directly. The
   component imports from this module rather than defining its own copy;
   a vocabulary that exists in two places drifts.

   Anything that depends on the current time takes `now` as an argument.
   Tests pin it; the UI passes the real clock.
   --------------------------------------------------------------------- */

export const brand = {
  navy: "#0B2545",
  navyHover: "#06182F",
  slate: "#55606E",
  border: "#DDE2E9",
  bg: "#F6F7F9",
  surface: "#FFFFFF",
  accent: "#16624A",
  accentBg: "#E7F2ED",
  accentText: "#0E4A37",
  neutralBg: "#EEF1F5",
  // Amber: the prototype banner and the identifier tripwire — a caution,
  // never a refusal.
  warnBg: "#FDF6E3",
  warnBorder: "#E8D9A8",
  warnText: "#6B5300",
  // Red: destructive buttons, the danger modals, and an invalid date box.
  alertText: "#8A2B2B",
};

export const WORK_STATUSES = [
  { code: "idea", label: "Idea", tone: "neutral" },
  { code: "planning", label: "Planning", tone: "neutral" },
  { code: "collecting_data", label: "Collecting data", tone: "active" },
  { code: "analyzing", label: "Researching/analyzing", tone: "active" },
  { code: "rough_draft", label: "Rough draft", tone: "active" },
  { code: "in_edit", label: "In edit", tone: "active" },
  { code: "complete", label: "Complete", tone: "done" },
  { code: "on_hold", label: "On hold", tone: "muted" },
  { code: "abandoned", label: "Abandoned", tone: "muted" },
];

export const SUBMISSION_STATUSES = [
  { code: "not_yet_submitted", label: "Not yet submitted", tone: "neutral" },
  { code: "submitted", label: "Submitted", tone: "active" },
  { code: "awaiting_review", label: "Awaiting review", tone: "active" },
  { code: "in_review", label: "In review", tone: "active" },
  { code: "revisions_requested", label: "Revisions requested", tone: "active" },
  { code: "accepted", label: "Accepted", tone: "done" },
  { code: "presented_published", label: "Presented/Published", tone: "done" },
  { code: "declined", label: "Declined", tone: "muted" },
  { code: "withdrawn", label: "Withdrawn", tone: "muted" },
];

export const TYPES = [
  { code: "case_report", label: "Case report" },
  { code: "qa_qi", label: "QA/QI" },
  { code: "research", label: "Research" },
  { code: "review", label: "Review" },
];

export const VENUE_TYPES = [
  { code: "conference_presentation", label: "Conference presentation" },
  { code: "poster", label: "Poster" },
  { code: "journal", label: "Journal" },
  { code: "internal_presentation", label: "Internal presentation" },
  { code: "other", label: "Other" },
];

export const IRB_STATUSES = [
  { code: "not_applicable", label: "Not applicable" },
  { code: "not_yet_submitted", label: "Not yet submitted" },
  { code: "submitted", label: "Submitted" },
  { code: "approved", label: "Approved" },
  { code: "exempt_determination", label: "Exempt determination" },
];

export const CONSENT = [
  { code: "yes", label: "Yes" },
  { code: "no", label: "No" },
  { code: "not_yet", label: "Not yet" },
  { code: "not_applicable", label: "Not applicable" },
];

/* These codes are the values of the Postgres `staff_position` enum, and
   `schema-parity.test.js` fails if the two lists drift. Labels are free
   to differ from codes — "Research fellow" for `research_fellow` — but a
   code is the database's word and changing one is a schema edit. */
export const STAFF_POSITIONS = [
  { code: "resident", label: "Resident" },
  { code: "fellow", label: "Fellow" },
  { code: "attending", label: "Attending" },
  { code: "medical_student", label: "Medical student" },
  { code: "research_fellow", label: "Research fellow" },
  { code: "external_collaborator", label: "External collaborator" },
];

/* Roles that need a free-text position, because the vocabulary cannot
   usefully enumerate what an outside collaborator does. */
const POSITIONS_NEEDING_DESCRIPTION = ["external_collaborator"];

export const needsExternalPosition = (role) => POSITIONS_NEEDING_DESCRIPTION.includes(role);

export const label = (list, code) => list.find((x) => x.code === code)?.label ?? code;
export const toneOf = (list, code) => list.find((x) => x.code === code)?.tone ?? "neutral";

/* July 1 – June 30. 2026 means AY 2026–2027. */
export const academicYearOf = (d) =>
  d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;

export const ayLabel = (y) => `${y}–${y + 1}`;

/* ------------------------------- people -------------------------------- */

/* Employment is a date range, not a flag. Someone who leaves keeps their
   history — every project they authored still resolves their name — but
   they stop appearing in pickers. An end date in the future is someone
   who has given notice and is still here. */
export function isPersonActive(person, now = Date.now()) {
  if (!person) return false;
  if (!person.employment_end_date) return true;
  const end = Date.parse(`${person.employment_end_date}T23:59:59`);
  if (Number.isNaN(end)) return true;
  return end >= now;
}

export function activePeople(people, now = Date.now()) {
  return people.filter((p) => isPersonActive(p, now));
}

/* One collator for every string comparison in the app, exported so that
   projects.js sorts titles and author names by the same rules the roster
   sorts by. `String.prototype.localeCompare` builds a fresh collator on
   every call, which dominates the profile once a list is large. */
export const collator = new Intl.Collator(undefined, { sensitivity: "base" });

/* Alphabetical by the name as displayed.

   Sorting a visible list of "Mark Albrecht" by surname puts it in an
   order nobody reading it can see, so the sort key is the string on
   screen. If the department would rather have surname order, the fix is
   to store given and family names separately and display them that way —
   not to sort by something invisible. */
const byDisplayName = (a, b) => collator.compare(a.display_name, b.display_name);

export const sortedByName = (people) => [...people].sort(byDisplayName);

/* The roster list.

   `showFormer` is EXCLUSIVE: it shows former staff INSTEAD OF current
   staff, not in addition to them. Mixing the two and greying the leavers
   out reads as a rendering quirk rather than as a meaningful distinction,
   and there is no way to answer "who has left?" by scanning it.

   The search covers the external position too, so "pathology" finds the
   outside collaborator whose name you cannot remember. */
export function filterRoster(
  people,
  { showFormer = false, query = "", position = "all" } = {},
  now = Date.now()
) {
  const q = query.trim().toLowerCase();
  return people
    .filter((p) => (showFormer ? !isPersonActive(p, now) : isPersonActive(p, now)))
    .filter((p) => position === "all" || p.staff_position === position)
    .filter((p) =>
      !q ||
      p.display_name.toLowerCase().includes(q) ||
      (p.external_position ?? "").toLowerCase().includes(q));
}

/* How the roster is ordered.

   "Least work first" is the whole reason this control exists. "Which
   residents have nothing on?" is the question the roster is opened to
   answer, and answering it by scanning twenty-three rows for a zero is
   the sort of thing people simply stop doing. */
export const ROSTER_SORTS = [
  { code: "name", label: "Name" },
  { code: "load", label: "Least work first" },
];

/* Decorate, sort, undecorate — the same rule as sortProjects.

   `projectLoad` walks the whole project list, and a comparator runs
   O(n log n) times, so calling it inside one scanned every project twice
   per comparison: roughly 2·m·n·log n. Computing each person's load once
   makes it m·n, and the sort then compares two integers. At the
   department's size either is instant; at a few hundred people and a few
   thousand projects the difference is a visibly janky panel. */
export function sortRoster(people, mode = "name", projects = []) {
  if (mode !== "load") return sortedByName(people);

  const decorated = people.map((p) => ({ p, load: projectLoad(p.id, projects) }));

  decorated.sort((a, b) => {
    // Active work first, because that is what "busy" means today.
    if (a.load.active !== b.load.active) return a.load.active - b.load.active;
    // Then archived, so somebody who has finished things ranks above
    // somebody who has never had any.
    if (a.load.archived !== b.load.archived) return a.load.archived - b.load.archived;
    return byDisplayName(a.p, b.p);
  });

  return decorated.map((d) => d.p);
}

/* Every edit to a person, including a rename.

   Names change. The link is the id, never the name, so a rename is just
   an edit to one row and every association survives it — which is why
   there is no separate rename function: it was a second way to do this
   one's job, and the app only ever called this one. Refusing a blank name
   belongs to the form that collects it, not here. */
export function updatePerson(people, id, patch) {
  return people.map((p) => {
    if (p.id !== id) return p;
    const next = { ...p, ...patch };
    if (typeof next.display_name === "string") next.display_name = next.display_name.trim();
    // Dropping out of a role that needs a position drops the position too,
    // so a stale "Pharmacist" does not survive a change to Attending.
    if (!needsExternalPosition(next.staff_position)) delete next.external_position;
    return next;
  });
}

/* How much a person is carrying, split the way the department reads it.

   Always returns numbers, including zeros. "Rae LeBlanc — Resident" tells
   you nothing about whether she needs a project; "Resident · 0 active
   projects" tells you immediately, and finding the people with nothing on
   is most of what the roster is for. */
export function projectLoad(personId, projects = []) {
  const mine = projects.filter((p) => p.authors?.includes(personId));
  return {
    active: mine.filter((p) => !p.archived_at).length,
    archived: mine.filter((p) => p.archived_at).length,
  };
}

export const pluralProjects = (n) => `${n} project${n === 1 ? "" : "s"}`;

export function personSubtitle(person) {
  if (!person) return "";
  const role = label(STAFF_POSITIONS, person.staff_position);
  if (needsExternalPosition(person.staff_position) && person.external_position) return `${role} · ${person.external_position}`;
  if (person.pgy_level) return `${role} · PGY-${person.pgy_level}`;
  return role;
}

/* ------------------------------ case IDs ------------------------------- */

/* CR-<academic year>-<sequence>, sequence restarting each academic year,
   which is what makes "how many case reports this year" readable at a
   glance.

   Derived from the highest sequence already issued, NOT from the count.
   Counting breaks the moment a case report is archived or retyped: two
   live case reports plus one archived would reissue 003. */
export function nextCaseId(projects, ay) {
  const prefix = `CR-${ay}-`;
  const highest = projects.reduce((max, p) => {
    const id = p?.details?.case_number;
    if (typeof id !== "string" || !id.startsWith(prefix)) return max;
    const n = parseInt(id.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

/* ------------------------- identifier tripwire ------------------------- */
/* Client-side only, advisory only. Never blocks a save — it just asks. */

const IDENTIFIER_PATTERNS = [
  { re: /\b\d{6,12}\b/, note: "a long number that could be an MRN" },
  { re: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, note: "a full date, which may be a date of service" },
  { re: /\bMRN\b/i, note: "the letters MRN" },
  { re: /\b\d{3}-\d{2}-\d{4}\b/, note: "a social security number pattern" },
];

export function scanForIdentifiers(text) {
  if (!text) return null;
  for (const p of IDENTIFIER_PATTERNS) if (p.re.test(text)) return p.note;
  return null;
}
