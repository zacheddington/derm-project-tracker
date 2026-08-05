import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { brand, STAFF_POSITIONS, needsExternalPosition } from "../lib/domain.js";
import { Button, Select, TextInput } from "./primitives.jsx";

/* ---------------------------------------------------------------------
   "Add someone to the roster", once.

   This form existed twice — in the author picker and in the roster panel
   — as the same markup, the same three pieces of state, and the same
   placeholder sentence typed out in full in both files. Two places to
   change a label, and two chances to change only one of them. The only
   real differences were the button's wording and whether it disabled
   itself on an empty name, so both are props.

   The form owns its own fields and reports what is in them through
   `onPendingChange`, the same way PersonRow reports a row mid-edit. That
   is what lets the roster still ask about a half-filled form when you
   close the panel, rather than dropping it silently.
   --------------------------------------------------------------------- */

export default function NewPersonForm({
  initialName = "",
  submitLabel = "Add",
  disableWhenEmpty = false,
  className = "",
  onCommit,
  onCancel,
  onPendingChange,
}) {
  const [name, setName] = useState(initialName);
  const [staffPosition, setStaffPosition] = useState("resident");
  const [externalPosition, setExternalPosition] = useState("");

  const trimmed = name.trim();

  const clear = () => { setName(""); setExternalPosition(""); };

  const commit = () => {
    if (!trimmed) return;
    onCommit(trimmed, staffPosition, externalPosition.trim());
    clear();
  };

  const discard = () => { clear(); onCancel?.(); };

  /* Tell the parent whether this form is holding an uncommitted entry,
     and how to resolve it either way. Unmounting clears the claim, so a
     form that goes away cannot leave a phantom "unsaved" behind. */
  useEffect(() => {
    onPendingChange?.(trimmed ? { name: trimmed, commit, discard } : null);
    return () => onPendingChange?.(null);
  }, [trimmed, staffPosition, externalPosition]);

  /* Enter commits, from the name box or the position box, rather than
     doing nothing at all. Handled explicitly rather than left to the
     browser's implicit-submission rules, which are conditional on the
     field count and the presence of a submit button — see the longer
     note in RosterPanel. `commit` ignores a blank name, so Enter on an
     empty form is a no-op rather than an error. */
  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    if (e.target.tagName === "BUTTON" || e.target.tagName === "TEXTAREA") return;
    e.preventDefault();
    commit();
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); commit(); }}
      onKeyDown={onKeyDown}
      className={`rounded-md p-3 ${className}`}
      style={{ border: `1px solid ${brand.border}`, background: brand.bg }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          aria-label="Full name"
        />
        <Select
          options={STAFF_POSITIONS}
          value={staffPosition}
          onChange={(e) => setStaffPosition(e.target.value)}
          aria-label="Role"
        />
      </div>
      {needsExternalPosition(staffPosition) && (
        <div className="mb-2">
          <TextInput
            value={externalPosition}
            onChange={(e) => setExternalPosition(e.target.value)}
            placeholder="Their position or role — e.g. Pathologist, Baptist Health"
            aria-label="Position or role"
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={disableWhenEmpty && !trimmed}>
          <Check size={14} /> {submitLabel}
        </Button>
        <Button variant="ghost" onClick={discard}>Cancel</Button>
      </div>
    </form>
  );
}
