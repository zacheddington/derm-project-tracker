import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Download, Archive, ChevronRight, ChevronLeft, AlertTriangle, Users,
  ArrowUp, ArrowDown, ChevronsUpDown, Inbox, X, Clock,
} from "lucide-react";

import {
  brand, WORK_STATUSES, SUBMISSION_STATUSES, TYPES, IRB_STATUSES, CONSENT,
  STAFF_POSITIONS, VENUE_TYPES, label, ayLabel, academicYearOf, activePeople,
  updatePerson, nextCaseId,
} from "./lib/domain.js";
import {
  EMPTY_FILTERS, PAGE_SIZE, filterProjects, sortProjects, nextSort, paginate,
  stalenessCounts, stalenessLabel, nextStaleFilter,
} from "./lib/projects.js";
import { Badge } from "./components/primitives.jsx";
import { inputStyle } from "./components/primitives.jsx";
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
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

const seedPeople = [
  { id: "p1", display_name: "Rae LeBlanc", staff_position: "resident", pgy_level: 2, employment_end_date: null },
  { id: "p2", display_name: "Tomi Okafor", staff_position: "resident", pgy_level: 3, employment_end_date: null },
  { id: "p3", display_name: "Priya Raman", staff_position: "attending", employment_end_date: null },
  { id: "p4", display_name: "Dana Reyes", staff_position: "research_fellow", employment_end_date: null },
  { id: "p5", display_name: "Marcus Hale", staff_position: "resident", pgy_level: 4, employment_end_date: null },
  { id: "p6", display_name: "Ellen Voss", staff_position: "resident", pgy_level: 1, employment_end_date: "2025-06-30" },
  { id: "p7", display_name: "Sofia Marchetti", staff_position: "attending", employment_end_date: null },
  {
    id: "p8", display_name: "Ben Iwu", staff_position: "external_collaborator",
    external_position: "Dermatopathologist, Baptist Health", employment_end_date: null,
  },
];

const seedProjects = [
  {
    id: "x1",
    title: "Disseminated gonococcal rash",
    project_type: "case_report",
    work_status: "in_edit",
    authors: ["p1", "p3"],
    purpose: "Atypical sequence of findings; useful teaching case for the residency.",
    notes:
      "Pustular rash preceded the joint symptoms by nine days, which is backwards from the usual teaching.\n\nImmunofluorescence images are on the shared drive. Priya has the original clinical photos.",
    next_action: "Return revisions to JAAD Case Reports",
    next_action_due_date: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10),
    irb_status: "not_applicable",
    academic_year: CURRENT_AY,
    updated_at: daysAgo(3),
    archived_at: null,
    details: {
      case_number: `CR-${CURRENT_AY}-001`,
      diagnosis: "Disseminated gonococcal infection",
      why_unique: "Cutaneous findings preceded arthritis by over a week.",
      attending_id: "p3",
      year_seen: CURRENT_AY,
      patient_consent_obtained: "yes",
    },
    venues: [
      { id: "v1", venue_type: "poster", venue_name: "Mississippi Dermatology Society Annual", other_venue_description: "", submission_status: "accepted", target_date: "", notes: "" },
      { id: "v2", venue_type: "journal", venue_name: "JAAD Case Reports", other_venue_description: "", submission_status: "revisions_requested", target_date: "", notes: "Reviewer 2 wants a wider differential." },
    ],
  },
  {
    id: "x2",
    title: "Reducing no-shows in resident continuity clinic",
    project_type: "qa_qi",
    work_status: "collecting_data",
    authors: ["p2", "p4"],
    purpose: "No-shows are eating roughly a fifth of resident clinic slots.",
    notes: "Baseline pulled from the scheduling report. Two-touch reminder pilot starts next block.",
    next_action: "Pull month two of reminder data",
    next_action_due_date: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10),
    irb_status: "exempt_determination",
    academic_year: CURRENT_AY,
    updated_at: daysAgo(11),
    archived_at: null,
    details: {
      description: "Two-touch reminder intervention in resident continuity clinic.",
      aim_statement: "Reduce the no-show rate from 22% to 15% by the end of the academic year.",
      measure: "Monthly no-show rate from the scheduling report.",
    },
    venues: [
      { id: "v3", venue_type: "internal_presentation", venue_name: "Departmental QI Day", other_venue_description: "", submission_status: "not_yet_submitted", target_date: "", notes: "" },
    ],
  },
  {
    id: "x3",
    title: "Teledermatology triage accuracy for pigmented lesions",
    project_type: "research",
    work_status: "analyzing",
    authors: ["p5"],
    purpose: "Establish whether store-and-forward triage is safe for our referral volume.",
    notes: "Retrospective chart review, 18 months of referrals. Stats support from Dana.",
    next_action: "Finish interrater agreement analysis",
    next_action_due_date: "",
    irb_status: "approved",
    academic_year: CURRENT_AY,
    updated_at: daysAgo(31),
    archived_at: null,
    details: {
      description: "Retrospective comparison of teledermatology triage against in-person assessment.",
      study_design: "retrospective",
      data_source: "Referral records, 18-month window",
    },
    venues: [
      { id: "v4", venue_type: "conference_presentation", venue_name: "AAD Annual Meeting", other_venue_description: "", submission_status: "submitted", target_date: "", notes: "" },
    ],
  },
  {
    id: "x4",
    title: "JAK inhibitors in adolescent alopecia areata",
    project_type: "review",
    work_status: "idea",
    authors: ["p1"],
    purpose: "",
    notes: "Mentioned at journal club. Worth checking whether anyone has covered the adolescent population specifically.",
    next_action: "",
    next_action_due_date: "",
    irb_status: "not_applicable",
    academic_year: CURRENT_AY,
    updated_at: daysAgo(96),
    archived_at: null,
    details: { description: "Scoping review of JAK inhibitor use in adolescents.", review_type: "scoping", research_question: "" },
    venues: [],
  },
  {
    id: "x5",
    title: "Bullous pemphigoid after gliptin exposure",
    project_type: "case_report",
    work_status: "complete",
    authors: ["p2", "p3"],
    purpose: "",
    notes: "Published last spring.",
    next_action: "",
    next_action_due_date: "",
    irb_status: "not_applicable",
    academic_year: CURRENT_AY - 1,
    updated_at: daysAgo(210),
    archived_at: null,
    details: {
      case_number: `CR-${CURRENT_AY - 1}-004`,
      diagnosis: "Bullous pemphigoid",
      why_unique: "Onset fourteen months after starting therapy.",
      attending_id: "p3",
      year_seen: CURRENT_AY - 1,
      patient_consent_obtained: "yes",
    },
    venues: [
      { id: "v5", venue_type: "journal", venue_name: "JAAD Case Reports", other_venue_description: "", submission_status: "presented_published", target_date: "", notes: "" },
    ],
  },
  /* Deliberately ancient, so the red banner has something to point at. */
  {
    id: "x6",
    title: "Nail unit melanoma referral patterns",
    project_type: "research",
    work_status: "on_hold",
    authors: ["p5", "p8"],
    purpose: "Started before the fellowship changed hands and never picked back up.",
    notes: "Data pull exists. Nobody has looked at it since.",
    next_action: "",
    next_action_due_date: "",
    irb_status: "approved",
    academic_year: CURRENT_AY - 1,
    updated_at: daysAgo(430),
    archived_at: null,
    details: { description: "Referral pattern review for nail unit melanoma.", study_design: "retrospective", data_source: "Referral log" },
    venues: [],
  },
];

/* ------------------------------ the banners ----------------------------- */

function StalenessBanner({ tone, count, noun, dismissLabel, active, onToggle, onDismiss }) {
  const edge = tone === "danger" ? brand.alertBorder : brand.warnBorder;
  const palette = tone === "danger"
    ? { background: brand.alertBg, border: `1px solid ${brand.alertBorder}`, color: brand.alertText }
    : { background: brand.warnBg, border: `1px solid ${brand.warnBorder}`, color: brand.warnText };

  return (
    <div
      className="rounded-lg mb-3 flex items-stretch overflow-hidden"
      style={{ ...palette, ...(active ? { boxShadow: `inset 0 0 0 1px ${edge}`, filter: "brightness(0.985)" } : {}) }}
    >
      <button
        onClick={onToggle}
        aria-pressed={active}
        className="flex-1 text-left px-3.5 py-2.5 text-sm flex items-center gap-2 hover:brightness-[0.97]"
      >
        {tone === "danger"
          ? <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
          : <Clock size={15} className="shrink-0" aria-hidden="true" />}
        <span>
          {count} project{count === 1 ? " has" : "s have"} not been touched in over {noun}.
          {/* The same control both applies and clears the filter. Sending
              someone to the dropdown to undo what this button did is a
              small maze with the exit hidden. */}
          <span className="opacity-70">
            {active
              ? " Showing them now — click again to clear."
              : ` Click to see ${count === 1 ? "it" : "them"}.`}
          </span>
        </span>
      </button>
      <button
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="px-3 hover:brightness-[0.94]"
        style={{ borderLeft: `1px solid ${edge}` }}
      >
        <X size={15} />
      </button>
    </div>
  );
}

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
  const [dismissed, setDismissed] = useState({ stale: false, ancient: false });

  const now = () => Date.now();

  /* Any change to what is being shown puts you back on page one. Landing
     on page 3 of a 1-page result is the classic pagination bug. */
  const filterKey = JSON.stringify(filters) + JSON.stringify(sort);
  useEffect(() => { setPage(1); }, [filterKey]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const addPerson = (name, role, position = "") => {
    const person = {
      id: `p${Date.now()}`,
      display_name: name,
      role,
      employment_end_date: null,
      ...(position ? { position } : {}),
    };
    setPeople((prev) => [...prev, person]);
    return person;
  };

  const savePerson = (id, patch) => setPeople((prev) => updatePerson(prev, id, patch));

  const createProject = ({ title, type, authors }) => {
    const p = {
      id: `x${Date.now()}`,
      title, type, authors,
      work_status: "idea",
      purpose: "", notes: "", next_action: "", next_action_due_date: "",
      irb_status: type === "case_report" ? "not_applicable" : "not_yet_submitted",
      academic_year: CURRENT_AY,
      updated_at: new Date().toISOString(),
      archived_at: null,
      details:
        type === "case_report"
          ? {
              case_number: nextCaseId(projects, CURRENT_AY),
              diagnosis: "", why_unique: "", attending_id: "", year_seen: "",
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
    () => sortProjects(filterProjects(projects, filters, now()), sort, nameOf),
    [projects, filters, sort, people]
  );

  const view = useMemo(() => paginate(matched, page, PAGE_SIZE), [matched, page]);

  const counts = useMemo(() => {
    const live = projects.filter((p) => !p.archived_at);
    return {
      total: live.length,
      byType: TYPES.map((t) => ({ ...t, n: live.filter((p) => p.project_type === t.code).length })),
    };
  }, [projects]);

  const stale = useMemo(() => stalenessCounts(projects, now()), [projects]);

  /* Applying clears every other filter, so the number on the banner is
     exactly the number of rows you land on — a banner that says "3" and
     shows 1 because a type filter was still set is worse than no banner.

     Clicking the same banner again takes the filter back off. Clicking
     the other one switches to it. */
  const toggleStaleFilter = (kind) => {
    const next = nextStaleFilter(filters.stale, kind);
    setFilters(next === "all" ? { ...filters, stale: "all" } : { ...EMPTY_FILTERS, stale: next });
    setPage(1);
  };

  const exportCsv = () => {
    const cols = [
      "title", "type", "work_status", "academic_year", "authors", "resident_authors",
      "case_number", "diagnosis", "why_unique", "year_seen", "consent", "attending",
      "description", "irb_status", "purpose", "venues", "next_action",
      "next_action_due_date", "updated_at", "archived",
    ];
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const venueLabel = (v) =>
      v.venue_type === "other" && v.other_venue_description
        ? `${v.venue_name} [${v.other_venue_description}]`
        : v.venue_name;
    const rows = projects.map((p) => [
      p.title,
      label(TYPES, p.project_type),
      label(WORK_STATUSES, p.work_status),
      ayLabel(p.academic_year),
      p.authors.map(nameOf).join("; "),
      p.authors.filter((o) => people.find((x) => x.id === o)?.staff_position === "resident").map(nameOf).join("; "),
      p.details?.case_number || "",
      p.details?.diagnosis || "",
      p.details?.why_unique || "",
      p.details?.year_seen || "",
      p.details?.patient_consent_obtained ? label(CONSENT, p.details.patient_consent_obtained) : "",
      p.details?.attending_id ? nameOf(p.details.attending_id) : "",
      p.details?.description || "",
      label(IRB_STATUSES, p.irb_status),
      p.purpose,
      p.venues.map((v) => `${venueLabel(v)} (${label(SUBMISSION_STATUSES, v.submission_status)})`).join("; "),
      p.next_action,
      p.next_action_due_date,
      p.updated_at.slice(0, 10),
      p.archived_at ? "yes" : "no",
    ]);
    const csv = [cols.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `derm-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectStyle = { border: `1px solid ${brand.border}`, background: brand.surface, color: brand.navy };
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
        Design prototype — sample data only. Nothing is saved, and no real patient or
        project information appears here.
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
          {[{ k: "Active", v: counts.total }, ...counts.byType.map((t) => ({ k: t.label, v: t.n }))].map((c) => (
            <div key={c.k} className="rounded-lg px-3 py-2.5" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
              <div className="text-xl font-semibold tabular-nums" style={{ color: brand.navy }}>{c.v}</div>
              <div className="text-xs" style={{ color: brand.slate }}>{c.k}</div>
            </div>
          ))}
        </div>

        {!filters.archived && stale.ancient > 0 && !dismissed.ancient && (
          <StalenessBanner
            tone="danger"
            count={stale.ancient}
            noun="a year"
            dismissLabel="Dismiss the over-a-year notice"
            active={filters.stale === "ancient"}
            onToggle={() => toggleStaleFilter("ancient")}
            onDismiss={() => setDismissed((d) => ({ ...d, ancient: true }))}
          />
        )}
        {!filters.archived && stale.stale > 0 && !dismissed.stale && (
          <StalenessBanner
            tone="warn"
            count={stale.stale}
            noun="three months"
            dismissLabel="Dismiss the three-month notice"
            active={filters.stale === "stale"}
            onToggle={() => toggleStaleFilter("stale")}
            onDismiss={() => setDismissed((d) => ({ ...d, stale: true }))}
          />
        )}

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
            <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by type">
              <option value="all">All types</option>
              {TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by work status">
              <option value="all">Any status</option>
              {WORK_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <select value={filters.author} onChange={(e) => setFilter({ author: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by author">
              <option value="all">Any author</option>
              {activePeople(people, now()).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <select value={filters.year} onChange={(e) => setFilter({ year: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by academic year">
              <option value="all">All years</option>
              {years.map((y) => <option key={y} value={String(y)}>{ayLabel(y)}</option>)}
            </select>
            <select value={filters.stale} onChange={(e) => setFilter({ stale: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by how long since the last update">
              <option value="all">Any age</option>
              <option value="stale">Untouched 3+ months</option>
              <option value="ancient">Untouched 1+ year</option>
            </select>

            <button
              onClick={() => setFilter({ archived: !filters.archived })}
              className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              style={filters.archived ? { background: brand.navy, color: "#fff" } : selectStyle}
            >
              <Archive size={12} /> Archived
            </button>

            <div className="ml-auto flex items-center gap-2">
              {JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) && (
                <button
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="rounded-md px-2.5 py-1.5 text-xs"
                  style={selectStyle}
                >
                  Clear filters
                </button>
              )}
              <button onClick={exportCsv} className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5" style={selectStyle}>
                <Download size={12} /> Export CSV
              </button>
            </div>
          </div>
        </div>

        {matched.length === 0 ? (
          <div className="rounded-lg py-16 text-center" style={{ background: brand.surface, border: `1px dashed ${brand.border}` }}>
            <Inbox size={28} className="mx-auto mb-3" style={{ color: brand.border }} aria-hidden="true" />
            <p className="text-sm" style={{ color: brand.slate }}>
              {filters.archived ? "Nothing archived yet." : "No projects match these filters."}
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
                    style={selectStyle}
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
                    style={selectStyle}
                  >
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        <p className="text-xs mt-6 leading-relaxed" style={{ color: brand.slate }}>
          Prototype. Data lives in memory only and resets on reload. Contains no protected health
          information: case reports carry a system-generated case ID, and the mapping to a patient
          stays in the EMR.
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
          onClose={() => setRosterOpen(false)}
          now={now()}
        />
      )}
    </div>
  );
}
