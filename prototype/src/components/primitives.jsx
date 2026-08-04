import React, { useEffect, useId } from "react";
import { AlertTriangle, X } from "lucide-react";
import { brand, label, toneOf, scanForIdentifiers } from "../lib/domain.js";

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

export function Button({ variant = "primary", children, ...props }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md text-sm font-medium px-3.5 py-2 transition-colors focus:outline-none focus:ring-2 disabled:opacity-50";
  const styles = {
    primary: { background: brand.navy, color: "#fff" },
    secondary: { background: brand.surface, color: brand.navy, border: `1px solid ${brand.border}` },
    ghost: { background: "transparent", color: brand.slate },
    danger: { background: brand.alertText, color: "#fff" },
  }[variant];
  return <button {...props} className={base} style={styles}>{children}</button>;
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
