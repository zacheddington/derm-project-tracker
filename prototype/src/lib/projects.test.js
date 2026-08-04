import { describe, it, expect } from "vitest";
import {
  ageInDays,
  stalenessLabel,
  stalenessCounts,
  filterProjects,
  nextSort,
  sortProjects,
  paginate,
  pageCount,
  validateProject,
  maxYearSeen,
  changeProjectType,
  STALE_DAYS,
  ANCIENT_DAYS,
  PAGE_SIZE,
} from "./projects.js";

const NOW = Date.parse("2026-08-03T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 864e5).toISOString();

const project = (over = {}) => ({
  id: "x1",
  title: "A project",
  type: "research",
  work_status: "idea",
  owners: ["p1"],
  purpose: "",
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

  it("counts the two banners, with the older set nested inside the newer", () => {
    const projects = [
      project({ id: "a", updated_at: daysAgo(10) }),
      project({ id: "b", updated_at: daysAgo(120) }),
      project({ id: "c", updated_at: daysAgo(400) }),
      project({ id: "d", updated_at: daysAgo(900) }),
    ];
    const c = stalenessCounts(projects, NOW);
    // "over three months" is literally true of the two-year-old ones too,
    // so the amber banner must include them or its own sentence is wrong.
    expect(c.stale).toBe(3);
    expect(c.ancient).toBe(2);
  });

  it("ignores archived projects in both counts", () => {
    const projects = [
      project({ id: "a", updated_at: daysAgo(400), archived_at: daysAgo(1) }),
      project({ id: "b", updated_at: daysAgo(400) }),
    ];
    expect(stalenessCounts(projects, NOW)).toEqual({ stale: 1, ancient: 1 });
  });

  it("does not fire a day early on either threshold", () => {
    // Each threshold is checked on its own. Putting both in one array
    // would not test the boundary: a 365-day-old project is over three
    // months old too, so it lands in the amber count either way.
    const at = (n) => stalenessCounts([project({ updated_at: daysAgo(n) })], NOW);
    expect(at(STALE_DAYS).stale).toBe(0);
    expect(at(STALE_DAYS + 1).stale).toBe(1);
    expect(at(ANCIENT_DAYS).ancient).toBe(0);
    expect(at(ANCIENT_DAYS + 1).ancient).toBe(1);
  });
});

describe("filtering", () => {
  const projects = [
    project({ id: "a", title: "Alopecia review", type: "review", work_status: "idea", owners: ["p1"], updated_at: daysAgo(2), academic_year: 2026 }),
    project({ id: "b", title: "Bullous pemphigoid", type: "case_report", work_status: "complete", owners: ["p2", "p3"], updated_at: daysAgo(120), academic_year: 2025, details: { case_id: "CR-2025-004", diagnosis: "Bullous pemphigoid" } }),
    project({ id: "c", title: "Teledermatology triage", type: "research", work_status: "analyzing", owners: ["p3"], updated_at: daysAgo(400) }),
    project({ id: "d", title: "Archived thing", type: "research", owners: ["p1"], archived_at: daysAgo(5) }),
  ];
  const ids = (f) => filterProjects(projects, f, NOW).map((p) => p.id);

  it("hides archived projects by default and shows only those when asked", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(ids({ archived: true })).toEqual(["d"]);
  });

  it("filters by type, status, author and year", () => {
    expect(ids({ type: "research" })).toEqual(["c"]);
    expect(ids({ status: "complete" })).toEqual(["b"]);
    expect(ids({ author: "p3" })).toEqual(["b", "c"]);
    expect(ids({ year: 2025 })).toEqual(["b"]);
    expect(ids({ year: "2025" })).toEqual(["b"]);
  });

  it("searches title, purpose, notes, diagnosis and case ID", () => {
    expect(ids({ q: "alopecia" })).toEqual(["a"]);
    expect(ids({ q: "pemphigoid" })).toEqual(["b"]);
    expect(ids({ q: "CR-2025" })).toEqual(["b"]);
    expect(ids({ q: "  TRIAGE " })).toEqual(["c"]);
  });

  it("applies the staleness filters the banners set", () => {
    expect(ids({ stale: "stale" })).toEqual(["b", "c"]);
    expect(ids({ stale: "ancient" })).toEqual(["c"]);
  });

  it("makes each banner's count equal the rows it lands you on", () => {
    const counts = stalenessCounts(projects, NOW);
    expect(filterProjects(projects, { stale: "stale" }, NOW)).toHaveLength(counts.stale);
    expect(filterProjects(projects, { stale: "ancient" }, NOW)).toHaveLength(counts.ancient);
  });

  it("combines filters", () => {
    expect(ids({ author: "p3", stale: "ancient" })).toEqual(["c"]);
    expect(ids({ author: "p1", stale: "ancient" })).toEqual([]);
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

  it("starts a different column over at ascending rather than inheriting", () => {
    const s = nextSort({ column: "title", dir: "desc" }, "updated");
    expect(s).toEqual({ column: "updated", dir: "asc" });
  });

  const projects = [
    project({ id: "a", title: "Cherry", type: "review", work_status: "complete", owners: ["p2"], venues: [{ id: "v1" }, { id: "v2" }], updated_at: daysAgo(30) }),
    project({ id: "b", title: "apple", type: "case_report", work_status: "idea", owners: ["p3"], venues: [], updated_at: daysAgo(1) }),
    project({ id: "c", title: "Banana", type: "research", work_status: "analyzing", owners: ["p1"], venues: [{ id: "v3" }], updated_at: daysAgo(10) }),
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
      project({ id: `p${i}`, title: `Project ${i}`, owners: ["p1", "p2"] })
    );
    let calls = 0;
    const counting = (id) => { calls += 1; return NAMES[id] ?? id; };
    sortProjects(rows, { column: "authors", dir: "asc" }, counting);
    // Two owners per row, looked up once each. A per-comparison
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
      ...Array.from({ length: 30 }, (_, i) => project({ id: `r${i}`, type: "research" })),
      project({ id: "needle", type: "case_report", title: "Needle" }),
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
    const errors = validateProject(project({ owners: [] }), NOW);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("owners");
    expect(errors[0].message).toMatch(/at least one author/i);
  });

  it("refuses to save without a title", () => {
    expect(validateProject(project({ title: "   " }), NOW).map((e) => e.field)).toEqual(["title"]);
  });

  it("reports both problems at once", () => {
    const errors = validateProject(project({ title: "", owners: [] }), NOW);
    expect(errors.map((e) => e.field).sort()).toEqual(["owners", "title"]);
  });
});

describe("year seen cannot be in the future", () => {
  it("caps at the current calendar year", () => {
    expect(maxYearSeen(NOW)).toBe(2026);
  });

  it("rejects a future year", () => {
    const errors = validateProject(
      project({ type: "case_report", details: { year_seen: 2027 } }), NOW
    );
    expect(errors.map((e) => e.field)).toEqual(["year_seen"]);
    expect(errors[0].message).toMatch(/cannot be in the future/i);
  });

  it("accepts the current year and rejects one before 1990", () => {
    expect(validateProject(project({ type: "case_report", details: { year_seen: 2026 } }), NOW)).toEqual([]);
    expect(validateProject(project({ type: "case_report", details: { year_seen: 1989 } }), NOW)).toHaveLength(1);
  });

  it("treats an empty year as fine, because it is optional", () => {
    expect(validateProject(project({ type: "case_report", details: { year_seen: "" } }), NOW)).toEqual([]);
    expect(validateProject(project({ type: "case_report", details: {} }), NOW)).toEqual([]);
  });

  it("only checks the year on case reports", () => {
    expect(validateProject(project({ type: "research", details: { year_seen: 2099 } }), NOW)).toEqual([]);
  });
});

describe("changing a project's type", () => {
  const existing = [{ details: { case_id: "CR-2026-007" } }];

  it("issues a case ID when a project becomes a case report", () => {
    const p = project({ type: "research", details: { description: "Some study" } });
    const next = changeProjectType(p, "case_report", existing, NOW);
    expect(next.type).toBe("case_report");
    expect(next.details.case_id).toBe("CR-2026-008");
  });

  it("keeps the detail already typed, so a mis-set type is not a rewrite", () => {
    const p = project({ type: "research", details: { description: "Some study" } });
    const next = changeProjectType(p, "case_report", existing, NOW);
    expect(next.details.description).toBe("Some study");
  });

  it("never reissues a case ID on the way back", () => {
    const p = project({ type: "case_report", details: { case_id: "CR-2026-003", diagnosis: "BP" } });
    const away = changeProjectType(p, "research", existing, NOW);
    expect(away.details.case_id).toBe("CR-2026-003");
    const back = changeProjectType(away, "case_report", existing, NOW);
    // Burning a second number would make "how many case reports this
    // year" overcount.
    expect(back.details.case_id).toBe("CR-2026-003");
    expect(back.details.diagnosis).toBe("BP");
  });

  it("is a no-op when the type has not changed", () => {
    const p = project({ type: "research" });
    expect(changeProjectType(p, "research", existing, NOW)).toBe(p);
  });

  it("touches updated_at, because a retype is an edit", () => {
    const p = project({ type: "research", updated_at: daysAgo(50) });
    expect(changeProjectType(p, "review", existing, NOW).updated_at)
      .toBe(new Date(NOW).toISOString());
  });
});
