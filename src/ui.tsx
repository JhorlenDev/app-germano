import { useId, type ReactNode } from "react";
import {
  X,
  LoaderCircle,
  ArrowUpRight,
  ChartNoAxesCombined,
} from "lucide-react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <ChartNoAxesCombined size={24} />
      </span>
      <div>
        <strong>
          G&M<span>Tributário</span>
        </strong>
        <small>INTELIGÊNCIA CONTÁBIL</small>
      </div>
    </div>
  );
}
export function Button({
  children,
  variant = "",
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button ${variant} ${props.className || ""}`}
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  hint,
  max,
  suffix,
  optional = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  max?: number;
  suffix?: string;
  optional?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="number-field">
        {!suffix && <span>R$</span>}
        <input
          type="number"
          aria-label={label}
          min="0"
          max={max}
          step="any"
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              optional && e.target.value === ""
                ? null
                : Math.max(0, Math.min(max ?? 1e12, Number(e.target.value))),
            )
          }
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </Field>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <ChartNoAxesCombined size={29} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const elements = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]',
              ),
            );
            const first = elements[0],
              last = elements.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="section-heading">
          <h2 id={id}>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            autoFocus
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  caption,
  primary = false,
  icon,
}: {
  label: string;
  value: string;
  caption: string;
  primary?: boolean;
  icon: ReactNode;
}) {
  return (
    <div className={`card stat ${primary ? "primary-stat" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon">{icon}</div>
      </div>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}
export const ExternalArrow = ArrowUpRight;
