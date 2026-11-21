"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, MoreVertical, Paperclip, Pencil, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, Field, IconBtn, Input, Modal, StatusBadge, Tabs } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { empName, useCan, useStore } from "@/lib/store";
import { addDocument, deleteDocument, deleteEmployee, documentUrl, listDocuments, setEmployeeStatus } from "@/lib/api/hr";
import { errorMessage } from "@/lib/api/client";
import { fmtDate, fmtHours, fmtPeriod, fmtTime, hoursBetween, money } from "@/lib/format";
import type { DocumentRef } from "@/lib/types";
import { calculatePay, resolveBasic } from "@/lib/payroll";
import { leaveBalances } from "@/lib/leave";

type Tab = "personal" | "employment" | "salary" | "attendance" | "leave" | "documents";

export default function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const s = useStore();
  const e = s.employees.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("personal");
  const [menu, setMenu] = useState(false);
  const [doc, setDoc] = useState<{ name: string; reference: string; file: File | null } | null>(null);
  const [docs, setDocs] = useState<DocumentRef[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();
  const can = useCan();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab !== "documents" || docs) return;
    listDocuments(id).then(setDocs).catch((x) => { setDocs([]); show(errorMessage(x)); });
  }, [tab, docs, id, show]);
  useEffect(() => {
    const h = (ev: MouseEvent) => menuRef.current && !menuRef.current.contains(ev.target as Node) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!e) return <EmptyState icon={UserX} title="Employee not found" action={<Link href="/employees"><Button>Back to employees</Button></Link>} />;

  const code = s.company?.currencyCode ?? "LKR";
  const dep = s.departments.find((d) => d.id === e.departmentId)?.name ?? "—";
  const des = s.designations.find((d) => d.id === e.designationId)?.name ?? "—";
  const branch = s.branches.find((b) => b.id === e.branchId)?.name ?? "—";
  const shift = s.shifts.find((x) => x.id === e.shiftId);
  const structure = s.salaryStructures.find((x) => x.id === e.salaryStructureId);
  // Monthly estimate without overtime or no-pay days (same engine as the payroll run).
  const line = calculatePay({ basic: resolveBasic(e.basicSalary, structure?.basic), allowances: structure?.allowances ?? [], deductions: structure?.deductions ?? [], overtimeHours: 0, nopayDays: 0 }, s.settings);
  const att = s.attendance.filter((a) => a.employeeId === e.id).sort((a, b) => b.date.localeCompare(a.date));
  const leaves = s.leaveRequests.filter((l) => l.employeeId === e.id).sort((a, b) => b.from.localeCompare(a.from));
  const balances = leaveBalances(e.id, s.leaveTypes, s.leaveRequests);

  const Info = ({ items }: { items: [string, React.ReactNode][] }) => (
    <dl className="grid gap-x-8 gap-y-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-sm text-slate-500">{k}</dt>
          <dd className="mt-1 font-semibold text-slate-800">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-5">
          <button onClick={() => router.push("/employees")} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <Avatar name={empName(e)} size={84} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900">{empName(e)}</h1>
            <p className="text-sm text-slate-500">{e.empNo} • {des}</p>
            <div className="mt-2"><StatusBadge status={e.status} /></div>
          </div>
          {can.manageHR && <div className="flex items-center gap-2">
            <Button icon={Pencil} onClick={() => router.push(`/employees/${e.id}/edit`)}>Edit</Button>
            <div className="relative" ref={menuRef}>
              <Button variant="secondary" onClick={() => setMenu(!menu)} aria-label="More"><MoreVertical className="h-4 w-4" /></Button>
              {menu && (
                <div className="absolute right-0 top-12 z-10 w-52 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
                  <button onClick={async () => {
                    setMenu(false);
                    try { await setEmployeeStatus(e, e.status === "Active" ? "Inactive" : "Active"); show("Status updated"); } catch (x) { show(errorMessage(x)); }
                  }} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    {e.status === "Active" ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} Mark {e.status === "Active" ? "Inactive" : "Active"}
                  </button>
                  <button onClick={async () => {
                    setMenu(false);
                    if (s.payrollRuns.some((r) => r.lines.some((l) => l.employeeId === e.id))) return show("This employee has payroll history. Mark them inactive instead.");
                    if (!confirm(`Delete ${empName(e)} and their attendance and documents? This cannot be undone.`)) return;
                    try { await deleteEmployee(e.id); router.replace("/employees"); } catch (x) { show(errorMessage(x)); }
                  }} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                    <Trash2 className="h-4 w-4" /> Delete employee
                  </button>
                </div>
              )}
            </div>
          </div>}
        </div>
      </Card>

      <Card>
        <div className="px-5 pt-2">
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[
            { value: "personal", label: "Personal Info" }, { value: "employment", label: "Employment" }, { value: "salary", label: "Salary" },
            { value: "attendance", label: "Attendance" }, { value: "leave", label: "Leave" }, { value: "documents", label: "Documents" },
          ]} />
        </div>

        {tab === "personal" && <Info items={[
          ["Full Name", empName(e)], ["Phone Number", e.phone], ["NIC Number", e.nic], ["Email", e.email],
          ["Date of Birth", e.dob && fmtDate(e.dob)], ["Gender", e.gender], ["Address", e.address],
        ]} />}

        {tab === "employment" && <Info items={[
          ["Employee ID", e.empNo], ["Department", dep], ["Designation", des], ["Branch", branch],
          ["Shift", shift ? `${shift.name} (${fmtTime(shift.start)} – ${fmtTime(shift.end)})` : "—"],
          ["Join Date", fmtDate(e.joinDate)], ["Employment Type", e.employmentType], ["Status", <StatusBadge key="s" status={e.status} />],
        ]} />}

        {tab === "salary" && (
          <div className="p-6">
            {!structure && e.basicSalary === undefined ? (
              <EmptyState icon={FileText} title="No salary assigned" text="Assign a salary structure to include this employee in payroll." action={can.manageHR ? <Button onClick={() => router.push(`/employees/${e.id}/edit`)}>Assign salary</Button> : undefined} />
            ) : (
              <>
                <Info items={[["Salary Structure", structure?.name ?? "Custom"], ["Basic Salary", money(line.basic, code)], ["EPF Number", e.epfNo], ["Bank", e.bankName], ["Account No.", e.bankAccount]]} />
                <div className="grid gap-6 md:grid-cols-2">
                  <Breakdown title="Earnings" rows={[["Basic Salary", line.basic], ...line.allowances.map((a) => [a.name, a.amount] as [string, number])]} total={["Gross Earnings", line.gross]} code={code} />
                  <Breakdown title="Deductions" rows={[[`EPF (${s.settings.epfEmployee}%)`, line.epfEmployee], ...line.deductions.map((a) => [a.name, a.amount] as [string, number])]} total={["Total Deductions", line.totalDeductions]} code={code} />
                </div>
                <div className="mt-4 flex justify-end rounded-xl bg-brand-50 px-5 py-3 font-semibold text-brand-800">Estimated Net Pay: {money(line.net, code)}</div>
                <h4 className="mb-2 mt-8 font-semibold text-slate-800">Payslips</h4>
                {s.payrollRuns.filter((r) => r.lines.some((l) => l.employeeId === e.id)).map((r) => (
                  <Link key={r.id} href={`/payroll/payslip/${r.id}/${e.id}`} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm hover:text-brand-700">
                    <span>{fmtPeriod(r.period)}</span><StatusBadge status={r.status} />
                  </Link>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "attendance" && (
          <DataTable rows={att} pageSize={10} empty={<EmptyState icon={FileText} title="No attendance records" />} columns={[
            { key: "d", header: "Date", render: (a) => fmtDate(a.date) },
            { key: "i", header: "In Time", render: (a) => fmtTime(a.inTime) },
            { key: "o", header: "Out Time", render: (a) => fmtTime(a.outTime) },
            { key: "h", header: "Hours", render: (a) => fmtHours(hoursBetween(a.inTime, a.outTime)) },
            { key: "ot", header: "OT", render: (a) => a.overtimeHours || "—" },
            { key: "s", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
          ]} />
        )}

        {tab === "leave" && (
          <div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              {balances.filter((b) => b.type.paid).map((b) => (
                <div key={b.type.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-sm text-slate-500">{b.type.name}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{b.remaining}<span className="text-sm font-normal text-slate-400"> / {b.entitled} days</span></div>
                </div>
              ))}
            </div>
            <DataTable rows={leaves} empty={<EmptyState icon={FileText} title="No leave requests" />} columns={[
              { key: "t", header: "Leave Type", render: (l) => s.leaveTypes.find((t) => t.id === l.leaveTypeId)?.name },
              { key: "f", header: "From", render: (l) => fmtDate(l.from) },
              { key: "to", header: "To", render: (l) => fmtDate(l.to) },
              { key: "d", header: "Days", render: (l) => l.days },
              { key: "s", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
            ]} />
          </div>
        )}

        {tab === "documents" && (
          <div>
            <div className="flex items-center justify-between px-5 pt-5">
              <p className="text-sm text-slate-500">Files are stored privately. Downloads use short-lived links.</p>
              {can.manageHR && <Button size="sm" icon={Plus} onClick={() => setDoc({ name: "", reference: "", file: null })}>Add Document</Button>}
            </div>
            <DataTable rows={docs ?? []} empty={<EmptyState icon={FileText} title={docs ? "No documents" : "Loading…"} />} columns={[
              { key: "n", header: "Document", render: (d) => <span className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-brand-500" />{d.name}{d.hasFile && <Paperclip className="h-3.5 w-3.5 text-slate-400" />}</span> },
              { key: "r", header: "Reference", render: (d) => d.reference || "—" },
              { key: "a", header: "Added", render: (d) => fmtDate(d.addedOn) },
              { key: "x", header: "", className: "text-right", render: (d) => (
                <>
                  {d.hasFile && <IconBtn icon={Download} label="Download" onClick={async () => {
                    try { window.location.assign(await documentUrl(e.id, d.id)); } catch (x) { show(errorMessage(x)); }
                  }} />}
                  {can.manageHR && <IconBtn icon={Trash2} tone="danger" label="Remove" onClick={async () => {
                    if (!confirm(`Remove ${d.name}?`)) return;
                    try { await deleteDocument(e.id, d.id); setDocs((list) => (list ?? []).filter((x) => x.id !== d.id)); } catch (x) { show(errorMessage(x)); }
                  }} />}
                </>
              ) },
            ]} />
          </div>
        )}
      </Card>

      <Modal open={!!doc} onClose={() => setDoc(null)} title="Add Document Reference" footer={
        <><Button variant="secondary" onClick={() => setDoc(null)}>Cancel</Button>
          <Button disabled={!doc?.name.trim() || busy} onClick={async () => {
            setBusy(true);
            try {
              const added = await addDocument(e.id, doc!);
              setDocs((list) => [added, ...(list ?? [])]);
              setDoc(null);
              show("Document added");
            } catch (x) { show(errorMessage(x)); } finally { setBusy(false); }
          }}>{busy ? "Uploading…" : "Add"}</Button></>
      }>
        {doc && (
          <div className="space-y-4">
            <Field label="Document Name" required><Input placeholder="e.g. NIC copy, Appointment letter" maxLength={120} value={doc.name} onChange={(x) => setDoc({ ...doc, name: x.target.value })} /></Field>
            <Field label="Reference / Location"><Input placeholder="e.g. HR file #12" maxLength={300} value={doc.reference} onChange={(x) => setDoc({ ...doc, reference: x.target.value })} /></Field>
            <Field label="File (optional)" hint="PDF, PNG, JPG or WEBP, up to 10MB.">
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
                onChange={(x) => setDoc({ ...doc, file: x.target.files?.[0] ?? null })} />
            </Field>
          </div>
        )}
      </Modal>
      {toast}
    </div>
  );
}

function Breakdown({ title, rows, total, code }: { title: string; rows: [string, number][]; total: [string, number]; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      <div className="bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between px-4 py-2 text-sm"><span className="text-slate-600">{k}</span><span>{money(v, code, false)}</span></div>
      ))}
      <div className="flex justify-between border-t border-slate-100 px-4 py-2.5 text-sm font-semibold"><span>{total[0]}</span><span>{money(total[1], code, false)}</span></div>
    </div>
  );
}
