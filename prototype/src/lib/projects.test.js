import { describe, it, expect } from "vitest";
import {
  ageInDays,
  stalenessLabel,
  filterProjects,
  nextSort,
  nextArchivedView,
  maskDateInput,
  displayDateToIso,
  isoToDisplayDate,
  dateEntryState,
  describeDateProblem,
  DATE_MIN_YEAR,
  dateMaxYear,
  deepEqual,
  hasChanges,
  sortProjects,
  paginate,
  pageCount,
  validateProject,
  maxYearSeen,
  changeProjectType,
  PAGE_SIZE,
} from "./projects.js";

const NOW = Date.parse("2026-08-03T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 864e5).toISOString();

const project = (over = {}) => ({
  id: "x1",
  title: "A project",
  project_type: "research",
  work_status: "idea",
  authors: ["p1"],
  notes: "",
  details: {},
  venues: [],
  academic_year: 2026,
  updated_at: daysAgo(1),
  archived_at: null,
  ...over,
});

const NAMES = { p1: "Rae LeBlanc", p2: "Tomi Okafor", p3: "Priya Raman" };
const nameOf = (id) => NAMES[id] ?? id;

describe("staleness", () => {
  it("measures age from the last update", () => {
    expect(ageInDays(project({ updated_at: daysAgo(100) }), NOW)).toBe(100);
  });

  it("reads naturally at every scale", () => {
    expect(stalenessLabel(project({ updated_at: daysAgo(0) }), NOW)).toBe("today");
    expect(stalenessLabel(project({ updated_at: daysAgo(1) }), NOW)).toBe("yesterday");
    expect(stalenessLabel(project({ updated_at: daysAgo(9) }), NOW)).toBe("9 days ago");
    expect(stalenessLabel(project({ updated_at: daysAgo(95) }), NOW)).toBe("3 months ago");
    expect(stalenessLabel(project({ updated_at: daysAgo(400) }), NOW)).toBe("over a year ago");
    expect(stalenessLabel(project({ updated_at: daysAgo(800) }), NOW)).toBe("over 2 years ago");
  });

});

describe("filtering", () => {
  const projects = [
    project({ id: "a", title: "Alopecia review", project_type: "review", work_status: "idea", authors: ["p1"], updated_at: daysAgo(2), academic_year: 2026 }),
    project({ id: "b", title: "Bullous pemphigoid", project_type: "case_report", work_status: "complete", authors: ["p2", "p3"], updated_at: daysAgo(120), academic_year: 2025, details: { case_number: "CR-2025-004", diagnosis: "Bullous pemphigoid" } }),
    project({ id: "c", title: "Teledermatology triage", project_type: "research", work_status: "analyzing", authors: ["p3"], updated_at: daysAgo(400) }),
    project({ id: "d", title: "Archived thing", project_type: "research", authors: ["p1"], archived_at: daysAgo(5) }),
  ];
  const ids = (f) => filterProjects(projects, f, { nameOf }).map((p) => p.id);

  it("hides archived projects by default and shows only those when asked", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(ids({ archived: "archived" })).toEqual(["d"]);
  });

  it("filters by type, status, author and year", () => {
    expect(ids({ type: "research" })).toEqual(["c"]);
    expect(ids({ status: "complete" })).toEqual(["b"]);
    expect(ids({ author: "p3" })).toEqual(["b", "c"]);
    expect(ids({ year: 2025 })).toEqual(["b"]);
    expect(ids({ year: "2025" })).toEqual(["b"]);
  });

  it("searches the things you can see in the table", () => {
    // Typing a word that is visibly on screen has to return the row it is
    // on. Type and status are rendered as labels, so the label is what
    // gets matched, not the code.
    expect(ids({ q: "research" })).toEqual(["c"]);       // Type column
    expect(ids({ q: "case report" })).toEqual(["b"]);    // Type column
    expect(ids({ q: "analyzing" })).toEqual(["c"]);      // Status column
    expect(ids({ q: "complete" })).toEqual(["b"]);       // Status column
    expect(ids({ q: "Priya" })).toEqual(["b", "c"]);     // Authors column
    expect(ids({ q: "leblanc" })).toEqual(["a"]);        // Authors column
  });

  it("matches a venue name, which is also on the table", () => {
    const withVenue = [
      project({ id: "v", title: "Something", venues: [
        { id: "v1", venue_name: "AAD Annual Meeting", venue_type: "poster" },
      ] }),
    ];
    expect(filterProjects(withVenue, { q: "aad" }, { nameOf })).toHaveLength(1);
  });

  it("still searches what the table does not show", () => {
    // Notes, diagnosis and case number stay searchable. A hit can land on
    // a row without visibly showing why, and that is the accepted cost of
    // being able to find a project from memory.
    expect(ids({ q: "alopecia" })).toEqual(["a"]);
    expect(ids({ q: "pemphigoid" })).toEqual(["b"]);     // title AND diagnosis
    expect(ids({ q: "CR-2025" })).toEqual(["b"]);        // case number
    expect(ids({ q: "  TRIAGE " })).toEqual(["c"]);      // trimmed, case-insensitive
  });

  it("searches the status label rather than its code", () => {
    // A user reads "Researching/analyzing", never "analyzing" — but the
    // code is a substring of the label, so both have to work.
    expect(ids({ q: "Researching" })).toEqual(["c"]);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(ids({ q: "zzzz" })).toEqual([]);
  });

  it("combines filters", () => {
    expect(ids({ author: "p3", type: "research" })).toEqual(["c"]);
    expect(ids({ author: "p1", type: "research" })).toEqual([]);
  });
});

describe("the active / archived / both view", () => {
  const projects = [
    project({ id: "live", archived_at: null }),
    project({ id: "gone", archived_at: daysAgo(5) }),
  ];
  const ids = (archived) => filterProjects(projects, { archived }, { nameOf }).map((p) => p.id);

  it("defaults to active only", () => {
    expect(filterProjects(projects, {}, { nameOf }).map((p) => p.id)).toEqual(["live"]);
  });

  it("shows each set on its own, and both together", () => {
    expect(ids("active")).toEqual(["live"]);
    expect(ids("archived")).toEqual(["gone"]);
    // The reason this state exists: "everything this person has done" was
    // unaskable with a two-way toggle.
    expect(ids("both")).toEqual(["live", "gone"]);
  });

  it("cycles active → archived → both → active", () => {
    expect(nextArchivedView("active")).toBe("archived");
    expect(nextArchivedView("archived")).toBe("both");
    expect(nextArchivedView("both")).toBe("active");
  });

  it("starts the cycle from active when handed something unexpected", () => {
    expect(nextArchivedView(undefined)).toBe("active");
  });
});

describe("typing a date", () => {
  it("puts the slashes in as you go", () => {
    expect(maskDateInput("0")).toBe("0");
    expect(maskDateInput("08")).toBe("08");
    expect(maskDateInput("080")).toBe("08/0");
    expect(maskDateInput("0804")).toBe("08/04");
    expect(maskDateInput("08042026")).toBe("08/04/2026");
  });

  it("ignores anything that is not a digit, so retyping over slashes works", () => {
    expect(maskDateInput("08/04/2026")).toBe("08/04/2026");
    expect(maskDateInput("08-04-2026")).toBe("08/04/2026");
    expect(maskDateInput("abc08x04y2026")).toBe("08/04/2026");
  });

  it("stops at eight digits rather than growing forever", () => {
    expect(maskDateInput("0804202699")).toBe("08/04/2026");
  });

  it("stores ISO, which is what the database wants and what sorts", () => {
    expect(displayDateToIso("08/04/2026")).toBe("2026-08-04");
  });

  it("treats a half-typed date as empty rather than as a wrong date", () => {
    // Mid-keystroke is not an error state; it just has nothing to commit.
    expect(displayDateToIso("08")).toBe("");
    expect(displayDateToIso("08/04")).toBe("");
    expect(displayDateToIso("")).toBe("");
  });

  it("rejects dates that do not exist", () => {
    expect(displayDateToIso("02/31/2026")).toBe("");
    expect(displayDateToIso("13/01/2026")).toBe("");
    expect(displayDateToIso("00/10/2026")).toBe("");
  });

  it("round-trips ISO to display and back", () => {
    expect(isoToDisplayDate("2026-08-04")).toBe("08/04/2026");
    expect(displayDateToIso(isoToDisplayDate("2026-08-04"))).toBe("2026-08-04");
  });

  it("shows nothing for a missing date", () => {
    expect(isoToDisplayDate("")).toBe("");
    expect(isoToDisplayDate(null)).toBe("");
  });
});

describe("has anything actually changed", () => {
  it("says no when a value is edited and put back", () => {
    // The whole point: a flag says "dirty" forever after one keystroke.
    const a = project({ title: "A" });
    expect(hasChanges({ ...a, title: "B" }, a)).toBe(true);
    expect(hasChanges({ ...a, title: "A" }, a)).toBe(false);
  });

  it("looks inside nested details", () => {
    const a = project({ details: { diagnosis: "DGI", year_seen: 2026 } });
    expect(hasChanges({ ...a, details: { diagnosis: "DGIx", year_seen: 2026 } }, a)).toBe(true);
    expect(hasChanges({ ...a, details: { diagnosis: "DGI", year_seen: 2026 } }, a)).toBe(false);
  });

  it("looks inside the venues array, including its order and length", () => {
    const v = (id, name) => ({ id, venue_name: name });
    const a = project({ venues: [v("v1", "MDS"), v("v2", "JAAD")] });
    expect(hasChanges({ ...a, venues: [v("v1", "MDS")] }, a)).toBe(true);
    expect(hasChanges({ ...a, venues: [v("v2", "JAAD"), v("v1", "MDS")] }, a)).toBe(true);
    expect(hasChanges({ ...a, venues: [v("v1", "MDS"), v("v2", "JAAD")] }, a)).toBe(false);
  });

  it("treats a missing field and an empty one as the same", () => {
    // A form that writes notes: "" where the record had none has not
    // changed anything a person would call a change.
    expect(deepEqual({ notes: "" }, {})).toBe(true);
    expect(deepEqual({ notes: null }, { notes: undefined })).toBe(true);
    expect(deepEqual({ notes: "x" }, {})).toBe(false);
  });

  it("does not confuse a zero or a false with an empty", () => {
    expect(deepEqual({ n: 0 }, {})).toBe(false);
    expect(deepEqual({ b: false }, {})).toBe(false);
  });
});

describe("dates must be whole and plausible", () => {
  const NOW_2026 = Date.parse("2026-08-04T12:00:00Z");

  it("accepts an empty box — blank is a real answer", () => {
    expect(dateEntryState("", NOW_2026)).toMatchObject({ empty: true, complete: true, problem: null });
  });

  it("rejects a half-typed date instead of silently storing nothing", () => {
    expect(dateEntryState("08", NOW_2026).problem).toBe("incomplete");
    expect(dateEntryState("08/04", NOW_2026).problem).toBe("incomplete");
  });

  it("rejects a date that does not exist", () => {
    expect(dateEntryState("02/31/2026", NOW_2026).problem).toBe("impossible");
    expect(dateEntryState("13/01/2026", NOW_2026).problem).toBe("impossible");
  });

  it("rejects years nobody entering a due date could mean", () => {
    expect(dateEntryState("08/04/1776", NOW_2026).problem).toBe("out-of-range");
    expect(dateEntryState("08/04/2999", NOW_2026).problem).toBe("out-of-range");
  });

  it("calls an implausible year implausible, not impossible", () => {
    // 1776 is a real date. Saying "not a real date" would be untrue.
    expect(dateEntryState("08/04/1776", NOW_2026).problem).not.toBe("impossible");
  });

  it("accepts the edges of the window", () => {
    expect(dateEntryState(`01/01/${DATE_MIN_YEAR}`, NOW_2026).problem).toBeNull();
    expect(dateEntryState(`12/31/${dateMaxYear(NOW_2026)}`, NOW_2026).problem).toBeNull();
  });

  it("hands back the ISO value once the entry is whole", () => {
    expect(dateEntryState("08/04/2026", NOW_2026)).toMatchObject({
      complete: true, problem: null, iso: "2026-08-04",
    });
  });

  it("explains each problem in words worth showing", () => {
    expect(describeDateProblem("incomplete", "Due date")).toMatch(/only partly filled in/);
    expect(describeDateProblem("impossible", "Due date")).toMatch(/not a real date/);
    expect(describeDateProblem("out-of-range", "Due date", NOW_2026))
      .toMatch(new RegExp(`${DATE_MIN_YEAR}.*${dateMaxYear(NOW_2026)}`));
    expect(describeDateProblem(null, "Due date")).toBeNull();
  });
});

describe("column sorting", () => {
  it("cycles ascending, descending, then back to the default", () => {
    let s = null;
    s = nextSort(s, "title");
    expect(s).toEqual({ column: "title", dir: "asc" });
    s = nextSort(s, "title");
    expect(s).toEqual({ column: "title", dir: "desc" });
    s = nextSort(s, "title");
    expect(s).toBeNull();
  });

  it("starts a different column at its own first direction, not the inherited one", () => {
    expect(nextSort({ column: "title", dir: "desc" }, "venues")).toEqual({ column: "venues", dir: "asc" });
    expect(nextSort({ column: "venues", dir: "asc" }, "title")).toEqual({ column: "title", dir: "asc" });
  });

  it("leads with the most recent on Updated, and ascending everywhere else", () => {
    // Nobody opens a project list wanting the oldest row first.
    expect(nextSort(null, "updated")).toEqual({ column: "updated", dir: "desc" });
    for (const col of ["title", "type", "status", "authors", "venues"]) {
      expect(nextSort(null, col)).toEqual({ column: col, dir: "asc" });
    }
  });

  it("cycles Updated as descending, ascending, default", () => {
    let s = nextSort(null, "updated");
    expect(s).toEqual({ column: "updated", dir: "desc" });
    s = nextSort(s, "updated");
    expect(s).toEqual({ column: "updated", dir: "asc" });
    s = nextSort(s, "updated");
    expect(s).toBeNull();
  });

  const projects = [
    project({ id: "a", title: "Cherry", project_type: "review", work_status: "complete", authors: ["p2"], venues: [{ id: "v1" }, { id: "v2" }], updated_at: daysAgo(30) }),
    project({ id: "b", title: "apple", project_type: "case_report", work_status: "idea", authors: ["p3"], venues: [], updated_at: daysAgo(1) }),
    project({ id: "c", title: "Banana", project_type: "research", work_status: "analyzing", authors: ["p1"], venues: [{ id: "v3" }], updated_at: daysAgo(10) }),
  ];
  const order = (sort) => sortProjects(projects, sort, nameOf).map((p) => p.id);

  it("defaults to most recently updated first", () => {
    expect(order(null)).toEqual(["b", "c", "a"]);
  });

  it("sorts titles case-insensitively", () => {
    expect(order({ column: "title", dir: "asc" })).toEqual(["b", "c", "a"]);
    expect(order({ column: "title", dir: "desc" })).toEqual(["a", "c", "b"]);
  });

  it("sorts work status by the vocabulary's own order, not alphabetically", () => {
    // Idea → Researching/analyzing → Complete. Alphabetical would give
    // "analyzing, complete, idea", which means nothing to anyone.
    expect(order({ column: "status", dir: "asc" })).toEqual(["b", "c", "a"]);
  });

  it("sorts authors by name, not by id", () => {
    // a→p2 Tomi Okafor, b→p3 Priya Raman, c→p1 Rae LeBlanc. Sorting by
    // id would give c, a, b; sorting by name gives b, c, a. They have to
    // disagree or the test proves nothing.
    expect(order({ column: "authors", dir: "asc" })).toEqual(["b", "c", "a"]);
    expect(order({ column: "authors", dir: "desc" })).toEqual(["a", "c", "b"]);
  });

  it("sorts venues by count", () => {
    expect(order({ column: "venues", dir: "asc" })).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the array it is given", () => {
    const before = projects.map((p) => p.id);
    sortProjects(projects, { column: "title", dir: "asc" }, nameOf);
    expect(projects.map((p) => p.id)).toEqual(before);
  });

  it("computes each sort key once per row, not once per comparison", () => {
    // The authors key maps ids to names and sorts them. Doing that inside
    // the comparator runs it O(n log n) times — measured at 51ms for a
    // thousand rows, which is visible jank while typing. This asserts the
    // shape of the fix rather than a wall-clock number, so it cannot go
    // flaky on a slow CI runner.
    const rows = Array.from({ length: 200 }, (_, i) =>
      project({ id: `p${i}`, title: `Project ${i}`, authors: ["p1", "p2"] })
    );
    let calls = 0;
    const counting = (id) => { calls += 1; return NAMES[id] ?? id; };
    sortProjects(rows, { column: "authors", dir: "asc" }, counting);
    // Two authors per row, looked up once each. A per-comparison
    // implementation lands in the thousands.
    expect(calls).toBe(400);
  });

  it("keeps the tiebreak ascending in both directions", () => {
    const tied = [
      project({ id: "z", title: "Zebra", venues: [] }),
      project({ id: "m", title: "Mango", venues: [] }),
    ];
    expect(sortProjects(tied, { column: "venues", dir: "asc" }, nameOf).map((p) => p.id)).toEqual(["m", "z"]);
    expect(sortProjects(tied, { column: "venues", dir: "desc" }, nameOf).map((p) => p.id)).toEqual(["m", "z"]);
  });

  it("breaks ties by title so rows do not shuffle between renders", () => {
    const tied = [
      project({ id: "z", title: "Zebra", venues: [] }),
      project({ id: "m", title: "Mango", venues: [] }),
    ];
    expect(sortProjects(tied, { column: "venues", dir: "asc" }, nameOf).map((p) => p.id))
      .toEqual(["m", "z"]);
  });
});

describe("pagination", () => {
  const many = Array.from({ length: 45 }, (_, i) =>
    project({ id: `p${i}`, title: `Project ${String(i).padStart(2, "0")}` })
  );

  it("defaults to 20 per page", () => {
    expect(PAGE_SIZE).toBe(20);
    const r = paginate(many);
    expect(r.rows).toHaveLength(20);
    expect(r.pages).toBe(3);
    expect(r.from).toBe(1);
    expect(r.to).toBe(20);
    expect(r.total).toBe(45);
  });

  it("returns the tail on the last page", () => {
    const r = paginate(many, 3);
    expect(r.rows).toHaveLength(5);
    expect(r.from).toBe(41);
    expect(r.to).toBe(45);
  });

  it("clamps a page past the end instead of showing nothing", () => {
    expect(paginate(many, 99).page).toBe(3);
    expect(paginate(many, 0).page).toBe(1);
    expect(paginate(many, -4).page).toBe(1);
  });

  it("survives an empty result set", () => {
    const r = paginate([], 1);
    expect(r).toMatchObject({ rows: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });

  it("reports one page when everything fits", () => {
    expect(pageCount(5)).toBe(1);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(21)).toBe(2);
  });

  it("paginates the FILTERED set, so filters reach rows on later pages", () => {
    const mixed = [
      ...Array.from({ length: 30 }, (_, i) => project({ id: `r${i}`, project_type: "research" })),
      project({ id: "needle", project_type: "case_report", title: "Needle" }),
    ];
    // The needle is row 31 — off page one entirely.
    const filtered = filterProjects(mixed, { type: "case_report" }, NOW);
    expect(paginate(filtered, 1).rows.map((p) => p.id)).toEqual(["needle"]);
  });
});

describe("saving requires an author", () => {
  it("accepts a project with a title and one author", () => {
    expect(validateProject(project(), NOW)).toEqual([]);
  });

  it("refuses to save with no authors", () => {
    const errors = validateProject(project({ authors: [] }), NOW);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("authors");
    expect(errors[0].message).toMatch(/at least one author/i);
  });

  it("refuses to save without a title", () => {
    expect(validateProject(project({ title: "   " }), NOW).map((e) => e.field)).toEqual(["title"]);
  });

  it("reports both problems at once", () => {
    const errors = validateProject(project({ title: "", authors: [] }), NOW);
    expect(errors.map((e) => e.field).sort()).toEqual(["authors", "title"]);
  });
});

/* The schema declares `venue_name text not null check (length(btrim(...)) > 0)`.
   Anything the form lets you save that the database will refuse is a
   defect the person typing only discovers in production. */
describe("a venue has to be named", () => {
  const withVenues = (venues) => project({ venues });
  const venue = (over = {}) => ({
    id: "v1", venue_type: "poster", venue_name: "AAD Annual",
    submission_status: "not_yet_submitted", other_venue_description: "",
    target_date: "", notes: "", ...over,
  });

  it("accepts a named venue", () => {
    expect(validateProject(withVenues([venue()]), NOW)).toEqual([]);
  });

  it("refuses a venue with an empty name", () => {
    const errors = validateProject(withVenues([venue({ venue_name: "" })]), NOW);
    expect(errors.map((e) => e.field)).toEqual(["venue_name"]);
    expect(errors[0].message).toMatch(/needs a name/i);
  });

  it("refuses a venue named only with whitespace", () => {
    // btrim in the check constraint means "   " is as empty as "".
    expect(validateProject(withVenues([venue({ venue_name: "   " })]), NOW)).toHaveLength(1);
  });

  it("counts them when more than one is unnamed", () => {
    const errors = validateProject(
      withVenues([venue({ venue_name: "" }), venue({ id: "v2", venue_name: "" })]), NOW
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/2 venues/);
  });

  it("says nothing about a project with no venues at all", () => {
    // Most projects have none, and that is not a problem to report.
    expect(validateProject(withVenues([]), NOW)).toEqual([]);
  });
});

describe("year seen cannot be in the future", () => {
  it("caps at the current calendar year", () => {
    expect(maxYearSeen(NOW)).toBe(2026);
  });

  it("rejects a future year", () => {
    const errors = validateProject(
      project({ project_type: "case_report", details: { year_seen: 2027 } }), NOW
    );
    expect(errors.map((e) => e.field)).toEqual(["year_seen"]);
    expect(errors[0].message).toMatch(/cannot be in the future/i);
  });

  it("accepts the current year and rejects one before 1990", () => {
    expect(validateProject(project({ project_type: "case_report", details: { year_seen: 2026 } }), NOW)).toEqual([]);
    expect(validateProject(project({ project_type: "case_report", details: { year_seen: 1989 } }), NOW)).toHaveLength(1);
  });

  it("treats an empty year as fine, because it is optional", () => {
    expect(validateProject(project({ project_type: "case_report", details: { year_seen: "" } }), NOW)).toEqual([]);
    expect(validateProject(project({ project_type: "case_report", details: {} }), NOW)).toEqual([]);
  });

  it("only checks the year on case reports", () => {
    expect(validateProject(project({ project_type: "research", details: { year_seen: 2099 } }), NOW)).toEqual([]);
  });
});

describe("changing a project's type", () => {
  const existing = [{ details: { case_number: "CR-2026-007" } }];

  it("issues a case ID when a project becomes a case report", () => {
    const p = project({ project_type: "research", details: { description: "Some study" } });
    const next = changeProjectType(p, "case_report", existing, NOW);
    expect(next.project_type).toBe("case_report");
    expect(next.details.case_number).toBe("CR-2026-008");
  });

  it("keeps the detail already typed, so a mis-set type is not a rewrite", () => {
    const p = project({ project_type: "research", details: { description: "Some study" } });
    const next = changeProjectType(p, "case_report", existing, NOW);
    expect(next.details.description).toBe("Some study");
  });

  it("never reissues a case ID on the way back", () => {
    const p = project({ project_type: "case_report", details: { case_number: "CR-2026-003", diagnosis: "BP" } });
    const away = changeProjectType(p, "research", existing, NOW);
    expect(away.details.case_number).toBe("CR-2026-003");
    const back = changeProjectType(away, "case_report", existing, NOW);
    // Burning a second number would make "how many case reports this
    // year" overcount.
    expect(back.details.case_number).toBe("CR-2026-003");
    expect(back.details.diagnosis).toBe("BP");
  });

  it("is a no-op when the type has not changed", () => {
    const p = project({ project_type: "research" });
    expect(changeProjectType(p, "research", existing, NOW)).toBe(p);
  });

  /* This used to assert the opposite — that a retype stamps `updated_at`
     — and that is what broke "put it back and there is nothing to save".
     changeProjectType edits a DRAFT. The draft is compared against the
     last saved state to decide whether Save has anything to do, so
     stamping the clock here made the two differ on a field the person
     never touched. Switching to Review and back to Research left the type
     identical and the timestamp different, and the panel demanded a save
     for a project nobody had changed. The save path stamps it, which is
     the moment it becomes true. */
  it("does not stamp updated_at, because it edits a draft rather than saving", () => {
    const p = project({ project_type: "research", updated_at: daysAgo(50) });
    expect(changeProjectType(p, "review", existing, NOW).updated_at).toBe(p.updated_at);
  });

  it("leaves nothing to save once the type is switched back", () => {
    const p = project({ project_type: "research", details: { description: "Some study" } });
    const away = changeProjectType(p, "review", existing, NOW);
    expect(hasChanges(away, p)).toBe(true);

    const back = changeProjectType(away, "research", existing, NOW);
    expect(back.project_type).toBe("research");
    expect(hasChanges(back, p)).toBe(false);
  });
});
