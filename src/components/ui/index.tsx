"use client";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Search, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { initials } from "@/lib/format";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
export function Button({ variant = "primary", size = "md", icon: Icon, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: LucideIcon }) {
  return (
    <button
      {...p}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/30",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-rose-50 text-rose-600 hover:bg-rose-100",
        variant === "success" && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        className,
      )}
    >
      {Icon && <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {children}
    </button>
  );
}

/* ---------- Form fields ---------- */
export function Field({ label, required, error, hint, children, className }: { label?: string; required?: boolean; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}
/** Adds w-full unless the caller already set a width class. */
const withWidth = (c?: string) => (/(^|\s)w-/.test(c ?? "") ? c : ["w-full", c]);
const inputCls = "rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500";
export function Input({ icon: Icon, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon }) {
  if (!Icon) return <input {...p} className={clsx(inputCls, withWidth(className))} />;
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input {...p} className={clsx(inputCls, "w-full pl-10", className)} />
    </div>
  );
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={clsx(inputCls, "cursor-pointer pr-8", withWidth(className))}>{children}</select>;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={clsx(inputCls, "w-full resize-none", className)} />;
}
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
      <span
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={clsx("flex h-4 w-4 items-center justify-center rounded border transition", checked ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white")}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
      {label}
    </label>
  );
}

/* ---------- Layout bits ---------- */
export function Card({ className, children, title, action }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <div className={clsx("rounded-2xl border border-slate-100 bg-white shadow-sm", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
const tints = {
  violet: { bg: "bg-brand-50 border-brand-100", icon: "bg-brand-100 text-brand-600" },
  green: { bg: "bg-emerald-50/70 border-emerald-100", icon: "bg-emerald-100 text-emerald-600" },
  amber: { bg: "bg-amber-50/70 border-amber-100", icon: "bg-amber-100 text-amber-600" },
  pink: { bg: "bg-rose-50/70 border-rose-100", icon: "bg-rose-100 text-rose-500" },
  blue: { bg: "bg-sky-50/70 border-sky-100", icon: "bg-sky-100 text-sky-600" },
  white: { bg: "bg-white border-slate-100", icon: "bg-slate-100 text-slate-600" },
};
export function StatCard({ label, value, sub, icon: Icon, tint = "violet", badge }: { label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tint?: keyof typeof tints; badge?: ReactNode }) {
  return (
    <div className={clsx("flex items-start gap-4 rounded-2xl border p-5", tints[tint].bg)}>
      <div className={clsx("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tints[tint].icon)}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-600">{label}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="truncate text-2xl font-bold text-slate-900">{value}</span>
          {badge}
        </div>
        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

const badgeColors: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Present: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Late: "bg-amber-50 text-amber-700 ring-amber-200",
  "Half Day": "bg-sky-50 text-sky-700 ring-sky-200",
  "On Leave": "bg-brand-50 text-brand-700 ring-brand-200",
  Draft: "bg-slate-100 text-slate-600 ring-slate-200",
  Inactive: "bg-slate-100 text-slate-600 ring-slate-200",
  Rejected: "bg-rose-50 text-rose-600 ring-rose-200",
  Absent: "bg-rose-50 text-rose-600 ring-rose-200",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", badgeColors[status] ?? badgeColors.Draft)}>{status}</span>;
}

const avatarColors = ["bg-brand-100 text-brand-700", "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-600", "bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700"];
export function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  const c = avatarColors[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % avatarColors.length];
  if (src) return <img src={src} alt={name} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", c)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "-mb-px cursor-pointer whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition",
            value === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const done = i < current, active = i === current;
        return (
          <div key={s} className="relative flex flex-1 flex-col items-center">
            {i > 0 && <div className={clsx("absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2", i <= current ? "bg-brand-500" : "bg-slate-200")} />}
            <div
              className={clsx(
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold",
                done && "border-emerald-500 bg-emerald-500 text-white",
                active && "border-brand-600 bg-brand-600 text-white ring-4 ring-brand-100",
                !done && !active && "border-slate-300 bg-white text-slate-500",
              )}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
            </div>
            <span className={clsx("mt-2 text-center text-xs font-medium sm:text-sm", active ? "text-brand-700" : "text-slate-500")}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-7 w-7" />
      </div>
      <h4 className="font-semibold text-slate-800">{title}</h4>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- DataTable ---------- */
export interface Column<T> { key: string; header: ReactNode; render: (row: T) => ReactNode; className?: string; sortValue?: (row: T) => string | number }
export function DataTable<T extends { id: string }>({
  rows, columns, searchText, pageSize = 10, selectable, empty, toolbar, onRowClick,
}: {
  rows: T[]; columns: Column<T>[]; searchText?: (row: T) => string; pageSize?: number; selectable?: boolean;
  empty?: ReactNode; toolbar?: ReactNode; onRowClick?: (row: T) => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => (q && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(q.toLowerCase())) : rows), [rows, q, searchText]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const allSel = slice.length > 0 && slice.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      {(searchText || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-5">
          {searchText && (
            <div className="w-full sm:w-72">
              <Input icon={Search} placeholder="Search..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
          )}
          <div className="ml-auto flex flex-wrap gap-2">{toolbar}</div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              {selectable && (
                <th className="w-10 px-5 py-3">
                  <Checkbox checked={allSel} onChange={(v) => setSel((s) => { const n = new Set(s); slice.forEach((r) => (v ? n.add(r.id) : n.delete(r.id))); return n; })} />
                </th>
              )}
              {columns.map((c) => <th key={c.key} className={clsx("px-5 py-3", c.className)}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={clsx("border-b border-slate-50 transition hover:bg-brand-50/40", onRowClick && "cursor-pointer")}>
                {selectable && (
                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                )}
                {columns.map((c) => <td key={c.key} className={clsx("px-5 py-3 text-slate-700", c.className)}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (empty ?? <div className="py-12 text-center text-sm text-slate-400">No records found.</div>)}
      </div>
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-slate-500">
          <span>
            Showing {(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <PageBtn disabled={cur === 1} onClick={() => setPage(cur - 1)}><ChevronLeft className="h-4 w-4" /></PageBtn>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - cur) <= 1)
              .map((p, i, arr) => (
                <span key={p} className="flex items-center gap-1">
                  {i > 0 && p - arr[i - 1] > 1 && <span className="px-1">…</span>}
                  <PageBtn active={p === cur} onClick={() => setPage(p)}>{p}</PageBtn>
                </span>
              ))}
            <PageBtn disabled={cur === pages} onClick={() => setPage(cur + 1)}><ChevronRight className="h-4 w-4" /></PageBtn>
          </div>
        </div>
      )}
    </div>
  );
}
function PageBtn({ children, active, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...p}
      className={clsx(
        "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

export function IconBtn({ icon: Icon, label, onClick, tone = "default" }: { icon: LucideIcon; label: string; onClick: () => void; tone?: "default" | "danger" }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={clsx("cursor-pointer rounded-lg p-1.5 transition", tone === "danger" ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600" : "text-slate-400 hover:bg-brand-50 hover:text-brand-600")}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
      <Check className="h-4 w-4 text-emerald-400" /> {message}
    </div>
  );
}
