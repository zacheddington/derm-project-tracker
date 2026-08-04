import { describe, it, expect } from "vitest";
import {
  STAFF_POSITIONS,
  label,
  academicYearOf,
  ayLabel,
  isPersonActive,
  activePeople,
  filterRoster,
  projectLoad,
  pluralProjects,
  renamePerson,
  updatePerson,
  personSubtitle,
  needsExternalPosition,
  nextCaseId,
  scanForIdentifiers,
} from "./domain.js";

const AT = (iso) => Date.parse(iso);

describe("academic year", () => {
  it("starts on 1 July", () => {
    expect(academicYearOf(new Date("2026-06-30T12:00:00Z"))).toBe(2025);
    expect(academicYearOf(new Date("2026-07-01T12:00:00Z"))).toBe(2026);
  });

  it("renders as a span", () => {
    expect(ayLabel(2026)).toBe("2026–2027");
  });
});

describe("staff positions", () => {
  it("uses the same word in the interface and in the database", () => {
    // These used to disagree: the UI said "Research fellow" while the
    // Postgres enum said 'research_coordinator', so anyone reading the
    // table had to be told out of band that they were the same thing.
    // schema-parity.test.js is what keeps them agreeing from here on.
    expect(label(STAFF_POSITIONS, "research_fellow")).toBe("Research fellow");
    expect(STAFF_POSITIONS.map((r) => r.code)).not.toContain("research_coordinator");
  });

  it("asks for a free-text position only for external collaborators", () => {
    expect(needsExternalPosition("external_collaborator")).toBe(true);
    expect(needsExternalPosition("attending")).toBe(false);
    expect(needsExternalPosition("resident")).toBe(false);
  });

  it("shows the position instead of the bare role once one is given", () => {
    const p = { staff_position: "external_collaborator", external_position: "Pathologist, UMMC" };
    expect(personSubtitle(p)).toBe("External collaborator · Pathologist, UMMC");
    expect(personSubtitle({ staff_position: "resident", pgy_level: 3 })).toBe("Resident · PGY-3");
  });
});

describe("employment end dates", () => {
  const now = AT("2026-08-03T12:00:00Z");

  it("treats someone with no end date as active", () => {
    expect(isPersonActive({ id: "p1" }, now)).toBe(true);
  });

  it("keeps someone who has given notice but has not left yet", () => {
    expect(isPersonActive({ id: "p1", employment_end_date: "2026-12-31" }, now)).toBe(true);
  });

  it("drops someone whose end date has passed", () => {
    expect(isPersonActive({ id: "p1", employment_end_date: "2026-06-30" }, now)).toBe(false);
  });

  it("counts the last day of employment as still employed", () => {
    expect(isPersonActive({ id: "p1", employment_end_date: "2026-08-03" }, now)).toBe(true);
  });

  it("filters pickers down to current staff", () => {
    const people = [
      { id: "p1", display_name: "Rae" },
      { id: "p2", display_name: "Gone", employment_end_date: "2020-01-01" },
    ];
    expect(activePeople(people, now).map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("the roster list", () => {
  const now = AT("2026-08-03T12:00:00Z");
  const people = [
    { id: "p1", display_name: "Rae LeBlanc", staff_position: "resident" },
    { id: "p2", display_name: "Tomi Albrecht", staff_position: "resident" },
    { id: "p3", display_name: "Ellen Voss", staff_position: "resident", employment_end_date: "2025-06-30" },
    { id: "p4", display_name: "Marcus Hale", staff_position: "resident", employment_end_date: "2024-06-30" },
    { id: "p5", display_name: "Ben Iwu", staff_position: "external_collaborator", external_position: "Dermatopathologist, Baptist Health" },
  ];
  const names = (opts) => filterRoster(people, opts, now).map((p) => p.display_name);

  it("shows only current staff by default", () => {
    expect(names({})).toEqual(["Rae LeBlanc", "Tomi Albrecht", "Ben Iwu"]);
  });

  it("shows former staff INSTEAD OF current staff, not mixed in", () => {
    // Greying leavers out inside one list reads as a rendering quirk and
    // gives no way to answer "who has left?" by scanning.
    expect(names({ showFormer: true })).toEqual(["Ellen Voss", "Marcus Hale"]);
  });

  it("searches by name in both views", () => {
    expect(names({ query: "tomi" })).toEqual(["Tomi Albrecht"]);
    expect(names({ showFormer: true, query: "voss" })).toEqual(["Ellen Voss"]);
  });

  it("does not find a former colleague in the current view", () => {
    expect(names({ query: "voss" })).toEqual([]);
  });

  it("searches the external position, for the name you cannot remember", () => {
    expect(names({ query: "dermatopath" })).toEqual(["Ben Iwu"]);
    expect(names({ query: "baptist" })).toEqual(["Ben Iwu"]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(names({ query: "  RAE  " })).toEqual(["Rae LeBlanc"]);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(names({ query: "zzzz" })).toEqual([]);
  });
});

describe("how much someone is carrying", () => {
  const projects = [
    { id: "x1", authors: ["p1", "p2"], archived_at: null },
    { id: "x2", authors: ["p1"], archived_at: null },
    { id: "x3", authors: ["p1"], archived_at: "2026-01-01T00:00:00Z" },
    { id: "x4", authors: ["p2"], archived_at: "2026-02-01T00:00:00Z" },
  ];

  it("splits active from archived", () => {
    expect(projectLoad("p1", projects)).toEqual({ active: 2, archived: 1 });
    expect(projectLoad("p2", projects)).toEqual({ active: 1, archived: 1 });
  });

  it("returns zeros for someone with nothing, rather than nothing at all", () => {
    // "0 active projects" is the single most useful thing the roster can
    // say — it is how you find who needs work. Omitting it hides them.
    expect(projectLoad("p99", projects)).toEqual({ active: 0, archived: 0 });
  });

  it("counts a person once per project, not once per co-author", () => {
    expect(projectLoad("p1", projects).active).toBe(2);
  });

  it("copes with a project that has no authors array", () => {
    expect(projectLoad("p1", [{ id: "x" }])).toEqual({ active: 0, archived: 0 });
  });

  it("pluralises only where English does", () => {
    expect(pluralProjects(0)).toBe("0 projects");
    expect(pluralProjects(1)).toBe("1 project");
    expect(pluralProjects(2)).toBe("2 projects");
  });
});

describe("renaming an author", () => {
  const people = [
    { id: "p2", display_name: "Tomi Okafor", staff_position: "resident" },
    { id: "p3", display_name: "Priya Raman", staff_position: "attending" },
  ];

  it("changes the name and nothing else, so project links survive", () => {
    const next = renamePerson(people, "p2", "Tomi Albrecht");
    expect(next.find((p) => p.id === "p2").display_name).toBe("Tomi Albrecht");
    // The id is what projects reference. If this ever changes, every
    // association in the system silently detaches.
    expect(next.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(next.find((p) => p.id === "p2").staff_position).toBe("resident");
  });

  it("leaves everyone else untouched", () => {
    const next = renamePerson(people, "p2", "Tomi Albrecht");
    expect(next.find((p) => p.id === "p3")).toEqual(people[1]);
  });

  it("refuses a blank name rather than erasing someone", () => {
    expect(renamePerson(people, "p2", "   ")).toEqual(people);
  });

  it("trims whitespace on update", () => {
    const next = updatePerson(people, "p2", { display_name: "  Tomi Albrecht  " });
    expect(next.find((p) => p.id === "p2").display_name).toBe("Tomi Albrecht");
  });

  it("drops a stale position when the role no longer needs one", () => {
    const staff = [{ id: "p9", display_name: "Sam", staff_position: "external_collaborator", external_position: "Pharmacist" }];
    const next = updatePerson(staff, "p9", { staff_position: "attending" });
    expect(next[0].external_position).toBeUndefined();
  });
});

describe("case ID sequence", () => {
  it("numbers per academic year, zero padded", () => {
    expect(nextCaseId([], 2026)).toBe("CR-2026-001");
  });

  it("continues from the highest issued, not the count", () => {
    const projects = [
      { details: { case_number: "CR-2026-001" } },
      { details: { case_number: "CR-2026-002" } },
      { details: { case_number: "CR-2026-003" } },
    ];
    expect(nextCaseId(projects, 2026)).toBe("CR-2026-004");
  });

  it("does not reissue a number after one is archived or retyped", () => {
    // Counting live case reports would return 003 here and collide.
    const projects = [
      { details: { case_number: "CR-2026-001" } },
      { details: { case_number: "CR-2026-002" }, archived_at: "2026-05-01T00:00:00Z" },
      { details: { case_number: "CR-2026-003" } },
    ];
    expect(nextCaseId(projects, 2026)).toBe("CR-2026-004");
  });

  it("restarts each academic year", () => {
    const projects = [
      { details: { case_number: "CR-2025-014" } },
      { details: { case_number: "CR-2025-015" } },
    ];
    expect(nextCaseId(projects, 2026)).toBe("CR-2026-001");
    expect(nextCaseId(projects, 2025)).toBe("CR-2025-016");
  });

  it("ignores projects with no case ID", () => {
    const projects = [{ details: {} }, { details: null }, {}];
    expect(nextCaseId(projects, 2026)).toBe("CR-2026-001");
  });
});

describe("identifier tripwire", () => {
  it("flags MRN-shaped and date-shaped text", () => {
    expect(scanForIdentifiers("seen 4/12/2025")).toMatch(/full date/);
    expect(scanForIdentifiers("MRN 12345678")).toBeTruthy();
    expect(scanForIdentifiers("Bullous pemphigoid")).toBeNull();
  });

  it("does not flag an academic year on its own", () => {
    expect(scanForIdentifiers("seen in 2025")).toBeNull();
  });
});
