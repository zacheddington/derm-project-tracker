import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search, Plus, X, Download, Archive, ChevronRight, ChevronDown,
  AlertTriangle, Users, ArrowUpDown, Check, Inbox
} from "lucide-react";

/* ---------------------------------------------------------------------
   Dermatology Project Tracker — interactive prototype

   Runs entirely in memory. No backend, no persistence: refreshing resets
   it. The point is to test the flows in §7 — above all the 30-second
   capture — before anyone wires up Supabase.

   PALETTE IS A PLACEHOLDER (§10). Swap the real values from the UMMC
   brand guide into `brand` below and the whole interface follows.
   --------------------------------------------------------------------- */

const brand = {
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
};

const WORK_STATUSES = [
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

const SUBMISSION_STATUSES = [
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

const TYPES = [
  { code: "case_report", label: "Case report" },
  { code: "qa_qi", label: "QA/QI" },
  { code: "research", label: "Research" },
  { code: "review", label: "Review" },
];

const VENUE_TYPES = [
  { code: "conference_presentation", label: "Conference presentation" },
  { code: "poster", label: "Poster" },
  { code: "journal", label: "Journal" },
  { code: "internal_presentation", label: "Internal presentation" },
  { code: "other", label: "Other" },
];

const IRB_STATUSES = [
  { code: "not_applicable", label: "Not applicable" },
  { code: "not_yet_submitted", label: "Not yet submitted" },
  { code: "submitted", label: "Submitted" },
  { code: "approved", label: "Approved" },
  { code: "exempt_determination", label: "Exempt determination" },
];

const CONSENT = [
  { code: "yes", label: "Yes" },
  { code: "no", label: "No" },
  { code: "not_yet", label: "Not yet" },
  { code: "not_applicable", label: "Not applicable" },
];

const PERSON_ROLES = [
  { code: "resident", label: "Resident" },
  { code: "fellow", label: "Fellow" },
  { code: "attending", label: "Attending" },
  { code: "medical_student", label: "Medical student" },
  { code: "research_coordinator", label: "Research coordinator" },
  { code: "external_collaborator", label: "External collaborator" },
];

const label = (list, code) => list.find((x) => x.code === code)?.label ?? code;
const toneOf = (list, code) => list.find((x) => x.code === code)?.tone ?? "neutral";

/* July 1 – June 30. 2026 means AY 2026–2027. */
const academicYearOf = (d) =>
  d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
const ayLabel = (y) => `${y}–${y + 1}`;

const CURRENT_AY = academicYearOf(new Date());

/* ------------------------------ seed data ------------------------------ */

const seedPeople = [
  { id: "p1", display_name: "Rae LeBlanc", role: "resident", pgy_level: 2, is_active: true },
  { id: "p2", display_name: "Tomi Okafor", role: "resident", pgy_level: 3, is_active: true },
  { id: "p3", display_name: "Priya Raman", role: "attending", is_active: true },
  { id: "p4", display_name: "Dana Reyes", role: "research_coordinator", is_active: true },
  { id: "p5", display_name: "Marcus Hale", role: "resident", pgy_level: 4, is_active: true },
  { id: "p6", display_name: "Ellen Voss", role: "resident", pgy_level: 1, is_active: false },
];

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

const seedProjects = [
  {
    id: "x1",
    title: "Disseminated gonococcal rash",
    type: "case_report",
    work_status: "in_edit",
    owners: ["p1", "p3"],
    purpose: "Atypical sequence of findings; useful teaching case for the residency.",
    notes:
      "Pustular rash preceded the joint symptoms by nine days, which is backwards from the usual teaching.\n\nImmunofluorescence images are on the shared drive. Priya has the original clinical photos.",
    next_action: "Return revisions to JAAD Case Reports",
    next_action_due: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10),
    irb_status: "not_applicable",
    academic_year: CURRENT_AY,
    updated_at: daysAgo(3),
    archived_at: null,
    details: {
      case_id: `CR-${CURRENT_AY}-001`,
      diagnosis: "Disseminated gonococcal infection",
      why_unique: "Cutaneous findings preceded arthritis by over a week.",
      attending_id: "p3",
      year_seen: CURRENT_AY,
      patient_consent_obtained: "yes",
    },
    venues: [
      { id: "v1", venue_type: "poster", venue_name: "Mississippi Dermatology Society Annual", submission_status: "accepted", target_date: "", notes: "" },
      { id: "v2", venue_type: "journal", venue_name: "JAAD Case Reports", submission_status: "revisions_requested", target_date: "", notes: "Reviewer 2 wants a wider differential." },
    ],
  },
  {
    id: "x2",
    title: "Reducing no-shows in resident continuity clinic",
    type: "qa_qi",
    work_status: "collecting_data",
    owners: ["p2", "p4"],
    purpose: "No-shows are eating roughly a fifth of resident clinic slots.",
    notes: "Baseline pulled from the scheduling report. Two-touch reminder pilot starts next block.",
    next_action: "Pull month two of reminder data",
    next_action_due: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10),
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
      { id: "v3", venue_type: "internal_presentation", venue_name: "Departmental QI Day", submission_status: "not_yet_submitted", target_date: "", notes: "" },
    ],
  },
  {
    id: "x3",
    title: "Teledermatology triage accuracy for pigmented lesions",
    type: "research",
    work_status: "analyzing",
    owners: ["p5"],
    purpose: "Establish whether store-and-forward triage is safe for our referral volume.",
    notes: "Retrospective chart review, 18 months of referrals. Stats support from Dana.",
    next_action: "Finish interrater agreement analysis",
    next_action_due: "",
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
      { id: "v4", venue_type: "conference_presentation", venue_name: "AAD Annual Meeting", submission_status: "submitted", target_date: "", notes: "" },
    ],
  },
  {
    id: "x4",
    title: "JAK inhibitors in adolescent alopecia areata",
    type: "review",
    work_status: "idea",
    owners: ["p1"],
    purpose: "",
    notes: "Mentioned at journal club. Worth checking whether anyone has covered the adolescent population specifically.",
    next_action: "",
    next_action_due: "",
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
    type: "case_report",
    work_status: "complete",
    owners: ["p2", "p3"],
    purpose: "",
    notes: "Published last spring.",
    next_action: "",
    next_action_due: "",
    irb_status: "not_applicable",
    academic_year: CURRENT_AY - 1,
    updated_at: daysAgo(210),
    archived_at: null,
    details: {
      case_id: `CR-${CURRENT_AY - 1}-004`,
      diagnosis: "Bullous pemphigoid",
      why_unique: "Onset fourteen months after starting therapy.",
      attending_id: "p3",
      year_seen: CURRENT_AY - 1,
      patient_consent_obtained: "yes",
    },
    venues: [
      { id: "v5", venue_type: "journal", venue_name: "JAAD Case Reports", submission_status: "presented_published", target_date: "", notes: "" },
    ],
  },
];

/* ------------------------- identifier tripwire ------------------------- */
/* Client-side only, advisory only. Never blocks a save — it just asks. */

const IDENTIFIER_PATTERNS = [
  { re: /\b\d{6,12}\b/, note: "a long number that could be an MRN" },
  { re: /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/, note: "a full date, which may be a date of service" },
  { re: /\bMRN\b/i, note: "the letters MRN" },
  { re: /\b\d{3}-\d{2}-\d{4}\b/, note: "a social security number pattern" },
];

function scanForIdentifiers(text) {
  if (!text) return null;
  for (const p of IDENTIFIER_PATTERNS) if (p.re.test(text)) return p.note;
  return null;
}

/* ------------------------------ primitives ----------------------------- */

function Badge({ list, code, small }) {
  const tone = toneOf(list, code);
  const styles = {
    neutral: { background: brand.neutralBg, color: brand.slate, border: `1px solid ${brand.border}` },
    active: { background: "#E8EDF4", color: brand.navy, border: `1px solid #C6D2E1` },
    done: { background: brand.accentBg, color: brand.accentText, border: `1px solid #BFD9CE` },
    muted: { background: "transparent", color: brand.slate, border: `1px dashed ${brand.border}` },
  }[tone];
  return (
    <span
      className={`inline-block rounded-full whitespace-nowrap font-medium ${small ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1"}`}
      style={styles}
    >
      {label(list, code)}
    </span>
  );
}

function Field({ label: lbl, children, hint }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-semibold tracking-wide uppercase mb-1.5" style={{ color: brand.slate }}>
        {lbl}
      </span>
      {children}
      {hint && <span className="block text-xs mt-1" style={{ color: brand.slate }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  border: `1px solid ${brand.border}`,
  background: brand.surface,
  color: brand.navy,
};

const TextInput = React.forwardRef(function TextInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={`w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ${props.className || ""}`}
      style={{ ...inputStyle, ...(props.style || {}) }}
    />
  );
});

function Select({ options, ...props }) {
  return (
    <select
      {...props}
      className="w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2"
      style={inputStyle}
    >
      {options.map((o) => (
        <option key={o.code} value={o.code}>{o.label}</option>
      ))}
    </select>
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      className="w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 leading-relaxed"
      style={inputStyle}
    />
  );
}

function Button({ variant = "primary", children, ...props }) {
  const base = "inline-flex items-center gap-1.5 rounded-md text-sm font-medium px-3.5 py-2 transition-colors focus:outline-none focus:ring-2 disabled:opacity-50";
  const styles = {
    primary: { background: brand.navy, color: "#fff" },
    secondary: { background: brand.surface, color: brand.navy, border: `1px solid ${brand.border}` },
    ghost: { background: "transparent", color: brand.slate },
  }[variant];
  return <button {...props} className={base} style={styles}>{children}</button>;
}

/* --------------------------- identifier notice -------------------------- */

function IdentifierNotice({ text }) {
  const hit = scanForIdentifiers(text);
  if (!hit) return null;
  return (
    <div
      className="flex gap-2 items-start rounded-md px-3 py-2 mt-1.5 text-xs"
      style={{ background: "#FDF6E3", border: "1px solid #E8D9A8", color: "#6B5300" }}
      role="status"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        This looks like it contains {hit}. Patient identifiers must not be stored here — use the
        case ID and keep the mapping in the EMR. You can still save; please check first.
      </span>
    </div>
  );
}

/* ----------------------------- owner picker ----------------------------- */

function OwnerPicker({ people, selected, onChange, onAddPerson }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("resident");
  const boxRef = useRef(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people
      .filter((p) => p.is_active && !selected.includes(p.id))
      .filter((p) => !t || p.display_name.toLowerCase().includes(t))
      .slice(0, 6);
  }, [q, people, selected]);

  const commitNew = () => {
    const name = newName.trim();
    if (!name) return;
    const person = onAddPerson(name, newRole);
    onChange([...selected, person.id]);
    setNewName(""); setAdding(false); setQ("");
  };

  return (
    <div ref={boxRef}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selected.map((id) => {
          const p = people.find((x) => x.id === id);
          if (!p) return null;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full text-xs px-2.5 py-1"
              style={{ background: "#E8EDF4", color: brand.navy }}
            >
              {p.display_name}
              <button
                type="button"
                disabled={selected.length === 1}
                title={selected.length === 1 ? "A project needs at least one owner" : undefined}
                onClick={() => selected.length > 1 && onChange(selected.filter((s) => s !== id))}
                aria-label={`Remove ${p.display_name}`}
                className="hover:opacity-60 disabled:opacity-30"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        {selected.length === 0 && (
          <span className="text-xs" style={{ color: brand.slate }}>No one assigned yet</span>
        )}
      </div>

      {!adding ? (
        <>
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a name…"
          />
          {q.trim() && (
            <div className="mt-1 rounded-md overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange([...selected, p.id]); setQ(""); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center"
                  style={{ color: brand.navy }}
                >
                  <span>{p.display_name}</span>
                  <span className="text-xs" style={{ color: brand.slate }}>
                    {label(PERSON_ROLES, p.role)}{p.pgy_level ? ` · PGY-${p.pgy_level}` : ""}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setNewName(q.trim()); setAdding(true); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-1.5"
                style={{ color: brand.navy, borderTop: `1px solid ${brand.border}` }}
              >
                <Plus size={13} /> Add “{q.trim()}” to the roster
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-md p-3" style={{ border: `1px solid ${brand.border}`, background: brand.bg }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            <Select options={PERSON_ROLES} value={newRole} onChange={(e) => setNewRole(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={commitNew}><Check size={14} /> Add to roster</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- quick capture ----------------------------- */
/* Success criterion #1: a new idea captured in under 30 seconds.
   Title, type, owner. Nothing else is required, ever. */

function QuickCapture({ people, currentUser, onCreate, onAddPerson }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("case_report");
  const [owners, setOwners] = useState([currentUser]);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    started.current = Date.now();
    setElapsed(0);
    titleRef.current?.focus();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [open]);

  const reset = () => { setTitle(""); setType("case_report"); setOwners([currentUser]); setOpen(false); };

  const save = () => {
    if (!title.trim() || owners.length === 0) return;
    onCreate({ title: title.trim(), type, owners });
    reset();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-lg px-4 py-3.5 text-sm flex items-center gap-2.5 transition-colors"
        style={{ background: brand.surface, border: `1px dashed ${brand.border}`, color: brand.slate }}
      >
        <Plus size={16} style={{ color: brand.navy }} />
        Jot down a new project idea…
      </button>
    );
  }

  return (
    <div className="rounded-lg p-4" style={{ background: brand.surface, border: `1px solid ${brand.navy}` }}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold" style={{ color: brand.navy }}>New project</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: elapsed > 30 ? "#8A6A00" : brand.slate }}>
            {elapsed}s
          </span>
          <button onClick={reset} aria-label="Cancel"><X size={16} style={{ color: brand.slate }} /></button>
        </div>
      </div>

      <Field label="Title">
        <TextInput
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) save(); }}
          placeholder="e.g. Disseminated gonococcal rash"
        />
        <IdentifierNotice text={title} />
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => setType(t.code)}
              className="rounded-md px-3 py-1.5 text-sm"
              style={
                type === t.code
                  ? { background: brand.navy, color: "#fff" }
                  : { background: brand.surface, color: brand.slate, border: `1px solid ${brand.border}` }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Owners">
        <OwnerPicker people={people} selected={owners} onChange={setOwners} onAddPerson={onAddPerson} />
      </Field>

      <div className="flex gap-2 items-center">
        <Button onClick={save} disabled={!title.trim() || owners.length === 0}>Save project</Button>
        <span className="text-xs" style={{ color: brand.slate }}>
          Everything else can wait. Add detail whenever you come back to it.
        </span>
      </div>
    </div>
  );
}

/* ------------------------------ detail panel ---------------------------- */

function DetailPanel({ project, people, canEdit, onChange, onClose, onArchive, onAddPerson }) {
  const [tab, setTab] = useState("overview");
  if (!project) return null;

  const set = (patch) => onChange({ ...project, ...patch, updated_at: new Date().toISOString() });
  const setDetail = (patch) => set({ details: { ...project.details, ...patch } });

  const addVenue = () =>
    set({
      venues: [
        ...project.venues,
        { id: `v${Date.now()}`, venue_type: "poster", venue_name: "", submission_status: "not_yet_submitted", target_date: "", notes: "" },
      ],
    });

  const setVenue = (id, patch) =>
    set({ venues: project.venues.map((v) => (v.id === id ? { ...v, ...patch } : v)) });

  const removeVenue = (id) => set({ venues: project.venues.filter((v) => v.id !== id) });

  const ro = !canEdit;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label={project.title}>
      <div className="absolute inset-0" style={{ background: "rgba(11,37,69,0.35)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-2xl h-full overflow-y-auto"
        style={{ background: brand.bg, borderLeft: `1px solid ${brand.border}` }}
      >
        <div
          className="sticky top-0 z-10 px-5 py-4"
          style={{ background: brand.surface, borderBottom: `1px solid ${brand.border}` }}
        >
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge list={TYPES} code={project.type} small />
                <Badge list={WORK_STATUSES} code={project.work_status} small />
                {project.details?.case_id && (
                  <span className="text-xs font-mono" style={{ color: brand.slate }}>
                    {project.details.case_id}
                  </span>
                )}
                {project.archived_at && (
                  <span className="text-xs" style={{ color: brand.slate }}>Archived</span>
                )}
              </div>
              <h2 className="text-lg font-semibold leading-snug" style={{ color: brand.navy }}>
                {project.title}
              </h2>
            </div>
            <button onClick={onClose} aria-label="Close"><X size={20} style={{ color: brand.slate }} /></button>
          </div>

          <div className="flex gap-1 mt-3 -mb-4">
            {["overview", "venues", "notes"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-2 text-sm capitalize"
                style={
                  tab === t
                    ? { color: brand.navy, borderBottom: `2px solid ${brand.navy}`, fontWeight: 600 }
                    : { color: brand.slate, borderBottom: "2px solid transparent" }
                }
              >
                {t}
                {t === "venues" && project.venues.length > 0 && (
                  <span className="ml-1.5 text-xs">{project.venues.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {!canEdit && (
            <div className="rounded-md px-3 py-2 mb-4 text-xs" style={{ background: brand.neutralBg, color: brand.slate }}>
              You are not an owner of this project, so it is read-only for you. Ask an owner or an
              admin to add you.
            </div>
          )}

          {tab === "overview" && (
            <>
              <Field label="Title">
                <TextInput value={project.title} disabled={ro} onChange={(e) => set({ title: e.target.value })} />
                <IdentifierNotice text={project.title} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Field label="Work status">
                  <Select options={WORK_STATUSES} value={project.work_status} disabled={ro}
                          onChange={(e) => set({ work_status: e.target.value })} />
                </Field>
                <Field label="IRB status">
                  <Select options={IRB_STATUSES} value={project.irb_status} disabled={ro}
                          onChange={(e) => set({ irb_status: e.target.value })} />
                </Field>
              </div>

              <Field label="Owners">
                <OwnerPicker people={people} selected={project.owners} onChange={(o) => set({ owners: o })}
                             onAddPerson={onAddPerson} />
              </Field>

              <Field label="Purpose" hint="The goal, the impact, or why this matters.">
                <TextArea rows={2} value={project.purpose} disabled={ro}
                          onChange={(e) => set({ purpose: e.target.value })} />
                <IdentifierNotice text={project.purpose} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Field label="Next action">
                  <TextInput value={project.next_action} disabled={ro}
                             onChange={(e) => set({ next_action: e.target.value })} />
                </Field>
                <Field label="Due">
                  <TextInput type="date" value={project.next_action_due} disabled={ro}
                             onChange={(e) => set({ next_action_due: e.target.value })} />
                </Field>
              </div>

              {project.type === "case_report" && (
                <div className="rounded-lg p-4 mt-2" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
                  <h3 className="text-sm font-semibold mb-1" style={{ color: brand.navy }}>Case detail</h3>
                  <p className="text-xs mb-4 leading-relaxed" style={{ color: brand.slate }}>
                    No patient identifiers here or in any free-text field: no name, MRN, date of
                    birth, or date of service. The case ID is the only patient reference this system
                    holds, and the mapping lives in the EMR.
                  </p>
                  <Field label="Diagnosis">
                    <TextInput value={project.details.diagnosis || ""} disabled={ro}
                               onChange={(e) => setDetail({ diagnosis: e.target.value })} />
                  </Field>
                  <Field label="Why it is unique">
                    <TextArea rows={2} value={project.details.why_unique || ""} disabled={ro}
                              onChange={(e) => setDetail({ why_unique: e.target.value })} />
                    <IdentifierNotice text={project.details.why_unique} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
                    <Field label="Attending">
                      <Select
                        options={[{ code: "", label: "—" }, ...people.map((p) => ({ code: p.id, label: p.display_name }))]}
                        value={project.details.attending_id || ""} disabled={ro}
                        onChange={(e) => setDetail({ attending_id: e.target.value })}
                      />
                    </Field>
                    <Field label="Year seen" hint="Year only.">
                      <TextInput type="number" min="1990" max="2100" value={project.details.year_seen || ""} disabled={ro}
                                 onChange={(e) => setDetail({ year_seen: e.target.value })} />
                    </Field>
                    <Field label="Consent">
                      <Select options={CONSENT} value={project.details.patient_consent_obtained || "not_yet"} disabled={ro}
                              onChange={(e) => setDetail({ patient_consent_obtained: e.target.value })} />
                    </Field>
                  </div>
                </div>
              )}

              {project.type !== "case_report" && (
                <div className="rounded-lg p-4 mt-2" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: brand.navy }}>
                    {label(TYPES, project.type)} detail
                  </h3>
                  <Field label="Description">
                    <TextArea rows={2} value={project.details.description || ""} disabled={ro}
                              onChange={(e) => setDetail({ description: e.target.value })} />
                  </Field>
                  {project.type === "qa_qi" && (
                    <>
                      <Field label="Aim statement">
                        <TextInput value={project.details.aim_statement || ""} disabled={ro}
                                   onChange={(e) => setDetail({ aim_statement: e.target.value })} />
                      </Field>
                      <Field label="Measure" hint="What are we measuring to know it worked?">
                        <TextInput value={project.details.measure || ""} disabled={ro}
                                   onChange={(e) => setDetail({ measure: e.target.value })} />
                      </Field>
                    </>
                  )}
                  {project.type === "research" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      <Field label="Study design">
                        <Select
                          options={[
                            { code: "survey", label: "Survey" }, { code: "retrospective", label: "Retrospective" },
                            { code: "prospective", label: "Prospective" }, { code: "cross_sectional", label: "Cross-sectional" },
                            { code: "other", label: "Other" },
                          ]}
                          value={project.details.study_design || "other"} disabled={ro}
                          onChange={(e) => setDetail({ study_design: e.target.value })}
                        />
                      </Field>
                      <Field label="Data source">
                        <TextInput value={project.details.data_source || ""} disabled={ro}
                                   onChange={(e) => setDetail({ data_source: e.target.value })} />
                      </Field>
                    </div>
                  )}
                  {project.type === "review" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      <Field label="Review type">
                        <Select
                          options={[
                            { code: "narrative", label: "Narrative" }, { code: "systematic", label: "Systematic" },
                            { code: "scoping", label: "Scoping" },
                          ]}
                          value={project.details.review_type || "narrative"} disabled={ro}
                          onChange={(e) => setDetail({ review_type: e.target.value })}
                        />
                      </Field>
                      <Field label="Research question">
                        <TextInput value={project.details.research_question || ""} disabled={ro}
                                   onChange={(e) => setDetail({ research_question: e.target.value })} />
                      </Field>
                    </div>
                  )}
                </div>
              )}

              {canEdit && (
                <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${brand.border}` }}>
                  <Button variant="secondary" onClick={() => onArchive(project.id)}>
                    <Archive size={14} />
                    {project.archived_at ? "Restore project" : "Archive project"}
                  </Button>
                  <p className="text-xs mt-2" style={{ color: brand.slate }}>
                    Archiving hides the project from default views. Nothing is deleted, and an admin
                    can restore it.
                  </p>
                </div>
              )}
            </>
          )}

          {tab === "venues" && (
            <>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: brand.slate }}>
                A project can have several destinations at once, at different stages — a poster
                already accepted while the manuscript is still in review.
              </p>
              {project.venues.map((v) => (
                <div key={v.id} className="rounded-lg p-4 mb-3" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <Badge list={SUBMISSION_STATUSES} code={v.submission_status} small />
                    {canEdit && (
                      <button onClick={() => removeVenue(v.id)} aria-label="Remove venue">
                        <X size={15} style={{ color: brand.slate }} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    <Field label="Venue">
                      <TextInput value={v.venue_name} disabled={ro} placeholder="e.g. AAD Annual Meeting"
                                 onChange={(e) => setVenue(v.id, { venue_name: e.target.value })} />
                    </Field>
                    <Field label="Kind">
                      <Select options={VENUE_TYPES} value={v.venue_type} disabled={ro}
                              onChange={(e) => setVenue(v.id, { venue_type: e.target.value })} />
                    </Field>
                    <Field label="Submission status">
                      <Select options={SUBMISSION_STATUSES} value={v.submission_status} disabled={ro}
                              onChange={(e) => setVenue(v.id, { submission_status: e.target.value })} />
                    </Field>
                    <Field label="Target date">
                      <TextInput type="date" value={v.target_date} disabled={ro}
                                 onChange={(e) => setVenue(v.id, { target_date: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <TextInput value={v.notes} disabled={ro}
                               onChange={(e) => setVenue(v.id, { notes: e.target.value })} />
                  </Field>
                </div>
              ))}
              {project.venues.length === 0 && (
                <p className="text-sm mb-3" style={{ color: brand.slate }}>
                  No venue yet. Add one when you know where this is headed.
                </p>
              )}
              {canEdit && <Button variant="secondary" onClick={addVenue}><Plus size={14} /> Add a venue</Button>}
            </>
          )}

          {tab === "notes" && (
            <>
              <Field label="Notes" hint="Markdown. This is the notepad — put anything here except patient identifiers.">
                <TextArea rows={16} value={project.notes} disabled={ro}
                          onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              <IdentifierNotice text={project.notes} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- app ---------------------------------- */

export default function ProjectTracker() {
  const [people, setPeople] = useState(seedPeople);
  const [projects, setProjects] = useState(seedProjects);
  const [currentUser, setCurrentUser] = useState("p1");
  const [openId, setOpenId] = useState(null);

  const [q, setQ] = useState("");
  const [fType, setFType] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fOwner, setFOwner] = useState("all");
  const [fYear, setFYear] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [sortBy, setSortBy] = useState("updated");

  const me = people.find((p) => p.id === currentUser);
  const isAdmin = me?.role === "research_coordinator";

  const addPerson = (name, role) => {
    const person = { id: `p${Date.now()}`, display_name: name, role, is_active: true };
    setPeople((prev) => [...prev, person]);
    return person;
  };

  const createProject = ({ title, type, owners }) => {
    const p = {
      id: `x${Date.now()}`,
      title, type, owners,
      work_status: "idea",
      purpose: "", notes: "", next_action: "", next_action_due: "",
      irb_status: type === "case_report" ? "not_applicable" : "not_yet_submitted",
      academic_year: CURRENT_AY,
      updated_at: new Date().toISOString(),
      archived_at: null,
      details:
        type === "case_report"
          ? {
              case_id: `CR-${CURRENT_AY}-${String(
                projects.filter((x) => x.type === "case_report" && x.academic_year === CURRENT_AY).length + 1
              ).padStart(3, "0")}`,
              diagnosis: "", why_unique: "", attending_id: "", year_seen: "", patient_consent_obtained: "not_yet",
            }
          : { description: "" },
      venues: [],
    };
    setProjects((prev) => [p, ...prev]);
    setOpenId(p.id);
  };

  const updateProject = (next) =>
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)));

  const toggleArchive = (id) =>
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, archived_at: p.archived_at ? null : new Date().toISOString() } : p
      )
    );

  const canEdit = (p) => p.owners.includes(currentUser) || isAdmin;

  const years = useMemo(
    () => [...new Set(projects.map((p) => p.academic_year))].sort((a, b) => b - a),
    [projects]
  );

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = projects.filter((p) => {
      if (!showArchived && p.archived_at) return false;
      if (showArchived && !p.archived_at) return false;
      if (fType !== "all" && p.type !== fType) return false;
      if (fStatus !== "all" && p.work_status !== fStatus) return false;
      if (fOwner !== "all" && !p.owners.includes(fOwner)) return false;
      if (fYear !== "all" && String(p.academic_year) !== fYear) return false;
      if (mineOnly && !p.owners.includes(currentUser)) return false;
      if (t) {
        const hay = [p.title, p.purpose, p.notes, p.details?.diagnosis]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) =>
      sortBy === "updated"
        ? new Date(b.updated_at) - new Date(a.updated_at)
        : a.title.localeCompare(b.title)
    );
    return out;
  }, [projects, q, fType, fStatus, fOwner, fYear, showArchived, mineOnly, sortBy, currentUser]);

  const counts = useMemo(() => {
    const live = projects.filter((p) => !p.archived_at);
    return {
      total: live.length,
      byType: TYPES.map((t) => ({ ...t, n: live.filter((p) => p.type === t.code).length })),
      stale: live.filter((p) => Date.now() - new Date(p.updated_at) > 90 * 864e5).length,
      mine: live.filter((p) => p.owners.includes(currentUser)).length,
    };
  }, [projects, currentUser]);

  const nameOf = (id) => people.find((p) => p.id === id)?.display_name ?? "—";

  const exportCsv = () => {
    const cols = [
      "title", "type", "work_status", "academic_year", "owners", "resident_owners",
      "case_id", "diagnosis", "why_unique", "year_seen", "consent", "attending",
      "description", "irb_status", "purpose", "venues", "next_action",
      "next_action_due", "updated_at", "archived",
    ];
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = projects.map((p) => [
      p.title,
      label(TYPES, p.type),
      label(WORK_STATUSES, p.work_status),
      ayLabel(p.academic_year),
      p.owners.map(nameOf).join("; "),
      p.owners.filter((o) => people.find((x) => x.id === o)?.role === "resident").map(nameOf).join("; "),
      p.details?.case_id || "",
      p.details?.diagnosis || "",
      p.details?.why_unique || "",
      p.details?.year_seen || "",
      p.details?.patient_consent_obtained ? label(CONSENT, p.details.patient_consent_obtained) : "",
      p.details?.attending_id ? nameOf(p.details.attending_id) : "",
      p.details?.description || "",
      label(IRB_STATUSES, p.irb_status),
      p.purpose,
      p.venues.map((v) => `${v.venue_name} (${label(SUBMISSION_STATUSES, v.submission_status)})`).join("; "),
      p.next_action,
      p.next_action_due,
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

  const staleness = (p) => {
    const d = Math.floor((Date.now() - new Date(p.updated_at)) / 864e5);
    if (d === 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 60) return `${d} days ago`;
    return `${Math.floor(d / 30)} months ago`;
  };

  return (
    <div className="min-h-screen" style={{ background: brand.bg }}>
      {/* This prototype is served publicly. Make it unmistakable to anyone
          who lands on it that the data is invented. */}
      <div
        className="px-4 py-1.5 text-center text-xs"
        style={{ background: "#FDF6E3", color: "#6B5300", borderBottom: "1px solid #E8D9A8" }}
      >
        Design prototype — sample data only. Nothing is saved, and no real patient or
        project information appears here.
      </div>

      {/* header */}
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
          <div className="flex items-center gap-2">
            {/* Prototype only: stands in for whoever signed in through SSO. */}
            <select
              value={currentUser}
              onChange={(e) => setCurrentUser(e.target.value)}
              className="rounded-md px-2.5 py-1.5 text-xs"
              style={{ background: "#153356", color: "#fff", border: "1px solid #26456B" }}
              aria-label="Signed in as (prototype only)"
            >
              {people.filter((p) => p.is_active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}{p.role === "research_coordinator" ? " (admin)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {/* counts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
          {[
            { k: "Active", v: counts.total },
            { k: "Mine", v: counts.mine },
            ...counts.byType.map((t) => ({ k: t.label, v: t.n })),
          ].map((c) => (
            <div key={c.k} className="rounded-lg px-3 py-2.5" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
              <div className="text-xl font-semibold tabular-nums" style={{ color: brand.navy }}>{c.v}</div>
              <div className="text-xs" style={{ color: brand.slate }}>{c.k}</div>
            </div>
          ))}
        </div>

        {counts.stale > 0 && !showArchived && (
          <button
            onClick={() => { setSortBy("updated"); setMineOnly(false); }}
            className="w-full text-left rounded-lg px-3.5 py-2.5 mb-4 text-sm flex items-center gap-2"
            style={{ background: "#FDF6E3", border: "1px solid #E8D9A8", color: "#6B5300" }}
          >
            <AlertTriangle size={15} aria-hidden="true" />
            {counts.stale} project{counts.stale === 1 ? " has" : "s have"} not been touched in over
            three months.
          </button>
        )}

        <div className="mb-4">
          <QuickCapture people={people} currentUser={currentUser} onCreate={createProject} onAddPerson={addPerson} />
        </div>

        {/* filters */}
        <div className="rounded-lg p-3 mb-4" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
          <div className="relative mb-2.5">
            <Search size={15} className="absolute left-3 top-2.5" style={{ color: brand.slate }} aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles, purpose, notes and diagnoses"
              className="w-full rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:ring-2"
              style={inputStyle}
              aria-label="Search projects"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select value={fType} onChange={(e) => setFType(e.target.value)} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by type">
              <option value="all">All types</option>
              {TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by work status">
              <option value="all">Any status</option>
              {WORK_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by owner">
              <option value="all">Anyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <select value={fYear} onChange={(e) => setFYear(e.target.value)} className="rounded-md px-2.5 py-1.5 text-xs" style={selectStyle} aria-label="Filter by academic year">
              <option value="all">All years</option>
              {years.map((y) => <option key={y} value={String(y)}>{ayLabel(y)}</option>)}
            </select>

            <button
              onClick={() => setMineOnly((v) => !v)}
              className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              style={mineOnly ? { background: brand.navy, color: "#fff" } : selectStyle}
            >
              <Users size={12} /> My projects
            </button>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              style={showArchived ? { background: brand.navy, color: "#fff" } : selectStyle}
            >
              <Archive size={12} /> Archived
            </button>
            <button
              onClick={() => setSortBy((s) => (s === "updated" ? "title" : "updated"))}
              className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              style={selectStyle}
            >
              <ArrowUpDown size={12} /> {sortBy === "updated" ? "Last updated" : "Title"}
            </button>

            <div className="ml-auto">
              <button
                onClick={exportCsv}
                className="rounded-md px-2.5 py-1.5 text-xs inline-flex items-center gap-1.5"
                style={selectStyle}
              >
                <Download size={12} /> Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* results */}
        {visible.length === 0 ? (
          <div className="rounded-lg py-16 text-center" style={{ background: brand.surface, border: `1px dashed ${brand.border}` }}>
            <Inbox size={28} className="mx-auto mb-3" style={{ color: brand.border }} aria-hidden="true" />
            <p className="text-sm" style={{ color: brand.slate }}>
              {showArchived ? "Nothing archived yet." : "No projects match these filters."}
            </p>
          </div>
        ) : (
          <>
            {/* table on wide screens */}
            <div className="hidden md:block rounded-lg overflow-hidden" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: brand.bg, borderBottom: `1px solid ${brand.border}` }}>
                    {["Project", "Type", "Status", "Owners", "Venues", "Updated"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: brand.slate }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setOpenId(p.id)}
                      className="cursor-pointer hover:bg-gray-50"
                      style={{ borderBottom: `1px solid ${brand.border}` }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: brand.navy }}>{p.title}</div>
                        {p.details?.case_id && (
                          <div className="text-xs font-mono mt-0.5" style={{ color: brand.slate }}>{p.details.case_id}</div>
                        )}
                        {p.next_action && (
                          <div className="text-xs mt-0.5" style={{ color: brand.slate }}>Next: {p.next_action}</div>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge list={TYPES} code={p.type} small /></td>
                      <td className="px-4 py-3"><Badge list={WORK_STATUSES} code={p.work_status} small /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: brand.slate }}>
                        {p.owners.map(nameOf).join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        {p.venues.length === 0 ? (
                          <span className="text-xs" style={{ color: brand.slate }}>—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {p.venues.map((v) => (
                              <span key={v.id} className="text-xs" style={{ color: brand.slate }}>
                                {v.venue_name} · <Badge list={SUBMISSION_STATUSES} code={v.submission_status} small />
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: brand.slate }}>
                        {staleness(p)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* cards below 768px */}
            <div className="md:hidden flex flex-col gap-2.5">
              {visible.map((p) => (
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
                    <Badge list={TYPES} code={p.type} small />
                    <Badge list={WORK_STATUSES} code={p.work_status} small />
                  </div>
                  <div className="text-xs" style={{ color: brand.slate }}>
                    {p.owners.map(nameOf).join(", ")} · updated {staleness(p)}
                  </div>
                  {p.venues.length > 0 && (
                    <div className="text-xs mt-1.5" style={{ color: brand.slate }}>
                      {p.venues.map((v) => v.venue_name).join(" · ")}
                    </div>
                  )}
                </button>
              ))}
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
          canEdit={canEdit(open)}
          onChange={updateProject}
          onClose={() => setOpenId(null)}
          onAddPerson={addPerson}
          onArchive={(id) => { toggleArchive(id); setOpenId(null); }}
        />
      )}
    </div>
  );
}
