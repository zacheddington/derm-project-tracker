import React, { useState, useMemo, useEffect } from "react";
import { Plus, X } from "lucide-react";
import {
  brand, activePeople, personSubtitle, sortedByName,
} from "../lib/domain.js";
import { TextInput } from "./primitives.jsx";
import NewPersonForm from "./NewPersonForm.jsx";

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
  const [seedName, setSeedName] = useState("");
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sortedByName(activePeople(people, now))
      .filter((p) => !selected.includes(p.id))
      .filter((p) => !t || p.display_name.toLowerCase().includes(t))
      .slice(0, 6);
  }, [q, people, selected, now]);

  // A new search is a new list; keep the highlight on the top match rather
  // than wherever it happened to be for the previous one.
  useEffect(() => { setHighlight(0); }, [q]);

  const choose = (person) => { onChange([...selected, person.id]); setQ(""); };

  /* Two or three characters is usually enough to see the person you want,
     and at that point reaching for the mouse is the slow part. The top
     match is highlighted, Tab or Enter takes it, and the arrows move
     through the rest. Tab still moves focus onward when there is nothing
     to take, so keyboard navigation of the form is not hijacked. */
  const onSearchKeyDown = (e) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey && q.trim())) {
      e.preventDefault();
      choose(matches[highlight]);
    } else if (e.key === "Escape") {
      setQ("");
    }
  };

  /* A person added here is added to the project as well as to the
     roster — you opened this to name an author, not to do admin. */
  const commitNew = (name, staffPosition, externalPosition) => {
    const person = onAddPerson(name, staffPosition, externalPosition);
    onChange([...selected, person.id]);
    setAdding(false);
    setQ("");
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
            onKeyDown={onSearchKeyDown}
            placeholder="Type a name…"
            aria-label="Search for an author"
            role="combobox"
            aria-expanded={Boolean(q.trim() && matches.length)}
            aria-autocomplete="list"
          />
          {q.trim() && (
            <div className="mt-1 rounded-md overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
              {matches.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choose(p)}
                  onMouseEnter={() => setHighlight(i)}
                  aria-selected={i === highlight}
                  className="w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-3"
                  style={i === highlight
                    ? { color: brand.navy, background: "#E8EDF4" }
                    : { color: brand.navy, background: brand.surface }}
                >
                  <span>{p.display_name}</span>
                  <span className="text-xs text-right" style={{ color: brand.slate }}>{personSubtitle(p)}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setSeedName(q.trim()); setAdding(true); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-1.5"
                style={{ color: brand.navy, borderTop: `1px solid ${brand.border}` }}
              >
                <Plus size={13} /> Add “{q.trim()}” to the roster
              </button>
            </div>
          )}
        </>
      ) : (
        <NewPersonForm
          initialName={seedName}
          submitLabel="Add to roster"
          onCommit={commitNew}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
