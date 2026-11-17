"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Building2, CalendarDays, Check, CircleDollarSign, Download, Pencil, Plus, Save, Server, ShieldCheck, Trash2, Umbrella, X, type LucideIcon } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, Field, IconBtn, Input, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { useCurrentUser, useStore } from "@/lib/store";
import { COUNTRIES, findCountry } from "@/lib/countries";
import { fmtDate, uid } from "@/lib/format";
import type { Holiday, LeaveType, PayrollSettings, User } from "@/lib/types";

type Sec = "company" | "payroll" | "leave" | "holidays" | "roles" | "system";
const SECTIONS: { key: Sec; label: string; icon: LucideIcon }[] = [
  { key: "company", label: "Company Settings", icon: Building2 },
  { key: "payroll", label: "Payroll Configuration", icon: CircleDollarSign },
  { key: "leave", label: "Leave Types", icon: Umbrella },
  { key: "holidays", label: "Holidays", icon: CalendarDays },
  { key: "roles", label: "Roles & Permissions", icon: ShieldCheck },
  { key: "system", label: "System Settings", icon: Server },
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
          {sec === "roles" && <Roles show={show} />}
          {sec === "system" && <SystemSettings show={show} />}
        </div>
      </div>
      {toast}
    </div>
  );
}

type P = { show: (m: string) => void };

function CompanySettings({ show }: P) {
  const s = useStore();
  const [c, setC] = useState(s.company!);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  function onLogo(f?: File) {
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type) || f.size > 2 * 1024 * 1024) return setErr("Logo must be PNG/JPG, max 2MB.");
    const r = new FileReader();
    r.onload = () => { setC({ ...c, logo: r.result as string }); setErr(""); };
    r.readAsDataURL(f);
  }
  return (
    <Card title="Company Settings">
      <div className="grid gap-8 p-5 md:grid-cols-[160px_1fr]">
        <div className="flex flex-col items-center gap-3">
          {c.logo ? <img src={c.logo} alt="" className="h-28 w-28 rounded-full border border-slate-100 object-contain" /> : <Avatar name={c.name} size={112} />}
          <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}>Change Logo</Button>
          {c.logo && <button className="cursor-pointer text-xs text-rose-500" onClick={() => setC({ ...c, logo: undefined })}>Remove</button>}
          <input ref={ref} type="file" hidden accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} />
          {err && <p className="text-center text-xs text-rose-600">{err}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company Name" className="sm:col-span-2"><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
          <Field label="Business Email"><Input value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
          <Field label="Phone Number"><Input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></Field>
          <Field label="Country">
            <Select value={c.country} onChange={(e) => { const k = findCountry(e.target.value); setC({ ...c, country: k.name, currencyCode: k.code, currencySymbol: k.symbol, currencyName: k.currency }); }}>
              {COUNTRIES.map((k) => <option key={k.name} value={k.name}>{k.flag} {k.name}</option>)}
            </Select>
          </Field>
          <Field label="Currency"><Input disabled value={`${c.currencyCode} – ${c.currencyName}`} /></Field>
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 p-5">
        <Button icon={Save} onClick={() => {
          if (!c.name.trim()) return setErr("Company name is required.");
          s.saveCompany(c);
          s.log("settings", "Company settings updated", `${c.name} profile was updated.`);
          show("Changes saved");
        }}>Save Changes</Button>
      </div>
    </Card>
  );
}

function PayrollConfig({ show }: P) {
  const s = useStore();
  const [p, setP] = useState<PayrollSettings>(s.settings);
  const num = (k: keyof PayrollSettings) => ({ value: p[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: +e.target.value }) });
  return (
    <Card title="Payroll Configuration">
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="EPF – Employee contribution (%)"><Input type="number" step={0.5} min={0} {...num("epfEmployee")} /></Field>
        <Field label="EPF – Employer contribution (%)"><Input type="number" step={0.5} min={0} {...num("epfEmployer")} /></Field>
        <Field label="ETF – Employer contribution (%)"><Input type="number" step={0.5} min={0} {...num("etf")} /></Field>
        <Field label="Overtime rate (× hourly)" hint="Hourly rate = basic ÷ 240"><Input type="number" step={0.25} min={0} {...num("otRate")} /></Field>
        <Field label="Pay day (day of month)"><Input type="number" min={1} max={31} {...num("payDay")} /></Field>
        <p className="self-end rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 sm:col-span-2">Statutory calculations must be checked against current official rules before real payroll is processed. APIT/PAYE tax is not calculated in this MVP.</p>
      </div>
      <div className="flex justify-end border-t border-slate-100 p-5">
        <Button icon={Save} onClick={() => { s.saveSettings(p); s.log("settings", "Payroll configuration updated", `EPF ${p.epfEmployee}%/${p.epfEmployer}%, ETF ${p.etf}%.`); show("Payroll configuration saved"); }}>Save Changes</Button>
      </div>
    </Card>
  );
}

function LeaveTypes({ show }: P) {
  const s = useStore();
  const [edit, setEdit] = useState<LeaveType | null>(null);
  return (
    <Card title="Leave Types" action={<Button size="sm" icon={Plus} onClick={() => setEdit({ id: uid(), name: "", daysPerYear: 0, paid: true })}>Add</Button>}>
      <DataTable rows={s.leaveTypes} columns={[
        { key: "n", header: "Leave Type", render: (t) => <span className="font-medium">{t.name}</span> },
        { key: "d", header: "Days / Year", render: (t) => (t.paid ? t.daysPerYear : "Unlimited") },
        { key: "p", header: "Paid", render: (t) => (t.paid ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-400" />) },
        { key: "a", header: "", className: "text-right", render: (t) => (<>
          <IconBtn icon={Pencil} label="Edit" onClick={() => setEdit(t)} />
          <IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => s.leaveRequests.some((l) => l.leaveTypeId === t.id) ? show("In use by leave requests") : confirm("Delete leave type?") && s.remove("leaveTypes", t.id)} />
        </>) },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Leave Type" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={!edit?.name.trim()} onClick={() => { s.upsert("leaveTypes", edit!); setEdit(null); show("Leave type saved"); }}>Save</Button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required className="sm:col-span-2"><Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Days per year"><Input type="number" min={0} value={edit.daysPerYear} disabled={!edit.paid} onChange={(e) => setEdit({ ...edit, daysPerYear: +e.target.value })} /></Field>
            <Field label="Type"><Select value={edit.paid ? "paid" : "unpaid"} onChange={(e) => setEdit({ ...edit, paid: e.target.value === "paid" })}><option value="paid">Paid</option><option value="unpaid">Unpaid (no-pay deduction)</option></Select></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Holidays({ show }: P) {
  const s = useStore();
  const [edit, setEdit] = useState<Holiday | null>(null);
  const rows = [...s.holidays].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card title="Holiday Calendar" action={<Button size="sm" icon={Plus} onClick={() => setEdit({ id: uid(), name: "", date: "" })}>Add Holiday</Button>}>
      <DataTable rows={rows} empty={<EmptyState icon={CalendarDays} title="No holidays" text="Add public and mercantile holidays. They are excluded from leave days." />} columns={[
        { key: "d", header: "Date", render: (h) => fmtDate(h.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) },
        { key: "n", header: "Holiday", render: (h) => <span className="font-medium">{h.name}</span> },
        { key: "a", header: "", className: "text-right", render: (h) => (<><IconBtn icon={Pencil} label="Edit" onClick={() => setEdit(h)} /><IconBtn icon={Trash2} tone="danger" label="Delete" onClick={() => s.remove("holidays", h.id)} /></>) },
      ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Holiday" footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={!edit?.name.trim() || !edit?.date} onClick={() => { s.upsert("holidays", edit!); setEdit(null); show("Holiday saved"); }}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Holiday Name" required><Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Date" required><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

const PERMS: [string, boolean, boolean, boolean][] = [
  ["View dashboard", true, true, true],
  ["Manage employees", true, true, false],
  ["Attendance & shifts", true, true, false],
  ["Approve leave", true, true, false],
  ["Salary structures", true, false, false],
  ["Process & approve payroll", true, false, false],
  ["View reports", true, true, true],
  ["Company & system settings", true, false, false],
];

function Roles({ show }: P) {
  const s = useStore();
  const me = useCurrentUser();
  return (
    <div className="space-y-6">
      <Card title="Users">
        <DataTable rows={s.users} columns={[
          { key: "n", header: "User", render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size={32} /><div><div className="font-medium">{u.name}</div><div className="text-xs text-slate-400">{u.email}</div></div></div> },
          { key: "r", header: "Role", render: (u) => (
            <Select className="w-44 py-1.5" value={u.role} disabled={u.id === me?.id} onChange={(e) => { s.upsert("users", { ...u, role: e.target.value as User["role"] }); show("Role updated"); }}>
              <option>Administrator</option><option>HR Manager</option><option>Viewer</option>
            </Select>
          ) },
        ]} />
        <p className="px-5 pb-5 text-xs text-slate-500">New users register from the sign-up page. Role enforcement is applied when the backend and row-level security are connected.</p>
      </Card>
      <Card title="Permission Matrix">
        <div className="overflow-x-auto p-5">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2">Permission</th><th>Administrator</th><th>HR Manager</th><th>Viewer</th></tr></thead>
            <tbody>
              {PERMS.map(([p, ...r]) => (
                <tr key={p} className="border-t border-slate-100">
                  <td className="py-2.5 text-slate-700">{p}</td>
                  {r.map((v, i) => <td key={i}>{v ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-300" />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SystemSettings({ show }: P) {
  const s = useStore();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);
  const [typed, setTyped] = useState("");
  function exportData() {
    const raw = localStorage.getItem("hr-payroll-store") ?? "{}";
    const data = JSON.parse(raw);
    if (data.state?.users) data.state.users = data.state.users.map((u: User) => ({ ...u, password: undefined }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hr-payroll-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    show("Backup downloaded");
  }
  return (
    <div className="space-y-6">
      <Card title="Data">
        <div className="space-y-4 p-5 text-sm text-slate-600">
          <p>This MVP stores data in this browser only. Records: {s.employees.length} employees, {s.attendance.length} attendance entries, {s.leaveRequests.length} leave requests, {s.payrollRuns.length} payroll runs.</p>
          <Button variant="secondary" icon={Download} onClick={exportData}>Export backup (JSON)</Button>
        </div>
      </Card>
      <Card title="Danger zone">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-slate-600">Delete all company data, users and settings from this browser.</p>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmReset(true)}>Reset all data</Button>
        </div>
      </Card>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all data?" footer={
        <><Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button variant="danger" disabled={typed !== "RESET"} onClick={() => { s.resetAll(); router.replace("/register"); }}>Delete everything</Button></>
      }>
        <p className="mb-3 text-sm text-slate-600">This permanently deletes every record and cannot be undone. Type <b>RESET</b> to confirm.</p>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Modal>
    </div>
  );
}
