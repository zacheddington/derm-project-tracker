import React, { useState } from "react";
import { X, Plus, Check, Pencil } from "lucide-react";
import {
  brand, PERSON_ROLES, label, personSubtitle, needsPosition, isPersonActive,
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

function PersonRow({ person, projectCount, onSave, now }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person);

  const start = () => { setDraft(person); setEditing(true); };
  const commit = () => {
    if (!draft.display_name.trim()) return;
    onSave(person.id, {
      display_name: draft.display_name,
      role: draft.role,
      position: draft.position ?? "",
      pgy_level: draft.pgy_level,
      end_date: draft.end_date || null,
    });
    setEditing(false);
  };

  const active = isPersonActive(person, now);

  if (!editing) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5"
        style={{ borderBottom: `1px solid ${brand.border}`, opacity: active ? 1 : 0.6 }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" style={{ color: brand.navy }}>
            {person.display_name}
            {!active && (
              <span className="ml-2 text-xs font-normal" style={{ color: brand.slate }}>
                left {person.end_date}
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: brand.slate }}>
            {personSubtitle(person)}
            {projectCount > 0 && ` · ${projectCount} project${projectCount === 1 ? "" : "s"}`}
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
    <div className="px-3 py-3" style={{ borderBottom: `1px solid ${brand.border}`, background: brand.bg }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <Field label="Name">
          <TextInput
            value={draft.display_name}
            onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
          />
        </Field>
        <Field label="Role">
          <Select
            options={PERSON_ROLES}
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          />
        </Field>
      </div>
      {needsPosition(draft.role) && (
        <Field label="Position" hint="Free text — what they actually do, and where.">
          <TextInput
            value={draft.position ?? ""}
            onChange={(e) => setDraft({ ...draft, position: e.target.value })}
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
          value={draft.end_date ?? ""}
          onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
        />
      </Field>
      <div className="flex gap-2">
        <Button onClick={commit} disabled={!draft.display_name.trim()}><Check size={14} /> Save</Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function RosterPanel({ people, projects, onSavePerson, onAddPerson, onClose, now = Date.now() }) {
  const [showFormer, setShowFormer] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("resident");
  const [newPosition, setNewPosition] = useState("");

  const countFor = (id) => projects.filter((p) => p.owners.includes(id)).length;
  const shown = people.filter((p) => showFormer || isPersonActive(p, now));

  const commitNew = () => {
    const name = newName.trim();
    if (!name) return;
    onAddPerson(name, newRole, newPosition.trim());
    setNewName(""); setNewPosition(""); setAdding(false);
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
          <div className="flex items-center gap-2 mb-3">
            <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
              <Plus size={14} /> Add someone
            </Button>
            <button
              onClick={() => setShowFormer((v) => !v)}
              className="rounded-md px-2.5 py-1.5 text-xs"
              style={showFormer
                ? { background: brand.navy, color: "#fff" }
                : { border: `1px solid ${brand.border}`, color: brand.navy, background: brand.surface }}
            >
              Show former staff
            </button>
          </div>

          {adding && (
            <div className="rounded-md p-3 mb-3" style={{ border: `1px solid ${brand.border}`, background: brand.bg }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" aria-label="Full name" />
                <Select options={PERSON_ROLES} value={newRole} onChange={(e) => setNewRole(e.target.value)} aria-label="Role" />
              </div>
              {needsPosition(newRole) && (
                <div className="mb-2">
                  <TextInput
                    value={newPosition}
                    onChange={(e) => setNewPosition(e.target.value)}
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

          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
            {shown.map((p) => (
              <PersonRow key={p.id} person={p} projectCount={countFor(p.id)} onSave={onSavePerson} now={now} />
            ))}
            {shown.length === 0 && (
              <p className="text-sm px-3 py-4" style={{ color: brand.slate }}>Nobody on the roster yet.</p>
            )}
          </div>

          <p className="text-xs mt-4 leading-relaxed" style={{ color: brand.slate }}>
            People are never deleted. Historical attribution has to survive residents graduating,
            so leaving is an end date rather than a removal — {label(PERSON_ROLES, "attending")}s and
            residents alike keep their name on everything they authored.
          </p>
        </div>
      </div>
    </div>
  );
}
