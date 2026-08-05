import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Download, Archive, ChevronRight, ChevronLeft, Users,
  ArrowUp, ArrowDown, ChevronsUpDown, Inbox,
} from "lucide-react";

import {
  brand, WORK_STATUSES, SUBMISSION_STATUSES, TYPES,
  ayLabel, academicYearOf, activePeople, sortedByName,
  updatePerson, nextCaseId,
} from "./lib/domain.js";
import {
  EMPTY_FILTERS, PAGE_SIZE, ARCHIVED_VIEWS, filterProjects, sortProjects, nextSort,
  paginate, stalenessLabel, nextArchivedView,
} from "./lib/projects.js";
import { downloadCsv } from "./lib/exportCsv.js";
import { Badge, inputStyle } from "./components/primitives.jsx";
import QuickCapture from "./components/QuickCapture.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import RosterPanel from "./components/RosterPanel.jsx";

/* ---------------------------------------------------------------------
   Dermatology Project Tracker — interactive prototype

   Runs entirely in memory. No backend, no persistence: refreshing resets
   it. The point is to test the flows in §7 before anyone wires up
   Supabase.

   There is no "signed in as" selector. Everyone can see and edit
   everything, which is what the department actually wants from a shared
   record of its own work; the schema's audit trail is what makes that
   safe. Authorship is a property of the project, not of whoever happens
   to be typing.

   PALETTE IS A PLACEHOLDER (§10). Swap the real values from the UMMC
   brand guide into `brand` in lib/domain.js and the whole interface
   follows.
   --------------------------------------------------------------------- */

const CURRENT_AY = academicYearOf(new Date());

/* Dropdowns are alphabetical so a name can be found by where it should be
   rather than by reading the whole list. Work status is the exception: it
   keeps the vocabulary's own order, which is the order a project actually
   moves through — Idea to Complete, with On hold and Abandoned after,
   since those are exits rather than stages. Alphabetical there would give
   "Abandoned, Analyzing, Collecting…", which means nothing. Academic
   years stay newest-first for the same reason: nobody is looking for
   2019 first. */
const sortedTypes = [...TYPES].sort((a, b) => a.label.localeCompare(b.label));
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

/* ------------------------------ sample data ------------------------------

   THE PEOPLE ARE REAL. The projects are not.

   The roster below is the actual UMMC dermatology department, used so the
   design can be judged against a realistic number of people rather than
   six invented ones — twenty-three names behave very differently from
   six in a picker, a filter and a roster.

   Every project, venue, status and authorship attached to them is
   INVENTED for design purposes. Nobody listed here has been consulted
   about, or is associated with, any project shown. The banner at the top
   of the page says so, and it must keep saying so for as long as real
   names are in this file.

   pgy_level is deliberately absent for the residents: it is a real fact
   about a real person and inventing one would be making it up. Fill it in
   from the program's own list, or leave it out.
   ------------------------------------------------------------------------ */

const seedPeople = [
  { id: "p1",  display_name: "Mark Albrecht",       staff_position: "resident" },
  { id: "p2",  display_name: "Georgia Hughey",      staff_position: "resident" },
  { id: "p3",  display_name: "Sarah Bridgeman",     staff_position: "resident" },
  { id: "p4",  display_name: "Leigh Hickham",       staff_position: "resident" },
  { id: "p5",  display_name: "Callie Cross",        staff_position: "resident" },
  { id: "p6",  display_name: "Jenna Benje",         staff_position: "resident" },
  { id: "p7",  display_name: "Cody Estev",          staff_position: "resident" },
  { id: "p8",  display_name: "Sarah Eley",          staff_position: "resident" },
  { id: "p9",  display_name: "Sarah Fillingin",     staff_position: "resident" },
  { id: "p10", display_name: "Rachel Simmons",      staff_position: "resident" },
  { id: "p11", display_name: "Summer Morrissette",  staff_position: "resident" },
  { id: "p12", display_name: "Bob Brodell",         staff_position: "attending" },
  { id: "p13", display_name: "Jeremy Jackson",      staff_position: "attending" },
  { id: "p14", display_name: "Steve Helms",         staff_position: "attending" },
  { id: "p15", display_name: "Amy Flieschel",       staff_position: "attending" },
  { id: "p16", display_name: "Chelsea Mockbee",     staff_position: "attending" },
  { id: "p17", display_name: "Allison Cruze",       staff_position: "attending" },
  { id: "p18", display_name: "Kimberly Ward",       staff_position: "attending" },
  { id: "p19", display_name: "Molly Webb",          staff_position: "attending" },
  { id: "p20", display_name: "Emily Sauce",         staff_position: "attending" },
  { id: "p21", display_name: "John Michael Joseph", staff_position: "fellow" },
  { id: "p22", display_name: "Avery Watson",        staff_position: "research_fellow" },
  { id: "p23", display_name: "Morgan Claire Belle", staff_position: "medical_student" },
].map((p) => ({ employment_end_date: null, ...p }));

/* Defaults for the fields every project has, so the list below shows only
   what makes each one different. */
const project = (o) => ({
  purpose: "",
  notes: "",
  next_action: "",
  next_action_due_date: "",
  irb_status: "not_applicable",
  academic_year: CURRENT_AY,
  archived_at: null,
  details: {},
  venues: [],
  ...o,
});

const venue = (id, venue_type, venue_name, submission_status) => ({
  id, venue_type, venue_name, submission_status,
  other_venue_description: "", target_date: "", notes: "",
});

/* Deliberately uneven. Some people carry three, several carry none, and a
   few have only archived work — that spread is the whole point of the
   roster, and a tidy one-each distribution would hide it. */
const seedProjects = [
  project({
    id: "x1",
    title: "Disseminated gonococcal rash",
    project_type: "case_report",
    work_status: "in_edit",
    authors: ["p1", "p12"],
    purpose: "Atypical sequence of findings; useful teaching case for the residency.",
    notes: "Pustular rash preceded the joint symptoms by nine days, which is backwards from the usual teaching.",
    next_action: "Return revisions to JAAD Case Reports",
    next_action_due_date: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10),
    created_at: daysAgo(120),
    updated_at: daysAgo(3),
    details: {
      case_number: `CR-${CURRENT_AY}-001`,
      diagnosis: "Disseminated gonococcal infection",
      why_unique: "Cutaneous findings preceded arthritis by over a week.",
      attending_id: "p12",
      year_seen: CURRENT_AY,
      patient_consent_obtained: "yes",
    },
    venues: [
      venue("v1", "poster", "Mississippi Dermatology Society Annual", "accepted"),
      venue("v2", "journal", "JAAD Case Reports", "revisions_requested"),
    ],
  }),
  project({
    id: "x2",
    title: "Reducing no-shows in resident continuity clinic",
    project_type: "qa_qi",
    work_status: "collecting_data",
    authors: ["p2", "p22"],
    purpose: "No-shows are eating roughly a fifth of resident clinic slots.",
    notes: "Baseline pulled from the scheduling report. Two-touch reminder pilot starts next block.",
    next_action: "Pull month two of reminder data",
    next_action_due_date: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10),
    irb_status: "exempt_determination",
    created_at: daysAgo(150),
    updated_at: daysAgo(11),
    details: {
      description: "Two-touch reminder intervention in resident continuity clinic.",
      aim_statement: "Reduce the no-show rate from 22% to 15% by the end of the academic year.",
      measure: "Monthly no-show rate from the scheduling report.",
    },
    venues: [venue("v3", "internal_presentation", "Departmental QI Day", "not_yet_submitted")],
  }),
  project({
    id: "x3",
    title: "Teledermatology triage accuracy for pigmented lesions",
    project_type: "research",
    work_status: "analyzing",
    authors: ["p3", "p13"],
    purpose: "Establish whether store-and-forward triage is safe for our referral volume.",
    notes: "Retrospective chart review, 18 months of referrals.",
    next_action: "Finish interrater agreement analysis",
    irb_status: "approved",
    created_at: daysAgo(300),
    updated_at: daysAgo(31),
    details: {
      description: "Retrospective comparison of teledermatology triage against in-person assessment.",
      study_design: "retrospective",
      data_source: "Referral records, 18-month window",
    },
    venues: [venue("v4", "conference_presentation", "AAD Annual Meeting", "submitted")],
  }),
  project({
    id: "x4",
    title: "JAK inhibitors in adolescent alopecia areata",
    project_type: "review",
    work_status: "idea",
    authors: ["p1"],
    notes: "Mentioned at journal club. Worth checking whether the adolescent population is covered anywhere.",
    created_at: daysAgo(100),
    updated_at: daysAgo(96),
    details: { description: "Scoping review of JAK inhibitor use in adolescents.", review_type: "scoping" },
  }),
  project({
    id: "x5",
    title: "Bullous pemphigoid after gliptin exposure",
    project_type: "case_report",
    work_status: "complete",
    authors: ["p4", "p12"],
    notes: "Published last spring.",
    academic_year: CURRENT_AY - 1,
    created_at: daysAgo(520),
    updated_at: daysAgo(210),
    archived_at: daysAgo(200),
    details: {
      case_number: `CR-${CURRENT_AY - 1}-004`,
      diagnosis: "Bullous pemphigoid",
      why_unique: "Onset fourteen months after starting therapy.",
      attending_id: "p12",
      year_seen: CURRENT_AY - 1,
      patient_consent_obtained: "yes",
    },
    venues: [venue("v5", "journal", "JAAD Case Reports", "presented_published")],
  }),
  project({
    id: "x6",
    title: "Nail unit melanoma referral patterns",
    project_type: "research",
    work_status: "on_hold",
    authors: ["p3", "p14"],
    purpose: "Started before the fellowship changed hands and never picked back up.",
    irb_status: "approved",
    academic_year: CURRENT_AY - 1,
    created_at: daysAgo(600),
    updated_at: daysAgo(430),
    details: { description: "Referral pattern review for nail unit melanoma.", study_design: "retrospective" },
  }),
  project({
    id: "x7",
    title: "Hidradenitis suppurativa biologic access barriers",
    project_type: "qa_qi",
    work_status: "rough_draft",
    authors: ["p5", "p16"],
    purpose: "Prior authorisation is the rate-limiting step for most of these patients.",
    next_action: "Draft the results section",
    irb_status: "exempt_determination",
    created_at: daysAgo(210),
    updated_at: daysAgo(8),
    details: {
      description: "Time-to-approval audit for biologic prior authorisations.",
      aim_statement: "Reduce median time to approval from 34 to 21 days.",
      measure: "Median days from submission to decision.",
    },
    venues: [venue("v6", "internal_presentation", "Departmental QI Day", "accepted")],
  }),
  project({
    id: "x8",
    title: "Pemphigus vulgaris presenting as isolated oral disease",
    project_type: "case_report",
    work_status: "planning",
    authors: ["p6", "p17"],
    created_at: daysAgo(45),
    updated_at: daysAgo(20),
    details: {
      case_number: `CR-${CURRENT_AY}-002`,
      diagnosis: "Pemphigus vulgaris",
      why_unique: "Nine months of oral-only disease before any cutaneous involvement.",
      attending_id: "p17",
      year_seen: CURRENT_AY,
      patient_consent_obtained: "not_yet",
    },
  }),
  project({
    id: "x9",
    title: "Dermoscopy training for primary care referrers",
    project_type: "qa_qi",
    work_status: "idea",
    authors: ["p7"],
    purpose: "Most benign referrals could be filtered upstream.",
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
    details: { description: "Short-course dermoscopy training for referring clinics." },
  }),
  project({
    id: "x10",
    title: "Cutaneous sarcoidosis mimicking granuloma annulare",
    project_type: "case_report",
    work_status: "in_edit",
    authors: ["p8", "p19"],
    created_at: daysAgo(75),
    updated_at: daysAgo(14),
    details: {
      case_number: `CR-${CURRENT_AY}-003`,
      diagnosis: "Cutaneous sarcoidosis",
      why_unique: "Clinically indistinguishable from granuloma annulare until biopsy.",
      attending_id: "p19",
      year_seen: CURRENT_AY,
      patient_consent_obtained: "yes",
    },
    venues: [venue("v7", "poster", "Mississippi Dermatology Society Annual", "submitted")],
  }),
  project({
    id: "x11",
    title: "Isotretinoin monitoring intervals and laboratory yield",
    project_type: "research",
    work_status: "collecting_data",
    authors: ["p10", "p15", "p22"],
    purpose: "Monthly labs may be more than the evidence supports.",
    irb_status: "submitted",
    created_at: daysAgo(160),
    updated_at: daysAgo(5),
    details: {
      description: "Retrospective yield of routine monitoring labs during isotretinoin therapy.",
      study_design: "retrospective",
      data_source: "Pharmacy and laboratory records",
    },
  }),
  project({
    id: "x12",
    title: "Topical steroid phobia among caregivers of children with atopic dermatitis",
    project_type: "research",
    work_status: "analyzing",
    authors: ["p11", "p18"],
    irb_status: "approved",
    created_at: daysAgo(280),
    updated_at: daysAgo(40),
    details: {
      description: "Survey of caregiver beliefs about topical corticosteroids.",
      study_design: "survey",
      data_source: "Clinic-administered questionnaire",
    },
    venues: [venue("v8", "conference_presentation", "Society for Pediatric Dermatology", "not_yet_submitted")],
  }),
  project({
    id: "x13",
    title: "Merkel cell carcinoma outcomes in a rural referral population",
    project_type: "research",
    work_status: "complete",
    authors: ["p21", "p14"],
    academic_year: CURRENT_AY - 1,
    irb_status: "approved",
    created_at: daysAgo(700),
    updated_at: daysAgo(260),
    archived_at: daysAgo(250),
    details: {
      description: "Outcome review of Merkel cell carcinoma across a rural catchment.",
      study_design: "retrospective",
      data_source: "Tumour registry",
    },
    venues: [venue("v9", "journal", "Journal of the American Academy of Dermatology", "presented_published")],
  }),
  project({
    id: "x14",
    title: "Biologic screening checklist adherence",
    project_type: "qa_qi",
    work_status: "abandoned",
    authors: ["p2"],
    notes: "Superseded by the pharmacy-led process.",
    academic_year: CURRENT_AY - 1,
    created_at: daysAgo(480),
    updated_at: daysAgo(300),
    archived_at: daysAgo(295),
    details: { description: "Audit of pre-biologic screening checklist completion." },
  }),
  project({
    id: "x15",
    title: "Scalp psoriasis treatment ladders: a narrative review",
    project_type: "review",
    work_status: "rough_draft",
    authors: ["p23", "p20"],
    created_at: daysAgo(60),
    updated_at: daysAgo(2),
    details: { description: "Narrative review of scalp psoriasis treatment sequencing.", review_type: "narrative" },
  }),
];

/* ---------------------------- sortable header --------------------------- */

function SortHeader({ column, children, sort, onSort }) {
  const activeCol = sort?.column === column;
  const Icon = !activeCol ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.slate }}>
      <button
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 hover:opacity-70"
        style={{ color: activeCol ? brand.navy : brand.slate }}
        aria-label={`Sort by ${children}`}
      >
        {children}
        <Icon size={12} style={{ opacity: activeCol ? 1 : 0.45 }} aria-hidden="true" />
      </button>
    </th>
  );
}

/* --------------------------------- app ---------------------------------- */

export default function ProjectTracker() {
  const [people, setPeople] = useState(seedPeople);
  const [projects, setProjects] = useState(seedProjects);
  const [openId, setOpenId] = useState(null);
  const [rosterOpen, setRosterOpen] = useState(false);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);

  const now = () => Date.now();

  /* Any change to what is being shown puts you back on page one. Landing
     on page 3 of a 1-page result is the classic pagination bug. */
  const filterKey = JSON.stringify(filters) + JSON.stringify(sort);
  useEffect(() => { setPage(1); }, [filterKey]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));

  /* The field names here are the schema's, not shorthand. Writing `role`
     and `position` left the new person with no `staff_position` at all:
     they vanished from the position filter and the attending picker, and
     their roster row showed no role. Every reader uses these two names. */
  const addPerson = (name, staffPosition, externalPosition = "") => {
    const person = {
      id: `p${Date.now()}`,
      display_name: name,
      staff_position: staffPosition,
      employment_end_date: null,
      ...(externalPosition ? { external_position: externalPosition } : {}),
    };
    setPeople((prev) => [...prev, person]);
    return person;
  };

  const savePerson = (id, patch) => setPeople((prev) => updatePerson(prev, id, patch));

  /* `project_type` is the field every reader uses — the table badge, the
     count tiles, the type filter, the CSV, sorting. Writing `type` here
     produced a project the rest of the app could not see the type of. */
  const createProject = ({ title, project_type, authors }) => {
    const p = {
      id: `x${Date.now()}`,
      title, project_type, authors,
      work_status: "idea",
      purpose: "", notes: "", next_action: "", next_action_due_date: "",
      /* Every new project starts "Not applicable", whatever its type.
         Guessing "Not yet submitted" for the three non-case-report types
         asserted that an IRB submission is expected, which is wrong for
         most QA/QI work and for every literature review — and it did not
         match `projects.irb_status`, whose column default is
         'not_applicable'. A status nobody chose should be the one that
         claims the least. */
      irb_status: "not_applicable",
      academic_year: CURRENT_AY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null,
      details:
        project_type === "case_report"
          ? {
              case_number: nextCaseId(projects, CURRENT_AY),
              diagnosis: "", why_unique: "", attending_id: "",
              // Defaulted here, on creation, and nowhere else. Most case
              // reports are written up in the year they were seen, so
              // this is right far more often than it is wrong — and it
              // stays editable. Applying the same default on edit would
              // silently rewrite the year of every old case report
              // somebody opened.
              year_seen: new Date().getFullYear(),
              patient_consent_obtained: "not_yet",
            }
          : { description: "" },
      venues: [],
    };
    setProjects((prev) => [p, ...prev]);
    setOpenId(p.id);
  };

  const saveProject = (next) =>
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)));

  const toggleArchive = (id) =>
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, archived_at: p.archived_at ? null : new Date().toISOString() } : p))
    );

  const nameOf = (id) => people.find((p) => p.id === id)?.display_name ?? "—";

  const years = useMemo(
    () => [...new Set(projects.map((p) => p.academic_year))].sort((a, b) => b - a),
    [projects]
  );

  const matched = useMemo(
    () => sortProjects(filterProjects(projects, filters, { nameOf }), sort, nameOf),
    [projects, filters, sort, people]
  );

  const view = useMemo(() => paginate(matched, page, PAGE_SIZE), [matched, page]);

  /* The tiles count whichever set you are looking at — active or
     archived — so the number on a tile always matches the number of rows
     clicking it produces. Counting only live projects while the table
     showed the archive was a small lie the tiles told constantly. */
  const counts = useMemo(() => {
    const inScope = projects.filter((p) =>
      filters.archived === "both" ? true : Boolean(p.archived_at) === (filters.archived === "archived"));
    return {
      total: inScope.length,
      byType: TYPES.map((t) => ({ ...t, n: inScope.filter((p) => p.project_type === t.code).length })),
    };
  }, [projects, filters.archived]);

  /* A tile is a RESET, not another filter stacked on the ones already set.

     Clicking "Research" means "show me the research projects" — not "show
     me the research projects that also happen to match the author, status
     and year I narrowed to four minutes ago". Anyone three filters deep
     who clicks a tile and gets two rows has to work out which of the
     other controls is still holding things back. So the tile clears the
     search box and every dropdown, and clicking it again clears the type
     too: the way out is the control you came in through.

     `archived` is the one thing deliberately kept. The tiles count within
     the current archive scope, so resetting it here would change the
     numbers on the tiles at the moment you clicked one — the tile would
     say 6 and hand you 4. That number matching the rows is an invariant
     worth more than the consistency of clearing everything. */
  const toggleTypeTile = (code) => {
    const clearing = code === "all" || filters.type === code;
    setFilters({
      ...EMPTY_FILTERS,
      archived: filters.archived,
      type: clearing ? "all" : code,
    });
    setPage(1);
  };

  /* From the roster: show me this person's projects. Clears everything
     else so the count in the roster equals the rows you land on. */
  const showProjectsFor = (personId, archived = "both") => {
    setFilters({ ...EMPTY_FILTERS, author: personId, archived });
    setSort(null);
    setPage(1);
    setRosterOpen(false);
  };

  // The rows the filters left behind, in the order they are displayed.
  const exportCsv = () => downloadCsv(matched, people);

  const open = projects.find((p) => p.id === openId);
  const onSort = (column) => setSort((s) => nextSort(s, column));

  const venueSummary = (v) =>
    v.venue_type === "other" && v.other_venue_description ? `${v.venue_name} (${v.other_venue_description})` : v.venue_name;

  return (
    <div className="min-h-screen" style={{ background: brand.bg }}>
      <div
        className="px-4 py-1.5 text-center text-xs"
        style={{ background: brand.warnBg, color: brand.warnText, borderBottom: `1px solid ${brand.warnBorder}` }}
      >
        <strong>Design prototype.</strong> Everything shown is sample data for design
        purposes. Nothing is saved, and no patient information appears here.
      </div>

      <header style={{ background: brand.navy }}>
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-white font-semibold tracking-tight text-base sm:text-lg">
              Dermatology Project Tracker
            </h1>
            <p className="text-xs" style={{ color: "#9DB2CC" }}>
              Academic year {ayLabel(CURRENT_AY)}
            </p>
          </div>
          <button
            onClick={() => setRosterOpen(true)}
            className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5"
            style={{ background: "#153356", color: "#fff", border: "1px solid #26456B" }}
          >
            <Users size={13} /> Roster
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
          {[
            { code: "all", k: ARCHIVED_VIEWS.find((v) => v.code === filters.archived)?.label ?? "Active", v: counts.total },
            ...counts.byType
              .slice()
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((t) => ({ code: t.code, k: t.label, v: t.n })),
          ].map((c) => {
            const selected = c.code === "all" ? filters.type === "all" : filters.type === c.code;
            return (
              <button
                key={c.code}
                onClick={() => toggleTypeTile(c.code)}
                aria-pressed={selected}
                className="text-left rounded-lg px-3 py-2.5 transition-colors hover:brightness-[0.98]"
                style={selected
                  ? { background: "#E8EDF4", border: `1px solid ${brand.navy}` }
                  : { background: brand.surface, border: `1px solid ${brand.border}` }}
              >
                <div className="text-xl font-semibold tabular-nums" style={{ color: brand.navy }}>{c.v}</div>
                <div className="text-xs" style={{ color: brand.slate }}>{c.k}</div>
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          <QuickCapture people={people} onCreate={createProject} onAddPerson={addPerson} now={now} />
        </div>

        <div className="rounded-lg p-3 mb-4" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
          <div className="relative mb-2.5">
            <Search size={15} className="absolute left-3 top-2.5" style={{ color: brand.slate }} aria-hidden="true" />
            <input
              value={filters.q}
              onChange={(e) => setFilter({ q: e.target.value })}
              placeholder="Search titles, purpose, notes, diagnoses and case IDs"
              className="w-full rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:ring-2"
              style={inputStyle}
              aria-label="Search projects"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} aria-label="Filter by type">
              <option value="all">All types</option>
              {sortedTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} aria-label="Filter by work status">
              <option value="all">Any status</option>
              {WORK_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <select value={filters.author} onChange={(e) => setFilter({ author: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} aria-label="Filter by author">
              <option value="all">Any author</option>
              {sortedByName(activePeople(people, now())).map((p) => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
            <select value={filters.year} onChange={(e) => setFilter({ year: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} aria-label="Filter by academic year">
              <option value="all">All years</option>
              {years.map((y) => <option key={y} value={String(y)}>{ayLabel(y)}</option>)}
            </select>

            {/* Three states rather than two, so "everything this person
                has ever done" is reachable. */}
            <button
              onClick={() => setFilter({ archived: nextArchivedView(filters.archived) })}
              aria-label={`Showing ${filters.archived} projects — click to change`}
              className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              style={filters.archived === "active" ? inputStyle : { background: brand.navy, color: "#fff" }}
            >
              <Archive size={12} />
              {ARCHIVED_VIEWS.find((v) => v.code === filters.archived)?.label ?? "Active"}
            </button>

            <div className="ml-auto flex items-center gap-2">
              {JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) && (
                <button
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="rounded-md px-2.5 py-1.5 text-xs"
                  style={inputStyle}
                >
                  Clear filters
                </button>
              )}
              <button onClick={exportCsv} className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5" style={inputStyle}>
                <Download size={12} /> Export CSV
              </button>
            </div>
          </div>
        </div>

        {matched.length === 0 ? (
          <div className="rounded-lg py-16 text-center" style={{ background: brand.surface, border: `1px dashed ${brand.border}` }}>
            <Inbox size={28} className="mx-auto mb-3" style={{ color: brand.border }} aria-hidden="true" />
            <p className="text-sm" style={{ color: brand.slate }}>
              {filters.archived === "archived" && matched.length === 0 && filters.q === ""
                ? "Nothing archived yet."
                : "No projects match these filters."}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg overflow-hidden" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: brand.bg, borderBottom: `1px solid ${brand.border}` }}>
                    <SortHeader column="title" sort={sort} onSort={onSort}>Project</SortHeader>
                    <SortHeader column="type" sort={sort} onSort={onSort}>Type</SortHeader>
                    <SortHeader column="status" sort={sort} onSort={onSort}>Status</SortHeader>
                    <SortHeader column="authors" sort={sort} onSort={onSort}>Authors</SortHeader>
                    <SortHeader column="venues" sort={sort} onSort={onSort}>Venues</SortHeader>
                    <SortHeader column="updated" sort={sort} onSort={onSort}>Updated</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setOpenId(p.id)}
                      className="cursor-pointer hover:bg-gray-50"
                      style={{ borderBottom: `1px solid ${brand.border}` }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: brand.navy }}>{p.title}</div>
                        {p.details?.case_number && (
                          <div className="text-xs font-mono mt-0.5" style={{ color: brand.slate }}>{p.details.case_number}</div>
                        )}
                        {p.next_action && (
                          <div className="text-xs mt-0.5" style={{ color: brand.slate }}>Next: {p.next_action}</div>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge list={TYPES} code={p.project_type} small /></td>
                      <td className="px-4 py-3"><Badge list={WORK_STATUSES} code={p.work_status} small /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: brand.slate }}>
                        {p.authors.map(nameOf).join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        {p.venues.length === 0 ? (
                          <span className="text-xs" style={{ color: brand.slate }}>—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {p.venues.map((v) => (
                              <span key={v.id} className="text-xs" style={{ color: brand.slate }}>
                                {venueSummary(v)} · <Badge list={SUBMISSION_STATUSES} code={v.submission_status} small />
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: brand.slate }}>
                        {stalenessLabel(p, now())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden flex flex-col gap-2.5">
              {view.rows.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpenId(p.id)}
                  className="text-left rounded-lg p-3.5"
                  style={{ background: brand.surface, border: `1px solid ${brand.border}` }}
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="font-medium leading-snug" style={{ color: brand.navy }}>{p.title}</span>
                    <ChevronRight size={16} className="shrink-0 mt-0.5" style={{ color: brand.border }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <Badge list={TYPES} code={p.project_type} small />
                    <Badge list={WORK_STATUSES} code={p.work_status} small />
                  </div>
                  <div className="text-xs" style={{ color: brand.slate }}>
                    {p.authors.map(nameOf).join(", ")} · updated {stalenessLabel(p, now())}
                  </div>
                  {p.venues.length > 0 && (
                    <div className="text-xs mt-1.5" style={{ color: brand.slate }}>
                      {p.venues.map(venueSummary).join(" · ")}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Pagination. Filters run over everything, not just this page. */}
            <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
              <span className="text-xs" style={{ color: brand.slate }}>
                Showing {view.from}–{view.to} of {view.total}
              </span>
              {view.pages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((n) => n - 1)}
                    disabled={view.page === 1}
                    className="rounded-md px-2 py-1.5 text-xs inline-flex items-center gap-1 disabled:opacity-40"
                    style={inputStyle}
                  >
                    <ChevronLeft size={13} /> Previous
                  </button>
                  <span className="text-xs px-2 tabular-nums" style={{ color: brand.slate }}>
                    Page {view.page} of {view.pages}
                  </span>
                  <button
                    onClick={() => setPage((n) => n + 1)}
                    disabled={view.page === view.pages}
                    className="rounded-md px-2 py-1.5 text-xs inline-flex items-center gap-1 disabled:opacity-40"
                    style={inputStyle}
                  >
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        <p className="text-xs mt-6 leading-relaxed" style={{ color: brand.slate }}>
          Prototype. Data lives in memory only and resets on reload; every project shown is
          sample data for design purposes. Contains no protected health information: case
          reports carry a system-generated case number, and the mapping to a patient stays
          in the EMR.
        </p>
      </main>

      {open && (
        <DetailPanel
          project={open}
          people={people}
          projects={projects}
          onSave={saveProject}
          onClose={() => setOpenId(null)}
          onAddPerson={addPerson}
          onArchive={(id) => { toggleArchive(id); setOpenId(null); }}
          now={now}
        />
      )}

      {rosterOpen && (
        <RosterPanel
          people={people}
          projects={projects}
          onSavePerson={savePerson}
          onAddPerson={addPerson}
          onShowProjects={showProjectsFor}
          onClose={() => setRosterOpen(false)}
          now={now()}
        />
      )}
    </div>
  );
}
