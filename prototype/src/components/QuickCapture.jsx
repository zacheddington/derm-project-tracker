import React, { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { brand, TYPES } from "../lib/domain.js";
import { validateProject } from "../lib/projects.js";
import { Button, Field, Modal, TextInput, IdentifierNotice } from "./primitives.jsx";
import AuthorPicker from "./AuthorPicker.jsx";

/* ---------------------------------------------------------------------
   Quick capture — success criterion #1, a new idea recorded in under
   thirty seconds. Title, type, author. Nothing else is ever required.

   The author list starts EMPTY and is chosen deliberately. Defaulting it
   to whoever is signed in guesses wrong constantly: coordinators enter
   projects on behalf of residents, and a wrong author that arrives
   silently is worse than no author at all, because nobody notices it.

   The elapsed timer is an instrument for the thirty-second criterion,
   not a feature for the person typing.
   --------------------------------------------------------------------- */

export default function QuickCapture({ people, onCreate, onAddPerson, now = Date.now }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("case_report");
  const [authors, setAuthors] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [errors, setErrors] = useState(null);
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

  const reset = () => {
    setTitle(""); setType("case_report"); setAuthors([]); setErrors(null); setOpen(false);
  };

  const save = () => {
    const draft = { title, type, owners: authors, details: {} };
    const found = validateProject(draft, now());
    if (found.length) { setErrors(found); return; }
    onCreate({ title: title.trim(), type, owners: authors });
    reset();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-lg px-4 py-3.5 text-sm flex items-center gap-3 transition-colors hover:brightness-[0.98]"
        style={{
          background: brand.accentBg,
          border: `1px solid ${brand.accent}`,
          color: brand.accentText,
          fontWeight: 500,
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded-full shrink-0"
          style={{ background: brand.accent, color: "#fff", width: 22, height: 22 }}
        >
          <Plus size={14} />
        </span>
        Jot down a new project idea…
      </button>
    );
  }

  return (
    <div className="rounded-lg p-4" style={{ background: brand.surface, border: `1px solid ${brand.navy}` }}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold" style={{ color: brand.navy }}>New project</h2>
        <div className="flex items-center gap-3">
          <span
            className="text-xs tabular-nums"
            style={{ color: elapsed > 30 ? "#8A6A00" : brand.slate }}
            title="Time since you opened this form — an instrument for the 30-second capture target in the spec."
          >
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

      <Field label="Type" hint="Pick the closest one. It can be changed later without recreating the project.">
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

      <Field label="Author(s)">
        <AuthorPicker people={people} selected={authors} onChange={setAuthors} onAddPerson={onAddPerson} now={now()} />
      </Field>

      <div className="flex gap-2 items-center">
        <Button onClick={save}>Save project</Button>
        <span className="text-xs" style={{ color: brand.slate }}>
          Everything else can wait. Add detail whenever you come back to it.
        </span>
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
    </div>
  );
}
