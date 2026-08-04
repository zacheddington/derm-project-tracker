import React, { useState, useMemo } from "react";
import { Plus, X, Check } from "lucide-react";
import {
  brand, PERSON_ROLES, activePeople, personSubtitle, needsPosition,
} from "../lib/domain.js";
import { Button, Select, TextInput } from "./primitives.jsx";

/* ---------------------------------------------------------------------
   Author picker.

   Every chip is removable, including the last one. You have to be able to
   take the wrong name off before you put the right one on, and forcing a
   swap through "add then remove" is the kind of small cruelty that makes
   people stop using a tool. The requirement is that a project cannot be
   SAVED without an author, and that lives in validateProject().
   --------------------------------------------------------------------- */

export default function AuthorPicker({ people, selected, onChange, onAddPerson, now = Date.now() }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("resident");
  const [newPosition, setNewPosition] = useState("");

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return activePeople(people, now)
      .filter((p) => !selected.includes(p.id))
      .filter((p) => !t || p.display_name.toLowerCase().includes(t))
      .slice(0, 6);
  }, [q, people, selected, now]);

  const commitNew = () => {
    const name = newName.trim();
    if (!name) return;
    const person = onAddPerson(name, newRole, newPosition.trim());
    onChange([...selected, person.id]);
    setNewName(""); setNewPosition(""); setAdding(false); setQ("");
  };

  return (
    <div>
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
                onClick={() => onChange(selected.filter((s) => s !== id))}
                aria-label={`Remove ${p.display_name}`}
                className="hover:opacity-60"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        {selected.length === 0 && (
          <span className="text-xs" style={{ color: brand.alertText }}>
            No authors yet — you will need at least one before this can be saved.
          </span>
        )}
      </div>

      {!adding ? (
        <>
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a name…"
            aria-label="Search for an author"
          />
          {q.trim() && (
            <div className="mt-1 rounded-md overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange([...selected, p.id]); setQ(""); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center gap-3"
                  style={{ color: brand.navy }}
                >
                  <span>{p.display_name}</span>
                  <span className="text-xs text-right" style={{ color: brand.slate }}>{personSubtitle(p)}</span>
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
            <Button onClick={commitNew}><Check size={14} /> Add to roster</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
