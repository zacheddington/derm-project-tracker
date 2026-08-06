import React, { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { brand, TYPES } from "../lib/domain.js";
import { validateProject } from "../lib/projects.js";
import { Button, ChoiceButtons, Field, Modal, TextInput } from "./primitives.jsx";
import AuthorPicker from "./AuthorPicker.jsx";

/* ---------------------------------------------------------------------
   Quick capture — success criterion #1, a new idea recorded in under
   thirty seconds. Title, type, author. Nothing else is ever required.

   The author list starts EMPTY and is chosen deliberately. Defaulting it
   to whoever is signed in guesses wrong constantly: coordinators enter
   projects on behalf of residents, and a wrong author that arrives
   silently is worse than no author at all, because nobody notices it.

   There is deliberately no elapsed-time counter. One existed to measure
   the thirty-second target while the design was being judged; it was an
   instrument, not information anyone could act on, and putting a running
   stopwatch on someone recording a case report is the wrong thing to
   show them. Measure the target in usability testing instead.
   --------------------------------------------------------------------- */

export default function QuickCapture({ people, onCreate, onAddPerson, now = Date.now }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("case_report");
  const [authors, setAuthors] = useState([]);
  const [errors, setErrors] = useState(null);
  const titleRef = useRef(null);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  const reset = () => {
    setTitle(""); setType("case_report"); setAuthors([]); setErrors(null); setOpen(false);
  };

  /* The draft and the payload both use `project_type`, because that is
     what validateProject reads and what the app stores. A local shorthand
     here meant the type-specific validation never ran and the created
     project had no type the rest of the app could see. */
  const save = () => {
    const draft = { title, project_type: type, authors, details: {} };
    const found = validateProject(draft, now());
    if (found.length) { setErrors(found); return; }
    onCreate({ title: title.trim(), project_type: type, authors });
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
        <button onClick={reset} aria-label="Cancel"><X size={16} style={{ color: brand.slate }} /></button>
      </div>

      <Field label="Title">
        <TextInput
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) save(); }}
          placeholder="e.g. Disseminated gonococcal rash"
        />
      </Field>

      <Field group label="Type" hint="Pick the closest one. It can be changed later without recreating the project.">
        <ChoiceButtons options={TYPES} value={type} onChange={setType} />
      </Field>

      <Field group label="Author(s)">
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
