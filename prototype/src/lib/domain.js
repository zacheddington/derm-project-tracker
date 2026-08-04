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
  // Staleness banners. Amber is a nudge, red is a reproach.
  warnBg: "#FDF6E3",
  warnBorder: "#E8D9A8",
  warnText: "#6B5300",
  alertBg: "#FBEDED",
  alertBorder: "#EFC9C9",
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

/* The `research_fellow` CODE is the value in the Postgres
   `person_role` enum, so it stays. Only the label changed to "Research
   fellow" — renaming the enum value is a migration, and this is a UI
   wording change. See the note in README.md. */
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
export const POSITIONS_NEEDING_DESCRIPTION = ["external_collaborator"];

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

/* The roster list.

   `showFormer` is EXCLUSIVE: it shows former staff INSTEAD OF current
   staff, not in addition to them. Mixing the two and greying the leavers
   out reads as a rendering quirk rather than as a meaningful distinction,
   and there is no way to answer "who has left?" by scanning it.

   The search covers the external position too, so "pathology" finds the
   outside collaborator whose name you cannot remember. */
export function filterRoster(people, { showFormer = false, query = "" } = {}, now = Date.now()) {
  const q = query.trim().toLowerCase();
  return people
    .filter((p) => (showFormer ? !isPersonActive(p, now) : isPersonActive(p, now)))
    .filter((p) =>
      !q ||
      p.display_name.toLowerCase().includes(q) ||
      (p.external_position ?? "").toLowerCase().includes(q));
}

/* Names change. The link is the id, never the name, so a rename is just
   an edit to one row and every association survives it. */
export function renamePerson(people, id, nextName) {
  const name = (nextName ?? "").trim();
  if (!name) return people;
  return people.map((p) => (p.id === id ? { ...p, display_name: name } : p));
}

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

export const IDENTIFIER_PATTERNS = [
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
