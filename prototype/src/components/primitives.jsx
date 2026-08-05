import React, { useEffect, useId } from "react";
import { AlertTriangle, X } from "lucide-react";
import { brand, label, toneOf, scanForIdentifiers } from "../lib/domain.js";
import { maskDateInput, isoToDisplayDate, dateEntryState } from "../lib/projects.js";

export function Badge({ list, code, small }) {
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

/* A labelled field.

   `group` is not cosmetic. A <label> may be associated with exactly ONE
   form control; wrapping several in one label is invalid HTML, and the
   accessible-name algorithm then hands EVERY control inside it the
   label's whole text. The four project-type buttons were announcing
   themselves as "Type QA/QI Research Review Set the wrong one on
   capture?…" instead of "Case report" — indistinguishable from each
   other to anyone using a screen reader.

   So: a single control keeps the implicit <label> association, and
   anything holding several controls becomes a labelled group instead,
   leaving each control its own name. Pass `group` whenever the children
   are more than one focusable thing. */
export function Field({ label: lbl, children, hint, group = false }) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;

  const labelText = (
    <span
      id={group ? labelId : undefined}
      className="block text-xs font-semibold tracking-wide uppercase mb-1.5"
      style={{ color: brand.slate }}
    >
      {lbl}
    </span>
  );
  const hintText = hint && (
    <span id={group ? hintId : undefined} className="block text-xs mt-1" style={{ color: brand.slate }}>
      {hint}
    </span>
  );

  if (group) {
    return (
      <div
        className="block mb-4"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
      >
        {labelText}
        {children}
        {hintText}
      </div>
    );
  }

  return (
    <label className="block mb-4">
      {labelText}
      {children}
      {hintText}
    </label>
  );
}

export const inputStyle = {
  border: `1px solid ${brand.border}`,
  background: brand.surface,
  color: brand.navy,
};

export const TextInput = React.forwardRef(function TextInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={`w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ${props.className || ""}`}
      style={{ ...inputStyle, ...(props.style || {}) }}
    />
  );
});

/* A date box you can just type into.

   `<input type="date">` steps you through month, then day, then year, and
   resists anyone typing straight through — you cannot paste, and the
   segment order is whatever the browser locale decided. This is a plain
   text field that accepts digits and inserts the slashes itself, so
   08/04/2026 is eight keystrokes and nothing else.

   The VALUE stays ISO (yyyy-mm-dd) in and out, because that is what the
   database stores and what sorts correctly. Only what you see is
   MM/DD/YYYY. A half-typed date reads as empty rather than as a wrong
   date, so nothing partial is ever committed. */
export function DateInput({ value, onChange, onStateChange, now = Date.now(), ...props }) {
  const [text, setText] = React.useState(() => isoToDisplayDate(value));

  // Follow the value when it changes underneath us — a different project
  // opened, a draft reset — but never while the field is being typed in.
  const lastIso = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastIso.current) {
      lastIso.current = value;
      setText(isoToDisplayDate(value));
    }
  }, [value]);

  const state = dateEntryState(text, now);

  const handle = (e) => {
    const masked = maskDateInput(e.target.value);
    setText(masked);
    const next = dateEntryState(masked, now);
    const iso = next.iso ?? "";
    lastIso.current = iso;
    onChange?.(iso);
    // A partial or absurd entry stores nothing, so the owner of the form
    // has to hear about it separately or the typing just disappears.
    onStateChange?.(next);
  };

  const bad = Boolean(state.problem);

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="MM/DD/YYYY"
      maxLength={10}
      value={text}
      onChange={handle}
      aria-invalid={bad || undefined}
      className="w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2"
      /* One `border` shorthand, never shorthand plus `borderColor`.
         Layering the longhand over `inputStyle`'s shorthand made React
         warn, and the two can disagree when the flag flips back: the
         longhand is removed while the shorthand is not re-applied, so a
         box could keep its red edge after the date was corrected. */
      style={{ ...inputStyle, border: `1px solid ${bad ? brand.alertText : brand.border}` }}
    />
  );
}

/* --------------------- one unsaved-changes dialog ---------------------- */

/* Used by the project panel and the roster alike.

   These were two copies of the same dialog with the same three buttons
   and slightly different words, which is two places to fix anything and
   two chances to fix only one of them. Anything that is the same thing
   twice belongs here. */
export function UnsavedChangesDialog({
  what,                      // "this project", "Rae LeBlanc"
  onSave,
  onDiscard,
  onKeepEditing,
  saveDisabled = false,
}) {
  return (
    <Modal
      title="You have unsaved changes"
      tone="danger"
      onClose={onKeepEditing}
      actions={
        <>
          <Button variant="ghost" onClick={onKeepEditing}>Keep editing</Button>
          <Button variant="danger" onClick={onDiscard}>Discard</Button>
          <Button onClick={onSave} disabled={saveDisabled}>Save now</Button>
        </>
      }
    >
      Save your changes to {what}, keep editing, or discard them.
    </Modal>
  );
}

/* A row of buttons where exactly one is chosen.

   This was the project-type picker, written out twice — once in the
   capture form and once in the detail panel — as the same markup with
   the same two style objects. The only thing that differed was which
   value counted as selected, and that is a prop.

   `aria-pressed` is what tells a screen reader which one is chosen.
   Without it the selection exists only as a background colour, which is
   exactly the kind of thing §10 of the spec means by "accessibility will
   be asked about".

   Always goes inside a `Field group`: several controls cannot share one
   implicit <label> without every one of them inheriting its whole text. */
export function ChoiceButtons({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.code}
          type="button"
          onClick={() => onChange(o.code)}
          aria-pressed={value === o.code}
          className="rounded-md px-3 py-1.5 text-sm"
          style={value === o.code
            ? { background: brand.navy, color: "#fff" }
            : { background: brand.surface, color: brand.slate, border: `1px solid ${brand.border}` }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ options, ...props }) {
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

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className="w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 leading-relaxed"
      style={inputStyle}
    />
  );
}

/* `type` defaults to "button", not to the HTML default of "submit".

   A bare <button> inside a <form> submits it. That makes Cancel — and
   every other secondary action that happens to sit in a form — save the
   thing the person was trying to abandon. Forms opt in explicitly with
   `type="submit"` on the one button that means it. */
export function Button({ variant = "primary", type = "button", children, ...props }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md text-sm font-medium px-3.5 py-2 transition-colors focus:outline-none focus:ring-2 disabled:opacity-50";
  const styles = {
    primary: { background: brand.navy, color: "#fff" },
    secondary: { background: brand.surface, color: brand.navy, border: `1px solid ${brand.border}` },
    ghost: { background: "transparent", color: brand.slate },
    danger: { background: brand.alertText, color: "#fff" },
  }[variant];
  return <button {...props} type={type} className={base} style={styles}>{children}</button>;
}

/* --------------------------------- modal -------------------------------- */

/* One dialog for every "are you sure" and every refusal. Escape closes it,
   because a modal you cannot dismiss with the keyboard is a trap. */
export function Modal({ title, children, onClose, actions, tone = "normal" }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0" style={{ background: "rgba(11,37,69,0.45)" }} onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-lg p-5"
        style={{ background: brand.surface, border: `1px solid ${brand.border}`, boxShadow: "0 12px 32px rgba(11,37,69,0.18)" }}
      >
        <div className="flex items-start gap-2.5 mb-2">
          {tone === "danger" && <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: brand.alertText }} aria-hidden="true" />}
          <h2 className="text-base font-semibold" style={{ color: tone === "danger" ? brand.alertText : brand.navy }}>
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto shrink-0">
            <X size={18} style={{ color: brand.slate }} />
          </button>
        </div>
        <div className="text-sm leading-relaxed mb-4" style={{ color: brand.slate }}>{children}</div>
        <div className="flex gap-2 justify-end">{actions}</div>
      </div>
    </div>
  );
}

/* --------------------------- identifier notice -------------------------- */

export function IdentifierNotice({ text }) {
  const hit = scanForIdentifiers(text);
  if (!hit) return null;
  return (
    <div
      className="flex gap-2 items-start rounded-md px-3 py-2 mt-1.5 text-xs"
      style={{ background: brand.warnBg, border: `1px solid ${brand.warnBorder}`, color: brand.warnText }}
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
