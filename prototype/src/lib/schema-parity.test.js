import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  STAFF_POSITIONS, TYPES, IRB_STATUSES, VENUE_TYPES, CONSENT,
  WORK_STATUSES, SUBMISSION_STATUSES,
} from "./domain.js";

/* ---------------------------------------------------------------------
   The UI and the database must use the same words.

   This is the guard for the failure that prompted it: the interface said
   "Research fellow" while the Postgres enum said 'research_coordinator',
   so anyone reading the database had to be told, out of band, that the
   two were the same thing. Documentation does not prevent that. A test
   does.

   Every vocabulary the user sees is defined in exactly one place in SQL
   and mirrored in domain.js. If someone adds a status, a project type or
   a staff position to one and not the other, this fails and names the
   missing value.
   --------------------------------------------------------------------- */

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/0001_schema.sql", import.meta.url)),
  "utf8"
);

/* Values of `create type <name> as enum ('a', 'b', ...)`. */
function enumValues(typeName) {
  const m = sql.match(new RegExp(`create type\\s+${typeName}\\s+as enum\\s*\\(([^)]*)\\)`, "i"));
  if (!m) throw new Error(`enum ${typeName} not found in 0001_schema.sql`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/* Codes seeded into a lookup table by its INSERT. */
function lookupCodes(tableName) {
  const m = sql.match(new RegExp(`insert into ${tableName}\\s*\\([^)]*\\)\\s*values([\\s\\S]*?);`, "i"));
  if (!m) throw new Error(`seed insert for ${tableName} not found in 0001_schema.sql`);
  return [...m[1].matchAll(/\(\s*'([^']+)'/g)].map((x) => x[1]);
}

const codesOf = (list) => list.map((x) => x.code);

describe("the UI vocabulary matches the database vocabulary", () => {
  it.each([
    ["staff_position", () => enumValues("staff_position"), () => codesOf(STAFF_POSITIONS)],
    ["project_type", () => enumValues("project_type"), () => codesOf(TYPES)],
    ["irb_status", () => enumValues("irb_status"), () => codesOf(IRB_STATUSES)],
    ["venue_type", () => enumValues("venue_type"), () => codesOf(VENUE_TYPES)],
    ["consent_status", () => enumValues("consent_status"), () => codesOf(CONSENT)],
  ])("enum %s has exactly the codes the UI offers", (_name, fromSql, fromUi) => {
    expect([...fromUi()].sort()).toEqual([...fromSql()].sort());
  });

  it.each([
    ["work_statuses", () => lookupCodes("work_statuses"), () => codesOf(WORK_STATUSES)],
    ["submission_statuses", () => lookupCodes("submission_statuses"), () => codesOf(SUBMISSION_STATUSES)],
  ])("lookup table %s seeds exactly the codes the UI offers", (_name, fromSql, fromUi) => {
    expect([...fromUi()].sort()).toEqual([...fromSql()].sort());
  });

  it("keeps the status ORDER identical, because the UI sorts by list position", () => {
    // sortProjects ranks work status by its index in WORK_STATUSES. If the
    // SQL sort_order and the array disagree, the table sorts one way and
    // every report sorts another.
    expect(codesOf(WORK_STATUSES)).toEqual(lookupCodes("work_statuses"));
    expect(codesOf(SUBMISSION_STATUSES)).toEqual(lookupCodes("submission_statuses"));
  });

  it("has no trace of the old research_coordinator spelling", () => {
    expect(sql).not.toMatch(/research_coordinator/);
    expect(codesOf(STAFF_POSITIONS)).toContain("research_fellow");
  });
});

describe("column names the UI writes to exist in the schema", () => {
  /* Not a substitute for the database suite, which actually runs the SQL.
     This catches the cheap half — a field renamed on one side only — at
     the point where it is cheapest to notice. */
  it.each([
    "display_name", "staff_position", "permission_level", "pgy_level",
    "external_position", "employment_end_date", "merged_into",
    "title", "project_type", "work_status", "purpose", "notes",
    "next_action", "next_action_due_date", "irb_status", "academic_year",
    "archived_at", "case_number", "diagnosis", "why_unique", "attending_id",
    "year_seen", "patient_consent_obtained",
    "venue_type", "other_venue_description", "venue_name",
    "submission_status", "target_date",
  ])("schema defines %s", (column) => {
    expect(sql).toMatch(new RegExp(`\\b${column}\\b`));
  });

  it("does not still define the pre-rename column names", () => {
    for (const gone of RENAMED_AWAY) {
      expect(sql).not.toMatch(new RegExp(`\\b${gone}\\b`));
    }
  });
});

/* ---------------------------------------------------------------------
   A rename has to land in the policies, the views and the tests too.

   This exists because it did not: `audit_log.action` became `operation`
   in the schema while test/01_tests.sql still wrote `action`, and the
   only thing that caught it was the database suite failing in CI several
   minutes later. Grepping every SQL file for the names that no longer
   exist catches the same mistake in under a second, and names the file.
   --------------------------------------------------------------------- */

const RENAMED_AWAY = [
  "app_role", "person_role", "project_owners", "is_active", "owns_project",
  "research_coordinator", "last_seq", "actor_label", "entity_type", "entity_id",
  "case_id_counters", "assign_case_id",
];

const SQL_FILES = [
  "../../../supabase/migrations/0001_schema.sql",
  "../../../supabase/migrations/0002_rls.sql",
  "../../../supabase/migrations/0003_views.sql",
  "../../../test/01_tests.sql",
];

/* Why not `\b`.

   A renamed name rarely survives on its own — it survives buried in a
   longer snake_case identifier, which is exactly where `\b` cannot see
   it. `_` is a word character to a regex, so `\bassign_case_id\b` does
   NOT match `case_report_assign_case_id`, and `\bcase_id_counters\b`
   does NOT match `case_id_counters_read`. Both of those were real: a
   trigger and a policy kept the pre-rename spelling for a full day with
   this test green over the top of them.

   So the boundary here is "not a letter or digit", which treats `_` as a
   separator and finds a stale segment anywhere in an identifier. It still
   refuses to fire on a name that merely starts the same way: `last_seq`
   is followed by `u` inside `last_sequence_number`, so the correct new
   name is not reported as the old one. */
const staleRe = (name) => new RegExp(`(?<![A-Za-z0-9])${name}(?![A-Za-z0-9])`);

const sqlBody = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")
    // Comments legitimately use these words in prose — "the admin
    // merge-duplicates action" is English, not a column.
    .replace(/--.*$/gm, "");

describe("no SQL file still refers to a renamed identifier", () => {
  it.each(SQL_FILES)("%s is free of pre-rename names", (relative) => {
    const body = sqlBody(relative);
    const stale = RENAMED_AWAY.filter((name) => staleRe(name).test(body));
    expect(stale).toEqual([]);
  });

  it("catches a bare `case_id` that should now be `case_number`", () => {
    for (const relative of SQL_FILES) {
      expect(sqlBody(relative)).not.toMatch(staleRe("case_id"));
    }
  });

  /* The guard's own self-test.

     If this goes quiet, the checks above have stopped checking. Each case
     is a real line that was live in this repo, or the near miss that
     makes a laxer rule unusable. */
  it("sees a stale name buried inside a longer identifier", () => {
    expect(staleRe("assign_case_id").test("create trigger case_report_assign_case_id")).toBe(true);
    expect(staleRe("case_id_counters").test("create policy case_id_counters_read on x")).toBe(true);
    expect(staleRe("case_id").test("create trigger case_report_assign_case_id")).toBe(true);
  });

  it("does not mistake a correct name for the old one it replaced", () => {
    expect(staleRe("last_seq").test("last_sequence_number integer not null")).toBe(false);
    expect(staleRe("case_id").test("cr.case_number, cr.diagnosis")).toBe(false);
  });
});
