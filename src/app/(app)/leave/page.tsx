"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Plus, Umbrella, X } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select, StatusBadge, Tabs, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { empName, useStore } from "@/lib/store";
import { daysBetween, fmtDate, today, uid } from "@/lib/format";
import { leaveBalances } from "@/lib/leave";
import type { LeaveRequest } from "@/lib/types";

type Tab = "All" | "Pending" | "Approved" | "Rejected" | "balances";

export default function LeavePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "All";
  const s = useStore();
  const [toast, show] = useToast();
  const [form, setForm] = useState<LeaveRequest | null>(null);
  const [err, setErr] = useState("");

  const sorted = useMemo(() => [...s.leaveRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [s.leaveRequests]);
  const rows = tab === "All" || tab === "balances" ? sorted : sorted.filter((l) => l.status === tab);
  const n = (st: string) => s.leaveRequests.filter((l) => l.status === st).length;
  const emp = (id: string) => s.employees.find((e) => e.id === id);
  const ltName = (id: string) => s.leaveTypes.find((t) => t.id === id)?.name ?? "—";

  function newRequest() {
    setErr("");
    setForm({ id: uid(), employeeId: "", leaveTypeId: s.leaveTypes[0]?.id ?? "", from: today(), to: today(), days: 1, reason: "", status: "Pending", createdAt: new Date().toISOString() });
  }
  function workingDays(from: string, to: string) {
    const holidays = new Set(s.holidays.map((h) => h.date));
    let c = 0;
    const total = daysBetween(from, to);
    for (let i = 0; i < total; i++) {
      const d = new Date(from + "T00:00:00");
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (d.getDay() !== 0 && !holidays.has(iso)) c++;
    }
    return c;
  }
  function submit() {
    const f = form!;
    if (!f.employeeId) return setErr("Select an employee.");
    if (!f.leaveTypeId) return setErr("Select a leave type.");
    if (f.to < f.from) return setErr("End date must be on or after the start date.");
    if (f.days <= 0) return setErr("The selected range has no working days.");
    const overlap = s.leaveRequests.some((l) => l.employeeId === f.employeeId && l.status !== "Rejected" && l.from <= f.to && l.to >= f.from);
    if (overlap) return setErr("This employee already has leave in that period.");
    const bal = leaveBalances(f.employeeId, s.leaveTypes, s.leaveRequests).find((b) => b.type.id === f.leaveTypeId);
    if (bal && bal.type.paid && f.days > bal.remaining - bal.pending) return setErr(`Insufficient balance: ${bal.remaining - bal.pending} day(s) available.`);
    s.upsert("leaveRequests", f);
    show("Leave request submitted");
    setForm(null);
  }
  function decide(l: LeaveRequest, status: "Approved" | "Rejected") {
    s.upsert("leaveRequests", { ...l, status });
    s.log("leave", `Leave ${status.toLowerCase()}`, `Leave request from ${empName(emp(l.employeeId))} (${fmtDate(l.from, { month: "short", day: "numeric" })} – ${fmtDate(l.to, { month: "short", day: "numeric" })}) ${status.toLowerCase()}.`);
    show(`Leave ${status.toLowerCase()}`);
  }

  const active = s.employees.filter((e) => e.status === "Active");

  return (
    <div>
      <PageHeader title="Leave Requests" subtitle="Requests, approvals and balances." actions={<Button icon={Plus} onClick={newRequest}>New Leave Request</Button>} />
      <Card>
        <div className="px-5 pt-2">
          <Tabs<Tab> value={tab} onChange={(t) => router.replace(t === "All" ? "/leave" : `/leave?tab=${t}`)} tabs={[
            { value: "All", label: "All" }, { value: "Pending", label: `Pending (${n("Pending")})` }, { value: "Approved", label: "Approved" },
            { value: "Rejected", label: "Rejected" }, { value: "balances", label: "Balances" },
          ]} />
        </div>
        {tab === "balances" ? (
          <DataTable rows={active} searchText={(e) => `${e.empNo} ${empName(e)}`}
            empty={<EmptyState icon={Umbrella} title="No employees" />}
            columns={[
              { key: "e", header: "Employee", render: (e) => <div className="flex items-center gap-3"><Avatar name={empName(e)} size={32} />{empName(e)}</div> },
              ...s.leaveTypes.filter((t) => t.paid).map((t) => ({
                key: t.id, header: t.name, render: (e: (typeof active)[number]) => {
                  const b = leaveBalances(e.id, s.leaveTypes, s.leaveRequests).find((x) => x.type.id === t.id)!;
                  return <span><b>{b.remaining}</b><span className="text-slate-400"> / {b.entitled}</span></span>;
                },
              })),
            ]} />
        ) : (
          <DataTable rows={rows} searchText={(l) => `${empName(emp(l.employeeId))} ${ltName(l.leaveTypeId)}`}
            empty={<EmptyState icon={Umbrella} title="No leave requests" text={tab === "All" ? "Create a leave request for an employee." : `No ${tab.toLowerCase()} requests.`} />}
            columns={[
              { key: "e", header: "Employee", render: (l) => <div className="flex items-center gap-3"><Avatar name={empName(emp(l.employeeId))} size={32} /><span className="font-medium text-slate-800">{empName(emp(l.employeeId))}</span></div> },
              { key: "t", header: "Leave Type", render: (l) => ltName(l.leaveTypeId) },
              { key: "f", header: "From", render: (l) => fmtDate(l.from) },
              { key: "to", header: "To", render: (l) => fmtDate(l.to) },
              { key: "d", header: "Days", render: (l) => <b>{l.days}</b> },
              { key: "r", header: "Reason", render: (l) => <span className="line-clamp-1 max-w-48 text-slate-500">{l.reason || "—"}</span> },
              { key: "s", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
              { key: "a", header: "", className: "text-right", render: (l) => l.status === "Pending" ? (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="success" icon={Check} onClick={() => decide(l, "Approved")}>Approve</Button>
                  <Button size="sm" variant="danger" icon={X} onClick={() => decide(l, "Rejected")}>Reject</Button>
                </div>
              ) : null },
            ]} />
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="New Leave Request" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={submit}>Submit Request</Button></>}>
        {form && (() => {
          const up = (p: Partial<LeaveRequest>) => {
            const f = { ...form, ...p };
            setForm({ ...f, days: f.to >= f.from ? workingDays(f.from, f.to) : 0 });
          };
          const bal = form.employeeId ? leaveBalances(form.employeeId, s.leaveTypes, s.leaveRequests).find((b) => b.type.id === form.leaveTypeId) : null;
          return (
            <div className="grid gap-4 sm:grid-cols-2">
              {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</p>}
              <Field label="Employee" required className="sm:col-span-2">
                <Select value={form.employeeId} onChange={(e) => up({ employeeId: e.target.value })}>
                  <option value="">Select employee</option>
                  {active.map((e) => <option key={e.id} value={e.id}>{e.empNo} · {empName(e)}</option>)}
                </Select>
              </Field>
              <Field label="Leave Type" required className="sm:col-span-2" hint={bal && bal.type.paid ? `Balance: ${bal.remaining} day(s), ${bal.pending} pending` : undefined}>
                <Select value={form.leaveTypeId} onChange={(e) => up({ leaveTypeId: e.target.value })}>
                  {s.leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="From" required><Input type="date" value={form.from} onChange={(e) => up({ from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></Field>
              <Field label="To" required><Input type="date" min={form.from} value={form.to} onChange={(e) => up({ to: e.target.value })} /></Field>
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 sm:col-span-2"><b>{form.days}</b> working day(s) — Sundays and holidays are excluded.</div>
              <Field label="Reason" className="sm:col-span-2"><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
            </div>
          );
        })()}
      </Modal>
      {toast}
    </div>
  );
}
