"use client";
import clsx from "clsx";
import { useRef, useState } from "react";
import { Building2, CalendarDays, Check, CircleDollarSign, Pencil, Plus, Save, Server, ShieldCheck, Trash2, Umbrella, X, type LucideIcon } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, Field, IconBtn, Input, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { useCan, useStore } from "@/lib/store";
import { RolesSettings } from "@/components/settings/RolesSettings";
import { removeLogo, saveCompany, uploadLogo } from "@/lib/api/hr";
import { deleteHoliday, deleteLeaveType, saveHoliday, saveLeaveType, savePayrollSettings } from "@/lib/api/payroll";
import { errorMessage } from "@/lib/api/client";
import { COUNTRIES, findCountry } from "@/lib/countries";
import { fmtDate, uid } from "@/lib/format";
import type { Holiday, LeaveType, PayrollSettings } from "@/lib/types";

type Sec = "company" | "payroll" | "leave" | "holidays" | "roles" | "system";
const SECTIONS: { key: Sec; label: string; icon: LucideIcon }[] = [
  { key: "company", label: "Company Settings", icon: Building2 },
  { key: "payroll", label: "Payroll Configuration", icon: CircleDollarSign },
  { key: "leave", label: "Leave Types", icon: Umbrella },
  { key: "holidays", label: "Holidays", icon: CalendarDays },
  { key: "roles", label: "Roles & Permissions", icon: ShieldCheck },
  { key: "system", label: "Data & Security", icon: Server },
];

export default function SettingsPage() {
  const [sec, setSec] = useState<Sec>("company");
  const [toast, show] = useToast();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm lg:flex-col">
          {SECTIONS.map((x) => (
            <button key={x.key} onClick={() => setSec(x.key)} className={clsx(
              "flex shrink-0 cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition",
              sec === x.key ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50",
            )}>
              <x.icon className="h-4 w-4" /> {x.label}
            </button>
          ))}
        </nav>
        <div>
          {sec === "company" && <CompanySettings show={show} />}
          {sec === "payroll" && <PayrollConfig show={show} />}
          {sec === "leave" && <LeaveTypes show={show} />}
          {sec === "holidays" && <Holidays show={show} />}
          {sec === "roles" && <RolesSettings show={show} />}
          {sec === "system" && <SystemSettings />}
        </div>
      </div>
      {toast}
    </div>
  );
}

type P = { show: (m: string) => void };

function CompanySettings({ show }: P) {
  const s = useStore();
  const can = useCan();
  const [c, setC] = useState(s.company!);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function onLogo(f?: File) {
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type) || f.size > 2 * 1024 * 1024) return setErr("Logo must be PNG/JPG, max 2MB.");
    setErr("");
    try {
      const logo = await uploadLogo(f);
      setC((x) => ({ ...x, logo }));
      show("Logo updated");
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  async function dropLogo() {
    try {
      await removeLogo();
      setC((x) => ({ ...x, logo: undefined }));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }
  async function save() {
    if (!c.name.trim()) return setErr("Company name is required.");
    setBusy(true);
    try {
      const saved = await saveCompany(c);
      setC(saved);
      setErr("");
      show("Changes saved");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Company Settings">
      <div className="grid gap-8 p-5 md:grid-cols-[160px_1fr]">
        <div className="flex flex-col items-center gap-3">
          {c.logo ? <img src={c.logo} alt="" className="h-28 w-28 rounded-full border border-slate-100 object-contain" /> : <Avatar name={c.name} size={112} />}
          {can.admin && <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}>Change Logo</Button>}
          {can.admin && c.logo && <button className="cursor-pointer text-xs text-rose-500" onClick={dropLogo}>Remove</button>}
          <input ref={ref} type="file" hidden accept="image/png,image/jpeg" onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</p>}
          <Field label="Company Name" className="sm:col-span-2"><Input maxLength={120} disabled={!can.admin} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
          <Field label="Business Email"><Input maxLength={254} disabled={!can.admin} value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
          <Field label="Phone Number"><Input maxLength={20} disabled={!can.admin} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea maxLength={500} disabled={!can.admin} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></Field>
          <Field label="Country">
            <Select value={c.country} disabled={!can.admin} onChange={(e) => { const k = findCountry(e.target.value); setC({ ...c, country: k.name, currencyCode: k.code, currencySymbol: k.symbol, currencyName: k.currency }); }}>
              {COUNTRIES.map((k) => <option key={k.name} value={k.name}>{k.flag} {k.name}</option>)}
            </Select>
          </Field>
          <Field label="Currency"><Input disabled value={`${c.currencyCode} – ${c.currencyName}`} /></Field>
        </div>
      </div>
      {can.admin && (
        <div className="flex justify-end border-t border-slate-100 p-5">
          <Button icon={Save} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Button>
        </div>
      )}
    </Card>
  );
}

function PayrollConfig({ show }: P) {
  const s = useStore();
  const can = useCan();
  const [p, setP] = useState<PayrollSettings>(s.settings);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const num = (k: keyof PayrollSettings) => ({
    value: Number.isFinite(p[k]) ? p[k] : "",
    disabled: !can.admin,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value === "" ? NaN : +e.target.value }),
  });
  async function save() {
    setBusy(true);
    try {
      setP(await savePayrollSettings(p));
      setErr("");
      show("Payroll configuration saved");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Payroll Configuration">
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</p>}
        <Field label="EPF – Employee contribution (%)"><Input type="number" step={0.5} min={0} max={100} {...num("epfEmployee")} /></Field>
        <Field label="EPF – Employer contribution (%)"><Input type="number" step={0.5} min={0} max={100} {...num("epfEmployer")} /></Field>
        <Field label="ETF – Employer contribution (%)"><Input type="number" step={0.5} min={0} max={100} {...num("etf")} /></Field>
        <Field label="Pay day (day of month)" hint="Months with fewer days pay on their last day."><Input type="number" min={1} max={31} {...num("payDay")} /></Field>
        <Field label="Overtime rate (× hourly)"><Input type="number" step={0.25} min={0} max={10} {...num("otRate")} /></Field>
        <Field label="Overtime hours divisor" hint={`Hourly rate = basic ÷ ${p.otHoursDivisor || "?"}`}><Input type="number" min={1} max={744} {...num("otHoursDivisor")} /></Field>
        <Field label="No-pay days divisor" hint={`Daily rate = basic ÷ ${p.nopayDaysDivisor || "?"}`}><Input type="number" min={1} max={31} {...num("nopayDaysDivisor")} /></Field>
        <p className="self-end rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 sm:col-span-2">Statutory calculations must be checked against current official rules before real payroll is processed. APIT/PAYE tax is not calculated. Approved payroll runs keep the rates they were calculated with.</p>
      </div>
      {can.admin && (
        <div className="flex justify-end border-t border-slate-100 p-5">
          <Button icon={Save} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Changes"}</Button>
        </div>
      )}
    </Card>
  );
}

function LeaveTypes({ show }: P) {
  const s = useStore();
  const can = useCan();
  const [edit, setEdit] = useState<LeaveType | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await saveLeaveType(edit!);
      setEdit(null);
      show("Leave type saved");
    } catch (e) {
      show(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(t: LeaveType) {
    if (s.leaveRequests.some((l) => l.leaveTypeId === t.id)) return show("In use by leave requests");
    if (!confirm("Delete leave type?")) return;
    try {
      await deleteLeaveType(t.id);
    } catch (e) {
      show(errorMessage(e));
    }
  }
  return (
    <Card title="Leave Types" action={can.manageHR ? <Button size="sm" icon={Plus} onClick={() => setEdit({ id: uid(), name: "", daysPerYear: 0, paid: true })}>Add</Button> : undefined}>
      <DataTable rows={s.leaveTypes} columns={[
        { key: "n", header: "Leave Type", render: (t) => <span className="font-medium">{t.name}</span> },
        { key: "d", header: "Days / Year", render: (t) => (t.paid ? t.daysPerYear : "Unlimited") },
        { key: "p", header: "Paid", render: (t) => (t.paid ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-400" />) },
        { key: "a", header: "", className: "text-right", render: (t) => can.manageHR && (<>
          <IconBtn icon={Pencil} label="Edit" onClick={() => setEdit(t)} />
          <IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => remove(t)} />
        </>) },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Leave Type" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={!edit?.name.trim() || busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required className="sm:col-span-2"><Input autoFocus maxLength={60} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Days per year" hint="Whole or half days."><Input type="number" min={0} max={366} step={0.5} value={edit.daysPerYear} disabled={!edit.paid} onChange={(e) => setEdit({ ...edit, daysPerYear: +e.target.value })} /></Field>
            <Field label="Type"><Select value={edit.paid ? "paid" : "unpaid"} onChange={(e) => setEdit({ ...edit, paid: e.target.value === "paid" })}><option value="paid">Paid</option><option value="unpaid">Unpaid (no-pay deduction)</option></Select></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Holidays({ show }: P) {
  const s = useStore();
  const can = useCan();
  const [edit, setEdit] = useState<Holiday | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = [...s.holidays].sort((a, b) => a.date.localeCompare(b.date));
  async function save() {
    setBusy(true);
    try {
      await saveHoliday(edit!);
      setEdit(null);
      show("Holiday saved");
    } catch (e) {
      show(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(h: Holiday) {
    if (!confirm(`Delete ${h.name}?`)) return;
    try {
      await deleteHoliday(h.id);
    } catch (e) {
      show(errorMessage(e));
    }
  }
  return (
    <Card title="Holiday Calendar" action={can.manageHR ? <Button size="sm" icon={Plus} onClick={() => setEdit({ id: uid(), name: "", date: "" })}>Add Holiday</Button> : undefined}>
      <DataTable rows={rows} empty={<EmptyState icon={CalendarDays} title="No holidays" text="Add public and mercantile holidays. They are excluded from leave and no-pay days." />} columns={[
        { key: "d", header: "Date", render: (h) => fmtDate(h.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) },
        { key: "n", header: "Holiday", render: (h) => <span className="font-medium">{h.name}</span> },
        { key: "a", header: "", className: "text-right", render: (h) => can.manageHR && (<><IconBtn icon={Pencil} label="Edit" onClick={() => setEdit(h)} /><IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => remove(h)} /></>) },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Holiday" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={!edit?.name.trim() || !edit?.date || busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button></>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Holiday Name" required><Input autoFocus maxLength={80} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Date" required><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function SystemSettings() {
  const s = useStore();
  return (
    <Card title="Data & Security">
      <div className="space-y-3 p-5 text-sm text-slate-600">
        <p>All company data is stored in the database ({s.employees.length} employees, {s.leaveRequests.length} leave requests, {s.payrollRuns.length} payroll runs). Nothing is kept in this browser after you sign out.</p>
        <p>Each company can only see its own records. This is enforced by the database itself (row-level security), not just by the app.</p>
        <p>Backups and point-in-time recovery are managed in the Supabase dashboard. Use Reports to export data as CSV.</p>
      </div>
    </Card>
  );
}
