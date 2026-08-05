import React, { useState, useEffect, useMemo } from "react";
import { X, Plus, Archive, Check } from "lucide-react";
import {
  brand, TYPES, WORK_STATUSES, SUBMISSION_STATUSES, IRB_STATUSES, CONSENT,
  VENUE_TYPES, STAFF_POSITIONS, label, activePeople,
} from "../lib/domain.js";
import {
  validateProject, changeProjectType, maxYearSeen, formatDate,
  hasChanges, describeDateProblem,
} from "../lib/projects.js";
import {
  Badge, Button, DateInput, Field, Modal, Select, TextArea, TextInput,
  IdentifierNotice, UnsavedChangesDialog,
} from "./primitives.jsx";
import AuthorPicker from "./AuthorPicker.jsx";

/* ---------------------------------------------------------------------
   Project detail.

   Edits are held in a local draft and committed by Save. The previous
   version wrote every keystroke straight through, which left nowhere to
   refuse a save — and refusing to save a project with no authors is the
   entire point of being able to remove the last one.

   There is no read-only mode. Anyone may edit anything: this is a
   department's shared record of its own work, and a resident correcting
   an attending's typo is a feature. The audit trail in the schema is
   what makes that safe.
   --------------------------------------------------------------------- */

/* Field names for the date-problem messages, so an error reads "Due date
   is only partly filled in" rather than naming a property. */
const DATE_LABELS = { next_action_due_date: "Due date" };
const dateLabelFor = (field) =>
  field.startsWith("target_date:") ? "Target date" : (DATE_LABELS[field] ?? "That date");

/* Attendings only, per the request. The currently-set person is always
   included even if they have since left or changed role, so opening an
   old case report never silently blanks its attending. */
function AttendingPicker({ people, value, onChange, onAddPerson, now }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const options = useMemo(() => {
    const attendings = activePeople(people, now).filter((p) => p.staff_position === "attending");
    const current = value ? people.find((p) => p.id === value) : null;
    const list = current && !attendings.some((a) => a.id === current.id)
      ? [current, ...attendings]
      : attendings;
    return [
      { code: "", label: "—" },
      ...list.map((p) => ({
        code: p.id,
        label: p.staff_position === "attending" ? p.display_name : `${p.display_name} (${label(STAFF_POSITIONS, p.staff_position)})`,
      })),
      { code: "__add", label: "+ Add an attending to the roster…" },
    ];
  }, [people, value, now]);

  if (adding) {
    return (
      <div className="rounded-md p-3" style={{ border: `1px solid ${brand.border}`, background: brand.bg }}>
        <TextInput
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Attending's full name"
          aria-label="New attending name"
        />
        <div className="flex gap-2 mt-2">
          <Button
            disabled={!name.trim()}
            onClick={() => {
              const person = onAddPerson(name.trim(), "attending", "");
              onChange(person.id);
              setName(""); setAdding(false);
            }}
          >
            <Check size={14} /> Add
          </Button>
          <Button variant="ghost" onClick={() => { setName(""); setAdding(false); }}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <Select
      options={options}
      value={value || ""}
      onChange={(e) => (e.target.value === "__add" ? setAdding(true) : onChange(e.target.value))}
    />
  );
}

export default function DetailPanel({
  project, people, projects, onSave, onClose, onArchive, onAddPerson, now = Date.now,
}) {
  const [tab, setTab] = useState("overview");
  const [draft, setDraft] = useState(project);
  /* What "unchanged" means right now. It starts as the project we were
     handed and moves forward on every successful save, so the panel does
     not depend on the parent re-rendering with the new value before it
     can stop claiming unsaved work. */
  const [baseline, setBaseline] = useState(project);
  const [errors, setErrors] = useState(null);
  // Which date boxes currently hold something unsaveable, and why.
  const [dateProblems, setDateProblems] = useState({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [venueToDelete, setVenueToDelete] = useState(null);

  // Reset when a different project is opened.
  useEffect(() => {
    setDraft(project);
    setBaseline(project);
    setErrors(null);
    setDateProblems({});
    setTab("overview");
  }, [project.id]);

  /* Dirty is a comparison, not a flag. Typing a character and deleting it
     used to leave the panel insisting on unsaved work and putting a
     dialog in the way of leaving; now putting a project back the way you
     found it simply lets you go. */
  const dirty = hasChanges(draft, baseline) ||
                Object.values(dateProblems).some(Boolean);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setDetail = (patch) => setDraft((d) => ({ ...d, details: { ...d.details, ...patch } }));
  const setType = (nextType) => setDraft((d) => changeProjectType(d, nextType, projects, now()));

  const noteDate = (field, state) =>
    setDateProblems((p) => ({ ...p, [field]: state.problem }));

  /* A half-typed date stores nothing, so without this the entry would
     just vanish on save and nobody would be told why. */
  const dateErrors = Object.entries(dateProblems)
    .filter(([, problem]) => problem)
    .map(([field, problem]) => ({
      field,
      message: describeDateProblem(problem, dateLabelFor(field), now()),
    }));

  const addVenue = () =>
    set({
      venues: [
        ...draft.venues,
        {
          id: `v${Date.now()}`, venue_type: "poster", venue_name: "",
          other_venue_description: "", submission_status: "not_yet_submitted",
          target_date: "", notes: "",
        },
      ],
    });

  const setVenue = (id, patch) =>
    set({ venues: draft.venues.map((v) => (v.id === id ? { ...v, ...patch } : v)) });

  const removeVenue = (id) => {
    set({ venues: draft.venues.filter((v) => v.id !== id) });
    setVenueToDelete(null);
  };

  const save = () => {
    const found = [...validateProject(draft, now()), ...dateErrors];
    if (found.length) { setErrors(found); return; }
    const saved = { ...draft, updated_at: new Date(now()).toISOString() };
    onSave(saved);
    setBaseline(saved);
    setDraft(saved);
  };

  const attemptClose = () => (dirty ? setConfirmDiscard(true) : onClose());

  /* "Save now" from the unsaved-changes dialog. Offering only discard or
     go-back made the dialog a detour: the thing you wanted was to save,
     and it sent you away to do it. If the draft is invalid this refuses
     and shows why, rather than closing over a failed save. */
  const saveAndClose = () => {
    const found = [...validateProject(draft, now()), ...dateErrors];
    if (found.length) { setConfirmDiscard(false); setErrors(found); return; }
    onSave({ ...draft, updated_at: new Date(now()).toISOString() });
    setConfirmDiscard(false);
    onClose();
  };

  const maxYear = maxYearSeen(now());

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label={draft.title}>
      <div className="absolute inset-0" style={{ background: "rgba(11,37,69,0.35)" }} onClick={attemptClose} />
      <div
        className="relative w-full max-w-2xl h-full overflow-y-auto"
        style={{ background: brand.bg, borderLeft: `1px solid ${brand.border}` }}
      >
        <div className="sticky top-0 z-10 px-5 py-4" style={{ background: brand.surface, borderBottom: `1px solid ${brand.border}` }}>
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge list={TYPES} code={draft.project_type} small />
                <Badge list={WORK_STATUSES} code={draft.work_status} small />
                {draft.details?.case_number && (
                  <span className="text-xs font-mono" style={{ color: brand.slate }}>{draft.details.case_number}</span>
                )}
                {/* When this was first entered. Only case reports have a
                    case number, so every other type had nothing here at
                    all — and "when did we start this?" is asked of all
                    four. */}
                {draft.created_at && (
                  <span className="text-xs" style={{ color: brand.slate }}>
                    Submitted {formatDate(draft.created_at)}
                  </span>
                )}
                {draft.archived_at && (
                  <span className="text-xs" style={{ color: brand.slate }}>
                    Archived {formatDate(draft.archived_at)}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold leading-snug" style={{ color: brand.navy }}>{draft.title}</h2>
            </div>
            <button onClick={attemptClose} aria-label="Close panel"><X size={20} style={{ color: brand.slate }} /></button>
          </div>

          <div className="flex gap-1 mt-3 -mb-4">
            {["overview", "venues", "notes"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-2 text-sm capitalize"
                style={tab === t
                  ? { color: brand.navy, borderBottom: `2px solid ${brand.navy}`, fontWeight: 600 }
                  : { color: brand.slate, borderBottom: "2px solid transparent" }}
              >
                {t}
                {t === "venues" && draft.venues.length > 0 && (
                  <span className="ml-1.5 text-xs">{draft.venues.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 pb-28">
          {tab === "overview" && (
            <>
              <Field label="Title">
                <TextInput value={draft.title} onChange={(e) => set({ title: e.target.value })} />
                <IdentifierNotice text={draft.title} />
              </Field>

              <Field group label="Type" hint="Set the wrong one on capture? Change it here — nothing is lost, and a case number once issued is kept.">
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setType(t.code)}
                      className="rounded-md px-3 py-1.5 text-sm"
                      style={draft.project_type === t.code
                        ? { background: brand.navy, color: "#fff" }
                        : { background: brand.surface, color: brand.slate, border: `1px solid ${brand.border}` }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Field label="Work status">
                  <Select options={WORK_STATUSES} value={draft.work_status}
                          onChange={(e) => set({ work_status: e.target.value })} />
                </Field>
                <Field label="IRB status">
                  <Select options={IRB_STATUSES} value={draft.irb_status}
                          onChange={(e) => set({ irb_status: e.target.value })} />
                </Field>
              </div>

              <Field group label="Author(s)">
                <AuthorPicker people={people} selected={draft.authors} onChange={(o) => set({ authors: o })}
                              onAddPerson={onAddPerson} now={now()} />
              </Field>

              {draft.project_type === "case_report" && (
                <div className="rounded-lg p-4 mt-2" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
                  <h3 className="text-sm font-semibold mb-1" style={{ color: brand.navy }}>Case detail</h3>
                  <p className="text-xs mb-4 leading-relaxed" style={{ color: brand.slate }}>
                    No patient identifiers here or in any free-text field: no name, MRN, date of
                    birth, or date of service. The case ID is the only patient reference this system
                    holds, and the mapping lives in the EMR.
                  </p>
                  <Field label="Diagnosis">
                    <TextInput value={draft.details.diagnosis || ""}
                               onChange={(e) => setDetail({ diagnosis: e.target.value })} />
                  </Field>
                  <Field label="Why it is unique">
                    <TextArea rows={2} value={draft.details.why_unique || ""}
                              onChange={(e) => setDetail({ why_unique: e.target.value })} />
                    <IdentifierNotice text={draft.details.why_unique} />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
                    <Field group label="Attending">
                      <AttendingPicker
                        people={people}
                        value={draft.details.attending_id || ""}
                        onChange={(id) => setDetail({ attending_id: id })}
                        onAddPerson={onAddPerson}
                        now={now()}
                      />
                    </Field>
                    <Field label="Year seen" hint={`Year only, no later than ${maxYear}.`}>
                      <TextInput
                        type="number" min="1990" max={String(maxYear)}
                        value={draft.details.year_seen || ""}
                        onChange={(e) => setDetail({ year_seen: e.target.value })}
                      />
                    </Field>
                    <Field label="Consent">
                      <Select options={CONSENT} value={draft.details.patient_consent_obtained || "not_yet"}
                              onChange={(e) => setDetail({ patient_consent_obtained: e.target.value })} />
                    </Field>
                  </div>
                </div>
              )}

              {draft.project_type !== "case_report" && (
                <div className="rounded-lg p-4 mt-2" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: brand.navy }}>
                    {label(TYPES, draft.project_type)} detail
                  </h3>
                  <Field label="Description">
                    <TextArea rows={2} value={draft.details.description || ""}
                              onChange={(e) => setDetail({ description: e.target.value })} />
                  </Field>
                  {draft.project_type === "qa_qi" && (
                    <>
                      <Field label="Aim statement">
                        <TextInput value={draft.details.aim_statement || ""}
                                   onChange={(e) => setDetail({ aim_statement: e.target.value })} />
                      </Field>
                      <Field label="Measure" hint="What are we measuring to know it worked?">
                        <TextInput value={draft.details.measure || ""}
                                   onChange={(e) => setDetail({ measure: e.target.value })} />
                      </Field>
                    </>
                  )}
                  {draft.project_type === "research" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      <Field label="Study design">
                        <Select
                          options={[
                            { code: "survey", label: "Survey" }, { code: "retrospective", label: "Retrospective" },
                            { code: "prospective", label: "Prospective" }, { code: "cross_sectional", label: "Cross-sectional" },
                            { code: "other", label: "Other" },
                          ]}
                          value={draft.details.study_design || "other"}
                          onChange={(e) => setDetail({ study_design: e.target.value })}
                        />
                      </Field>
                      <Field label="Data source">
                        <TextInput value={draft.details.data_source || ""}
                                   onChange={(e) => setDetail({ data_source: e.target.value })} />
                      </Field>
                    </div>
                  )}
                  {draft.project_type === "review" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      <Field label="Review type">
                        <Select
                          options={[
                            { code: "narrative", label: "Narrative" }, { code: "systematic", label: "Systematic" },
                            { code: "scoping", label: "Scoping" },
                          ]}
                          value={draft.details.review_type || "narrative"}
                          onChange={(e) => setDetail({ review_type: e.target.value })}
                        />
                      </Field>
                      <Field label="Research question">
                        <TextInput value={draft.details.research_question || ""}
                                   onChange={(e) => setDetail({ research_question: e.target.value })} />
                      </Field>
                    </div>
                  )}
                </div>
              )}

              {/* What happens next, and when. Below the type-specific
                  detail because it is about the project's momentum rather
                  than its substance — and it is the same question for all
                  four types, so it reads better once the differences are
                  out of the way. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 mt-5">
                <Field label="Next action">
                  <TextInput value={draft.next_action} onChange={(e) => set({ next_action: e.target.value })} />
                </Field>
                <Field label="Due">
                  <DateInput value={draft.next_action_due_date}
                             onChange={(iso) => set({ next_action_due_date: iso })}
                             onStateChange={(st) => noteDate("next_action_due_date", st)}
                             now={now()}
                             aria-label="Due date" />
                </Field>
              </div>

              <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${brand.border}` }}>
                <Button variant="secondary" onClick={() => onArchive(draft.id)}>
                  <Archive size={14} />
                  {draft.archived_at ? "Restore project" : "Archive project"}
                </Button>
                <p className="text-xs mt-2" style={{ color: brand.slate }}>
                  Archiving hides the project from default views. Nothing is deleted, and it can be
                  restored from the Archived filter.
                </p>
              </div>
            </>
          )}

          {tab === "venues" && (
            <>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: brand.slate }}>
                A project can have several destinations at once, at different stages — a poster
                already accepted while the manuscript is still in review.
              </p>
              {draft.venues.map((v) => (
                <div key={v.id} className="rounded-lg p-4 mb-3" style={{ background: brand.surface, border: `1px solid ${brand.border}` }}>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <Badge list={SUBMISSION_STATUSES} code={v.submission_status} small />
                    <button onClick={() => setVenueToDelete(v)} aria-label={`Remove ${v.venue_name || "venue"}`}>
                      <X size={15} style={{ color: brand.slate }} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    <Field label="Venue">
                      <TextInput value={v.venue_name} placeholder="e.g. AAD Annual Meeting"
                                 onChange={(e) => setVenue(v.id, { venue_name: e.target.value })} />
                    </Field>
                    <Field label="Kind">
                      <Select options={VENUE_TYPES} value={v.venue_type}
                              onChange={(e) => setVenue(v.id, { venue_type: e.target.value })} />
                    </Field>
                  </div>
                  {v.venue_type === "other" && (
                    <Field label="What kind?" hint="Free text — whatever this actually is.">
                      <TextInput
                        value={v.other_venue_description || ""}
                        placeholder="e.g. Grand rounds at another institution"
                        onChange={(e) => setVenue(v.id, { other_venue_description: e.target.value })}
                      />
                    </Field>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    <Field label="Submission status">
                      <Select options={SUBMISSION_STATUSES} value={v.submission_status}
                              onChange={(e) => setVenue(v.id, { submission_status: e.target.value })} />
                    </Field>
                    <Field label="Target date">
                      <DateInput value={v.target_date}
                                 onChange={(iso) => setVenue(v.id, { target_date: iso })}
                                 onStateChange={(st) => noteDate(`target_date:${v.id}`, st)}
                                 now={now()}
                                 aria-label="Target date" />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <TextInput value={v.notes} onChange={(e) => setVenue(v.id, { notes: e.target.value })} />
                  </Field>
                </div>
              ))}
              {draft.venues.length === 0 && (
                <p className="text-sm mb-3" style={{ color: brand.slate }}>
                  No venue yet. Add one when you know where this is headed.
                </p>
              )}
              <Button variant="secondary" onClick={addVenue}><Plus size={14} /> Add a venue</Button>
            </>
          )}

          {tab === "notes" && (
            <>
              <Field label="Notes" hint="Markdown. This is the notepad — put anything here except patient identifiers.">
                <TextArea rows={16} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
              <IdentifierNotice text={draft.notes} />
            </>
          )}
        </div>

        {/* Save bar. Pinned, so it is reachable from the bottom of a long form. */}
        <div
          className="sticky bottom-0 px-5 py-3 flex items-center gap-3"
          style={{ background: brand.surface, borderTop: `1px solid ${brand.border}` }}
        >
          <Button onClick={save} disabled={!dirty}>Save changes</Button>
          <Button variant="ghost" onClick={attemptClose}>{dirty ? "Cancel" : "Close"}</Button>
          <span className="text-xs ml-auto" style={{ color: brand.slate }}>
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>
      </div>

      {errors && (
        <Modal
          title="This project cannot be saved yet"
          tone="danger"
          onClose={() => setErrors(null)}
          actions={<Button onClick={() => setErrors(null)}>Back to editing</Button>}
        >
          <ul className="list-disc pl-5 space-y-1">
            {errors.map((e) => <li key={e.field}>{e.message}</li>)}
          </ul>
        </Modal>
      )}

      {venueToDelete && (
        <Modal
          title="Delete this venue?"
          tone="danger"
          onClose={() => setVenueToDelete(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setVenueToDelete(null)}>Keep it</Button>
              <Button variant="danger" onClick={() => removeVenue(venueToDelete.id)}>Delete venue</Button>
            </>
          }
        >
          {venueToDelete.venue_name
            ? <>“{venueToDelete.venue_name}” and its submission status and notes will be removed.</>
            : <>This venue and its submission status and notes will be removed.</>}
          {" "}Venues are not archived like projects are, so this cannot be undone — you would have
          to add it again from scratch.
        </Modal>
      )}

      {confirmDiscard && (
        <UnsavedChangesDialog
          what="this project"
          onSave={saveAndClose}
          onDiscard={() => { setConfirmDiscard(false); onClose(); }}
          onKeepEditing={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  );
}
