import { describe, it, expect } from "vitest";
import {
  PERSON_ROLES,
  label,
  academicYearOf,
  ayLabel,
  isPersonActive,
  activePeople,
  renamePerson,
  updatePerson,
  personSubtitle,
  needsPosition,
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

describe("roles", () => {
  it("labels the coordinator role 'Research fellow'", () => {
    expect(label(PERSON_ROLES, "research_coordinator")).toBe("Research fellow");
  });

  it("keeps the enum CODE unchanged, because renaming it is a migration", () => {
    expect(PERSON_ROLES.map((r) => r.code)).toContain("research_coordinator");
    expect(PERSON_ROLES.map((r) => r.code)).not.toContain("research_fellow");
  });

  it("asks for a free-text position only for external collaborators", () => {
    expect(needsPosition("external_collaborator")).toBe(true);
    expect(needsPosition("attending")).toBe(false);
    expect(needsPosition("resident")).toBe(false);
  });

  it("shows the position instead of the bare role once one is given", () => {
    const p = { role: "external_collaborator", position: "Pathologist, UMMC" };
    expect(personSubtitle(p)).toBe("External collaborator · Pathologist, UMMC");
    expect(personSubtitle({ role: "resident", pgy_level: 3 })).toBe("Resident · PGY-3");
  });
});

describe("employment end dates", () => {
  const now = AT("2026-08-03T12:00:00Z");

  it("treats someone with no end date as active", () => {
    expect(isPersonActive({ id: "p1" }, now)).toBe(true);
  });

  it("keeps someone who has given notice but has not left yet", () => {
    expect(isPersonActive({ id: "p1", end_date: "2026-12-31" }, now)).toBe(true);
  });

  it("drops someone whose end date has passed", () => {
    expect(isPersonActive({ id: "p1", end_date: "2026-06-30" }, now)).toBe(false);
  });

  it("counts the last day of employment as still employed", () => {
    expect(isPersonActive({ id: "p1", end_date: "2026-08-03" }, now)).toBe(true);
  });

  it("filters pickers down to current staff", () => {
    const people = [
      { id: "p1", display_name: "Rae" },
      { id: "p2", display_name: "Gone", end_date: "2020-01-01" },
    ];
    expect(activePeople(people, now).map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("renaming an author", () => {
  const people = [
    { id: "p2", display_name: "Tomi Okafor", role: "resident" },
    { id: "p3", display_name: "Priya Raman", role: "attending" },
  ];

  it("changes the name and nothing else, so project links survive", () => {
    const next = renamePerson(people, "p2", "Tomi Albrecht");
    expect(next.find((p) => p.id === "p2").display_name).toBe("Tomi Albrecht");
    // The id is what projects reference. If this ever changes, every
    // association in the system silently detaches.
    expect(next.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(next.find((p) => p.id === "p2").role).toBe("resident");
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
    const staff = [{ id: "p9", display_name: "Sam", role: "external_collaborator", position: "Pharmacist" }];
    const next = updatePerson(staff, "p9", { role: "attending" });
    expect(next[0].position).toBeUndefined();
  });
});

describe("case ID sequence", () => {
  it("numbers per academic year, zero padded", () => {
    expect(nextCaseId([], 2026)).toBe("CR-2026-001");
  });

  it("continues from the highest issued, not the count", () => {
    const projects = [
      { details: { case_id: "CR-2026-001" } },
      { details: { case_id: "CR-2026-002" } },
      { details: { case_id: "CR-2026-003" } },
    ];
    expect(nextCaseId(projects, 2026)).toBe("CR-2026-004");
  });

  it("does not reissue a number after one is archived or retyped", () => {
    // Counting live case reports would return 003 here and collide.
    const projects = [
      { details: { case_id: "CR-2026-001" } },
      { details: { case_id: "CR-2026-002" }, archived_at: "2026-05-01T00:00:00Z" },
      { details: { case_id: "CR-2026-003" } },
    ];
    expect(nextCaseId(projects, 2026)).toBe("CR-2026-004");
  });

  it("restarts each academic year", () => {
    const projects = [
      { details: { case_id: "CR-2025-014" } },
      { details: { case_id: "CR-2025-015" } },
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
