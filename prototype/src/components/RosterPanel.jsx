import React, { useState } from "react";
import { X, Plus, Check, Pencil, Search } from "lucide-react";
import {
  brand, STAFF_POSITIONS, label, personSubtitle, needsExternalPosition, isPersonActive,
  filterRoster, projectLoad, pluralProjects,
} from "../lib/domain.js";
import { Button, Field, Select, TextInput } from "./primitives.jsx";

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

function PersonRow({ person, load, onSave, onShowProjects, now }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person);

  const start = () => { setDraft(person); setEditing(true); };
  const commit = () => {
    if (!draft.display_name.trim()) return;
    onSave(person.id, {
      display_name: draft.display_name,
      staff_position: draft.staff_position,
      external_position: draft.external_position ?? "",
      pgy_level: draft.pgy_level,
      employment_end_date: draft.employment_end_date || null,
    });
    setEditing(false);
  };

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
          <div className="text-sm font-medium truncate" style={{ color: brand.navy }}>
            {person.display_name}
            {!active && (
              <span className="ml-2 text-xs font-normal" style={{ color: brand.slate }}>
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
              onClick={() => onShowProjects(person.id, false)}
              className="underline underline-offset-2 hover:no-underline"
              style={{ color: load.active ? brand.navy : brand.slate }}
            >
              {pluralProjects(load.active)} active
            </button>
            {" · "}
            <button
              type="button"
              onClick={() => onShowProjects(person.id, true)}
              className="underline underline-offset-2 hover:no-underline"
              style={{ color: load.archived ? brand.navy : brand.slate }}
            >
              {pluralProjects(load.archived)} archived
            </button>
          </div>
        </div>
        <button
          onClick={start}
          className="shrink-0 rounded-md px-2 py-1 text-xs inline-flex items-center gap-1.5"
          style={{ border: `1px solid ${brand.border}`, color: brand.navy }}
        >
          <Pencil size={12} /> Edit
        </button>
      </div>
    );
  }

  return (
    <div role="listitem" className="px-3 py-3" style={{ borderBottom: `1px solid ${brand.border}`, background: brand.bg }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <Field label="Name">
          <TextInput
            value={draft.display_name}
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
        <TextInput
          type="date"
          value={draft.employment_end_date ?? ""}
          onChange={(e) => setDraft({ ...draft, employment_end_date: e.target.value })}
        />
      </Field>
      <div className="flex gap-2">
        <Button onClick={commit} disabled={!draft.display_name.trim()}><Check size={14} /> Save</Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function RosterPanel({
  people, projects, onSavePerson, onAddPerson, onShowProjects, onClose, now = Date.now(),
}) {
  const [showFormer, setShowFormer] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStaffPosition, setNewStaffPosition] = useState("resident");
  const [newExternalPosition, setNewExternalPosition] = useState("");

  const loadFor = (id) => projectLoad(id, projects);
  const shown = filterRoster(people, { showFormer, query }, now);
  const formerCount = people.filter((p) => !isPersonActive(p, now)).length;

  const commitNew = () => {
    const name = newName.trim();
    if (!name) return;
    onAddPerson(name, newStaffPosition, newExternalPosition.trim());
    setNewName(""); setNewExternalPosition(""); setAdding(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Roster">
      <div className="absolute inset-0" style={{ background: "rgba(11,37,69,0.35)" }} onClick={onClose} />
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
            <button onClick={onClose} aria-label="Close"><X size={20} style={{ color: brand.slate }} /></button>
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
              style={{ border: `1px solid ${brand.border}`, background: brand.surface, color: brand.navy }}
            />
          </div>

          {!showFormer && (
            <div className="mb-3">
              <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
                <Plus size={14} /> Add someone
              </Button>
            </div>
          )}

          {adding && (
            <div className="rounded-md p-3 mb-3" style={{ border: `1px solid ${brand.border}`, background: brand.bg }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" aria-label="Full name" />
                <Select options={STAFF_POSITIONS} value={newStaffPosition} onChange={(e) => setNewStaffPosition(e.target.value)} aria-label="Role" />
              </div>
              {needsExternalPosition(newStaffPosition) && (
                <div className="mb-2">
                  <TextInput
                    value={newExternalPosition}
                    onChange={(e) => setNewExternalPosition(e.target.value)}
                    placeholder="Their position or role — e.g. Pathologist, Baptist Health"
                    aria-label="Position or role"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={commitNew} disabled={!newName.trim()}><Check size={14} /> Add</Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div role="list" aria-label={showFormer ? "Former staff" : "Current staff"}
               className="rounded-lg overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
            {shown.map((p) => (
              <PersonRow key={p.id} person={p} load={loadFor(p.id)} onSave={onSavePerson}
                         onShowProjects={onShowProjects} now={now} />
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
