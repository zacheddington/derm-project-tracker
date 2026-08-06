import { describe, it, expect } from "vitest";
import { projectsToCsv, escapeCsv, neutralizeFormula, venueLabel, CSV_COLUMNS, CSV_HEADERS } from "./exportCsv.js";

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

describe("spreadsheet formula injection", () => {
  it("neutralises every character a spreadsheet treats as a formula lead", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(neutralizeFormula(`${lead}SUM(A1)`)).toBe(`'${lead}SUM(A1)`);
    }
  });

  it("defuses the two payloads that actually get used", () => {
    // A live link in the coordinator's spreadsheet.
    expect(neutralizeFormula('=HYPERLINK("http://evil","Q4 report")'))
      .toBe('\'=HYPERLINK("http://evil","Q4 report")');
    // The command form, which has historically executed on open.
    expect(neutralizeFormula("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
  });

  it("leaves ordinary clinical text completely alone", () => {
    for (const ok of ["Bullous pemphigoid", "JAK inhibitors", "2026", "Rae LeBlanc"]) {
      expect(neutralizeFormula(ok)).toBe(ok);
    }
  });

  it("survives a malicious project title end to end", () => {
    const csv = projectsToCsv([project({ title: "=1+1" })], people);
    const cell = parseRow(csv.split("\n")[1])[0];
    expect(cell.startsWith("'")).toBe(true);
    expect(cell).toBe("'=1+1");
  });

  it("still quotes a formula that also contains a comma", () => {
    // Both defences have to apply, not one or the other.
    expect(escapeCsv('=HYPERLINK("a","b")')).toBe(`"'=HYPERLINK(""a"",""b"")"`);
  });
});

describe("the exported sheet mirrors the table", () => {
  it("leads with a header row a person can read", () => {
    // The file is opened in Excel by the program coordinator. The field
    // keys are the schema's words and stay the internal order; row 1 is
    // what someone who did not write the schema sees.
    const [header] = projectsToCsv([], people).split("\n");
    expect(parseRow(header)).toEqual([
      "Title", "Case number", "Next action",
      "Type", "Work status", "Authors", "Venues", "Last updated",
    ]);
  });

  it("gives every exported column a header label", () => {
    // A column added to CSV_COLUMNS without a label would write "undefined"
    // into row 1 of a document nobody re-reads before sending it on.
    for (const key of CSV_COLUMNS) {
      expect(CSV_HEADERS[key]).toBeTruthy();
    }
    expect(Object.keys(CSV_HEADERS).sort()).toEqual([...CSV_COLUMNS].sort());
  });

  it("keeps the header aligned with the row beneath it", () => {
    const csv = projectsToCsv([project({ id: "a" })], people);
    const [header, row] = csv.split("\n");
    expect(parseRow(header)).toHaveLength(parseRow(row).length);
  });

  it("exports the columns on screen and nothing else", () => {
    // The download used to carry twenty-two columns for a table showing
    // six, which made it a different document with the same name.
    expect(CSV_COLUMNS).toEqual([
      "title", "case_number", "next_action",
      "project_type", "work_status", "authors", "venues", "updated_at",
    ]);
  });

  it("no longer carries fields that were never on the table", () => {
    for (const gone of [
      "diagnosis", "why_unique", "year_seen", "consent",
      "attending", "description", "irb_status", "academic_year",
      "resident_authors", "next_action_due_date", "created_at",
      "archived", "archived_at",
    ]) {
      expect(CSV_COLUMNS).not.toContain(gone);
    }
  });

  it("says authors, not owners", () => {
    expect(CSV_COLUMNS).toContain("authors");
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
  });

  it("lists every author in one cell, as the Authors column does", () => {
    const row = parseRow(projectsToCsv([project()], people).split("\n")[1]);
    expect(row[CSV_COLUMNS.indexOf("authors")]).toBe("Rae LeBlanc; Priya Raman");
  });

  it("unpacks the Project column into its parts", () => {
    // On screen the case number and next action sit under the title; a
    // spreadsheet wants them in their own columns.
    const row = parseRow(projectsToCsv([project({
      next_action: "Return revisions",
      details: { case_number: "CR-2026-001" },
    })], people).split("\n")[1]);
    expect(row[CSV_COLUMNS.indexOf("case_number")]).toBe("CR-2026-001");
    expect(row[CSV_COLUMNS.indexOf("next_action")]).toBe("Return revisions");
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
    expect(venueLabel({ venue_type: "poster", venue_name: "MDS", other_venue_description: "stale" }))
      .toBe("MDS");
  });

  it("gives the Updated column as a date, not as 3 days ago", () => {
    const row = parseRow(projectsToCsv([project()], people).split("\n")[1]);
    expect(row[CSV_COLUMNS.indexOf("updated_at")]).toBe("2026-08-03");
  });

  it("never emits a patient identifier column", () => {
    for (const banned of ["patient_name", "mrn", "date_of_birth", "date_of_service"]) {
      expect(CSV_COLUMNS).not.toContain(banned);
    }
  });
});
