import React, { useState, useEffect } from "react";
import { X, Plus, Check, Pencil, Search } from "lucide-react";
import {
  brand, STAFF_POSITIONS, label, personSubtitle, needsExternalPosition, isPersonActive,
  filterRoster, sortRoster, projectLoad, pluralProjects, ROSTER_SORTS,
} from "../lib/domain.js";
import {
  Button, DateInput, Field, Select, TextInput, UnsavedChangesDialog, inputStyle,
} from "./primitives.jsx";
import { hasChanges, describeDateProblem } from "../lib/projects.js";
import NewPersonForm from "./NewPersonForm.jsx";

/* ---------------------------------------------------------------------
   The roster.

   Two jobs the tracker could not do before:

   1. Rename someone. People marry, divorce and change names, and the
      projects they authored are still theirs. Because a project stores
      the person's ID and never their name, a rename is one edit and
      every association follows it automatically.

   2. End someone's employment. Residents graduate. Without an end date
      the pickers grow forever and eventually every dropdown is a wall of
      people who left years ago. An end date removes them from pickers
      while leaving every past attribution intact.
   --------------------------------------------------------------------- */

function PersonRow({ person, load, onSave, onShowProjects, onEditStateChange, now }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person);
  const [confirmExit, setConfirmExit] = useState(false);
  const [dateProblem, setDateProblem] = useState(null);

  const start = () => { setDraft(person); setEditing(true); };

  // The same comparison the project panel uses. Reverting an edit by hand
  // leaves nothing to save, and should not put a dialog in the way.
  const dirty = editing && (hasChanges(draft, person) || Boolean(dateProblem));
  const canSave = Boolean(draft.display_name.trim()) && !dateProblem;

  const commit = () => {
    if (!canSave) return;
    onSave(person.id, {
      display_name: draft.display_name,
      staff_position: draft.staff_position,
      external_position: draft.external_position ?? "",
      pgy_level: draft.pgy_level,
      employment_end_date: draft.employment_end_date || null,
    });
    setConfirmExit(false);
    setEditing(false);
  };

  const attemptCancel = () => (dirty ? setConfirmExit(true) : setEditing(false));
  const discard = () => { setConfirmExit(false); setEditing(false); setDraft(person); };

  /* Enter saves, from any field.

     The <form> is there for semantics and for the Save button, but the
     Enter behaviour is handled explicitly rather than left to the
     browser's implicit-submission rules, which are quietly conditional —
     they depend on the number of fields, the presence of a submit button,
     and the input type. Handling it here means one rule for every box
     instead of a rule that holds until someone adds a second input.

     preventDefault stops the browser also submitting, so `commit` runs
     once. Buttons are left alone: Enter on a focused button is already a
     click, and intercepting it would break Cancel. */
  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "TEXTAREA") return;
    e.preventDefault();
    commit();
  };

  /* Tell the panel whether this row is holding unsaved work, and how to
     resolve it, so closing the whole roster can ask the same question
     rather than silently dropping the edit. */
  useEffect(() => {
    onEditStateChange?.(person.id, dirty ? { name: person.display_name, save: commit, discard, canSave } : null);
    return () => onEditStateChange?.(person.id, null);
  }, [dirty, draft, canSave]);

  const active = isPersonActive(person, now);

  // Rows are never faded. In the Former staff view everyone here has
  // left, so greying every row communicates nothing and only makes the
  // panel harder to read. The end date says it instead.
  if (!editing) {
    return (
      <div
        role="listitem"
        className="flex items-center gap-3 px-3 py-2.5"
        style={{ borderBottom: `1px solid ${brand.border}` }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: brand.navy }}>
            {/* The name is the link to their work — it is the biggest
                thing in the row and the obvious thing to click. */}
            <button
              type="button"
              onClick={() => onShowProjects(person.id, "both")}
              className="hover:underline underline-offset-2 truncate text-left"
              style={{ color: brand.navy }}
            >
              {person.display_name}
            </button>
            {/* Editing sits next to the name rather than at the far right,
                where it was a long way from the thing it edits. */}
            <button
              type="button"
              onClick={start}
              aria-label={`Edit ${person.display_name}`}
              className="shrink-0 rounded p-0.5 hover:bg-gray-100"
              style={{ color: brand.slate }}
            >
              <Pencil size={13} />
            </button>
            {!active && (
              <span className="ml-1 text-xs font-normal" style={{ color: brand.slate }}>
                left {person.employment_end_date}
              </span>
            )}
          </div>
          {/* The counts are always shown, zeros included. "0 active
              projects" is the most useful thing this panel can say — it
              is how you find who needs one. Both are links straight to
              that person's rows, because the next question after "who has
              none?" is always "what does everyone else have?" */}
          <div className="text-xs" style={{ color: brand.slate }}>
            {personSubtitle(person)}
            {" · "}
            <button
              type="button"
              onClick={() => onShowProjects(person.id, "active")}
              className="underline underline-offset-2 hover:no-underline"
              style={{ color: load.active ? brand.navy : brand.slate }}
            >
              {pluralProjects(load.active)} active
            </button>
            {" · "}
            <button
              type="button"
              onClick={() => onShowProjects(person.id, "archived")}
              className="underline underline-offset-2 hover:no-underline"
              style={{ color: load.archived ? brand.navy : brand.slate }}
            >
              {pluralProjects(load.archived)} archived
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="listitem" className="px-3 py-3" style={{ borderBottom: `1px solid ${brand.border}`, background: brand.bg }}>
      {/* Enter used to be bolted to the name box alone, so it saved from
          the name and did nothing from the position or the end date —
          the same key doing two different things in one row of boxes.
          See onKeyDown above; `commit` refuses a blank name or an
          unusable date either way. */}
      <form onSubmit={(e) => { e.preventDefault(); commit(); }} onKeyDown={onKeyDown}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Field label="Name">
            <TextInput
              value={draft.display_name}
              autoFocus
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <Select
              options={STAFF_POSITIONS}
              value={draft.staff_position}
              onChange={(e) => setDraft({ ...draft, staff_position: e.target.value })}
            />
          </Field>
        </div>
        {needsExternalPosition(draft.staff_position) && (
          <Field label="Position" hint="Free text — what they actually do, and where.">
            <TextInput
              value={draft.external_position ?? ""}
              onChange={(e) => setDraft({ ...draft, external_position: e.target.value })}
              placeholder="e.g. Pathologist, Baptist Health"
            />
          </Field>
        )}
        <Field
          label="End date"
          hint="Leave blank while they are still here. Setting it removes them from pickers; every project they authored keeps their name."
        >
          <DateInput
            value={draft.employment_end_date ?? ""}
            onChange={(iso) => setDraft({ ...draft, employment_end_date: iso })}
            onStateChange={(st) => setDateProblem(st.problem)}
            now={now}
            aria-label="End date"
          />
          {dateProblem && (
            <span className="block text-xs mt-1" style={{ color: brand.alertText }}>
              {describeDateProblem(dateProblem, "End date", now)}
            </span>
          )}
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={!canSave}><Check size={14} /> Save</Button>
          <Button variant="ghost" onClick={attemptCancel}>Cancel</Button>
        </div>
      </form>

      {confirmExit && (
        <UnsavedChangesDialog
          what={person.display_name}
          onSave={commit}
          onDiscard={discard}
          onKeepEditing={() => setConfirmExit(false)}
          saveDisabled={!canSave}
        />
      )}
    </div>
  );
}

export default function RosterPanel({
  people, projects, onSavePerson, onAddPerson, onShowProjects, onClose, now = Date.now(),
}) {
  const [showFormer, setShowFormer] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  /* Unsaved work anywhere in the panel: a row being edited, or a
     half-filled "Add someone" form. Closing the panel has to ask about
     either of them — this was the gap. */
  const [pendingEdits, setPendingEdits] = useState({});
  const [confirmExit, setConfirmExit] = useState(false);

  const noteEditState = (id, state) =>
    setPendingEdits((prev) => {
      if (!state && !prev[id]) return prev;
      const next = { ...prev };
      if (state) next[id] = state; else delete next[id];
      return next;
    });
  const [adding, setAdding] = useState(false);
  /* What the "Add someone" form is holding, if anything: `{ name, commit,
     discard }` while a name has been typed and not committed, null
     otherwise. The form reports it, the same way a row mid-edit does. */
  const [newPerson, setNewPerson] = useState(null);

  const loadFor = (id) => projectLoad(id, projects);
  const shown = sortRoster(
    filterRoster(people, { showFormer, query, position }, now),
    sortBy,
    projects
  );
  const formerCount = people.filter((p) => !isPersonActive(p, now)).length;

  const commitNew = (name, staffPosition, externalPosition) => {
    onAddPerson(name, staffPosition, externalPosition);
    setAdding(false);
  };

  /* Anything in flight: a row mid-edit, or a name typed into the add form
     and not yet committed. */
  const pending = Object.values(pendingEdits);
  const addPending = adding && Boolean(newPerson);
  const unsaved = pending.length > 0 || addPending;

  const describeUnsaved = () => {
    if (pending.length === 1) return pending[0].name;
    if (pending.length > 1) return `${pending.length} people`;
    return `the new entry for ${newPerson.name}`;
  };

  const saveEverything = () => {
    pending.forEach((p) => p.save());
    if (addPending) newPerson.commit();
    setConfirmExit(false);
    onClose();
  };

  const discardEverything = () => {
    pending.forEach((p) => p.discard());
    if (addPending) newPerson.discard();
    setConfirmExit(false);
    onClose();
  };

  const attemptClose = () => (unsaved ? setConfirmExit(true) : onClose());
  const canSaveAll = pending.every((p) => p.canSave);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Roster">
      <div className="absolute inset-0" style={{ background: "rgba(11,37,69,0.35)" }} onClick={attemptClose} />
      <div
        className="relative w-full max-w-lg h-full overflow-y-auto"
        style={{ background: brand.surface, borderLeft: `1px solid ${brand.border}` }}
      >
        <div className="sticky top-0 z-10 px-5 py-4" style={{ background: brand.surface, borderBottom: `1px solid ${brand.border}` }}>
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: brand.navy }}>Roster</h2>
              <p className="text-xs mt-0.5" style={{ color: brand.slate }}>
                Renaming someone keeps every project they are on.
              </p>
            </div>
            <button onClick={attemptClose} aria-label="Close"><X size={20} style={{ color: brand.slate }} /></button>
          </div>
        </div>

        <div className="px-5 py-4">
          {/* Current and former are two views of the roster, not one list
              with some rows faded. "Who has left?" is a question you can
              answer by reading this; greyed-out rows mixed into the
              current staff read as a rendering glitch instead. */}
          <div
            className="inline-flex rounded-md overflow-hidden mb-3"
            style={{ border: `1px solid ${brand.border}` }}
            role="tablist"
            aria-label="Roster view"
          >
            {[
              { key: false, label: "Current staff" },
              { key: true, label: `Former staff${formerCount ? ` (${formerCount})` : ""}` },
            ].map((t) => (
              <button
                key={String(t.key)}
                role="tab"
                aria-selected={showFormer === t.key}
                onClick={() => setShowFormer(t.key)}
                className="px-3 py-1.5 text-xs"
                style={showFormer === t.key
                  ? { background: brand.navy, color: "#fff" }
                  : { background: brand.surface, color: brand.navy }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-2.5" style={{ color: brand.slate }} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={showFormer ? "Search former staff…" : "Search by name or position…"}
              aria-label="Search the roster"
              className="w-full rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:ring-2"
              style={inputStyle}
            />
          </div>

          {/* "Which residents have nothing on?" is the question this panel
              is opened to answer, and answering it by scanning
              twenty-three rows for a zero is the sort of thing people
              simply stop doing. */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              aria-label="Filter the roster by position"
              className="rounded-md px-2.5 py-1.5 text-xs"
              style={inputStyle}
            >
              <option value="all">All positions</option>
              {STAFF_POSITIONS.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort the roster"
              className="rounded-md px-2.5 py-1.5 text-xs"
              style={inputStyle}
            >
              {ROSTER_SORTS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
            {!showFormer && (
              <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
                <Plus size={14} /> Add someone
              </Button>
            )}
          </div>

          {adding && (
            <NewPersonForm
              className="mb-3"
              submitLabel="Add"
              disableWhenEmpty
              onCommit={commitNew}
              onCancel={() => setAdding(false)}
              onPendingChange={setNewPerson}
            />
          )}

          <div role="list" aria-label={showFormer ? "Former staff" : "Current staff"}
               className="rounded-lg overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
            {shown.map((p) => (
              <PersonRow key={p.id} person={p} load={loadFor(p.id)} onSave={onSavePerson}
                         onShowProjects={onShowProjects} onEditStateChange={noteEditState} now={now} />
            ))}
            {shown.length === 0 && (
              <p className="text-sm px-3 py-4" style={{ color: brand.slate }}>
                {query.trim()
                  ? `Nobody ${showFormer ? "who has left" : "currently here"} matches “${query.trim()}”.`
                  : showFormer
                    ? "Nobody has left yet."
                    : "Nobody on the roster yet."}
              </p>
            )}
          </div>

          {confirmExit && (
            <UnsavedChangesDialog
              what={describeUnsaved()}
              onSave={saveEverything}
              onDiscard={discardEverything}
              onKeepEditing={() => setConfirmExit(false)}
              saveDisabled={!canSaveAll}
            />
          )}

          <p className="text-xs mt-4 leading-relaxed" style={{ color: brand.slate }}>
            People are never deleted. Historical attribution has to survive residents graduating,
            so leaving is an end date rather than a removal — {label(STAFF_POSITIONS, "attending")}s and
            residents alike keep their name on everything they authored.
          </p>
        </div>
      </div>
    </div>
  );
}
