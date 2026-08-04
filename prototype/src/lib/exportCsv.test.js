import { describe, it, expect } from "vitest";
import { projectsToCsv, escapeCsv, venueLabel, CSV_COLUMNS } from "./exportCsv.js";

const people = [
  { id: "p1", display_name: "Rae LeBlanc", staff_position: "resident" },
  { id: "p2", display_name: "Priya Raman", staff_position: "attending" },
  { id: "p3", display_name: "Ben Iwu", staff_position: "external_collaborator" },
];

const project = (over = {}) => ({
  id: "x1",
  title: "A project",
  project_type: "case_report",
  work_status: "in_edit",
  authors: ["p1", "p2"],
  purpose: "",
  notes: "",
  next_action: "",
  next_action_due_date: "",
  irb_status: "not_applicable",
  academic_year: 2026,
  updated_at: "2026-08-03T09:15:00.000Z",
  archived_at: null,
  details: {},
  venues: [],
  ...over,
});

const parseRow = (line) => {
  // Minimal RFC 4180 reader, used only to prove the writer round-trips.
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
};

describe("CSV escaping", () => {
  it("leaves ordinary values alone", () => {
    expect(escapeCsv("Bullous pemphigoid")).toBe("Bullous pemphigoid");
  });

  it("quotes a value containing a comma", () => {
    // The single commonest way a hand-rolled CSV corrupts an entire file.
    expect(escapeCsv("Rash, disseminated")).toBe('"Rash, disseminated"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsv('He said "no"')).toBe('"He said ""no"""');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsv("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as empty, not as the word null", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });
});

describe("the exported sheet", () => {
  it("leads with the documented header row", () => {
    const [header] = projectsToCsv([], people).split("\n");
    expect(parseRow(header)).toEqual(CSV_COLUMNS);
  });

  it("says authors, not owners, matching the interface and project_export", () => {
    expect(CSV_COLUMNS).toContain("authors");
    expect(CSV_COLUMNS).toContain("resident_authors");
    expect(CSV_COLUMNS).not.toContain("owners");
    expect(CSV_COLUMNS).toContain("case_number");
    expect(CSV_COLUMNS).not.toContain("case_id");
  });

  it("emits one row per project plus the header", () => {
    const csv = projectsToCsv([project({ id: "a" }), project({ id: "b" })], people);
    expect(csv.split("\n")).toHaveLength(3);
  });

  it("renders labels rather than codes, because a human opens this", () => {
    const row = parseRow(projectsToCsv([project()], people).split("\n")[1]);
    expect(row[CSV_COLUMNS.indexOf("project_type")]).toBe("Case report");
    expect(row[CSV_COLUMNS.indexOf("work_status")]).toBe("In edit");
    expect(row[CSV_COLUMNS.indexOf("academic_year")]).toBe("2026–2027");
  });

  it("lists all authors in one cell and residents separately for ACGME", () => {
    const row = parseRow(projectsToCsv([project()], people).split("\n")[1]);
    expect(row[CSV_COLUMNS.indexOf("authors")]).toBe("Rae LeBlanc; Priya Raman");
    expect(row[CSV_COLUMNS.indexOf("resident_authors")]).toBe("Rae LeBlanc");
  });

  it("survives a title containing a comma without shifting every column", () => {
    const csv = projectsToCsv([project({ title: "Rash, disseminated" })], people);
    const row = parseRow(csv.split("\n")[1]);
    expect(row[0]).toBe("Rash, disseminated");
    expect(row).toHaveLength(CSV_COLUMNS.length);
  });

  it("collapses venues into one cell with their status", () => {
    const csv = projectsToCsv([project({
      venues: [
        { id: "v1", venue_type: "poster", venue_name: "MDS Annual", submission_status: "accepted" },
        { id: "v2", venue_type: "journal", venue_name: "JAAD Case Reports", submission_status: "in_review" },
      ],
    })], people);
    expect(parseRow(csv.split("\n")[1])[CSV_COLUMNS.indexOf("venues")])
      .toBe("MDS Annual (Accepted); JAAD Case Reports (In review)");
  });

  it("carries the free-text kind through for an Other venue", () => {
    expect(venueLabel({ venue_type: "other", venue_name: "Teaching day", other_venue_description: "Grand rounds elsewhere" }))
      .toBe("Teaching day [Grand rounds elsewhere]");
    // A leftover description on a non-Other venue is ignored rather than
    // exported, matching the CHECK constraint in the schema.
    expect(venueLabel({ venue_type: "poster", venue_name: "MDS", other_venue_description: "stale" }))
      .toBe("MDS");
  });

  it("resolves the attending to a name, not an id", () => {
    const csv = projectsToCsv([project({ details: { attending_id: "p2" } })], people);
    expect(parseRow(csv.split("\n")[1])[CSV_COLUMNS.indexOf("attending")]).toBe("Priya Raman");
  });

  it("leaves type-specific columns empty for the other types", () => {
    const csv = projectsToCsv([project({ project_type: "research", details: { description: "A study" } })], people);
    const row = parseRow(csv.split("\n")[1]);
    expect(row[CSV_COLUMNS.indexOf("description")]).toBe("A study");
    expect(row[CSV_COLUMNS.indexOf("case_number")]).toBe("");
    expect(row[CSV_COLUMNS.indexOf("diagnosis")]).toBe("");
  });

  it("marks archived projects rather than dropping them", () => {
    const csv = projectsToCsv([project({ archived_at: "2026-07-01T00:00:00.000Z" })], people);
    expect(parseRow(csv.split("\n")[1])[CSV_COLUMNS.indexOf("archived")]).toBe("yes");
  });

  it("exports the update date only, never a time", () => {
    const row = parseRow(projectsToCsv([project()], people).split("\n")[1]);
    expect(row[CSV_COLUMNS.indexOf("updated_at")]).toBe("2026-08-03");
  });

  it("never emits a patient identifier column", () => {
    for (const banned of ["patient_name", "mrn", "date_of_birth", "date_of_service"]) {
      expect(CSV_COLUMNS).not.toContain(banned);
    }
  });
});
