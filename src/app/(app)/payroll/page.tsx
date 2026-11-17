"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileText, History, Calculator, RotateCcw } from "lucide-react";
import { Avatar, Button, Card, DataTable, EmptyState, Input, PageHeader, StatusBadge, Stepper } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { empName, useStore } from "@/lib/store";
import { currentPeriod, downloadCSV, fmtDate, fmtPeriod, money, moneyShort, uid } from "@/lib/format";
import { calcLine, sum } from "@/lib/payroll";
import type { PayrollLine, PayrollRun } from "@/lib/types";

const STEPS = ["Prepare", "Calculate", "Preview", "Approve & Slip"];

export default function PayrollPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const s = useStore();
  const [toast, show] = useToast();
  const [period, setPeriod] = useState(sp.get("period") || currentPeriod());
  const view = sp.get("view");
  const run = s.payrollRuns.find((r) => r.period === period);
  const [step, setStep] = useState<number | null>(null);
  const curStep = step ?? (run ? (run.status === "Approved" ? 3 : 2) : 0);
  const code = s.company?.currencyCode ?? "LKR";

  const periodEnd = `${period}-31`;
  const eligible = useMemo(
    () => s.employees.filter((e) => e.status === "Active" && e.joinDate <= periodEnd),
    [s.employees, periodEnd],
  );
  const missing = eligible.filter((e) => !e.salaryStructureId && !e.basicSalary);
  const ready = eligible.filter((e) => e.salaryStructureId || e.basicSalary);

  const inputs = useMemo(() => {
    const unpaidTypes = new Set(s.leaveTypes.filter((t) => !t.paid).map((t) => t.id));
    return new Map(
      ready.map((e) => {
        const ot = s.attendance.filter((a) => a.employeeId === e.id && a.date.startsWith(period)).reduce((a, b) => a + (b.overtimeHours || 0), 0);
        const np = s.leaveRequests
          .filter((l) => l.employeeId === e.id && l.status === "Approved" && unpaidTypes.has(l.leaveTypeId) && l.from.startsWith(period))
          .reduce((a, b) => a + b.days, 0);
        return [e.id, { ot, np }];
      }),
    );
  }, [ready, s.attendance, s.leaveRequests, s.leaveTypes, period]);

  const preview: PayrollLine[] = useMemo(
    () => ready.map((e) => calcLine(e, s.salaryStructures.find((x) => x.id === e.salaryStructureId), s.settings, inputs.get(e.id)?.ot, inputs.get(e.id)?.np)),
    [ready, s.salaryStructures, s.settings, inputs],
  );
  const lines = run?.lines ?? preview;

  function calculate() {
    if (!preview.length) return show("No employees with salary data");
    const r: PayrollRun = { id: run?.id ?? uid(), period, status: "Draft", createdAt: new Date().toISOString(), paymentDate: `${period}-${String(s.settings.payDay).padStart(2, "0")}`, lines: preview };
    s.upsert("payrollRuns", r);
    setStep(2);
    show("Payroll calculated");
  }
  function approve() {
    s.upsert("payrollRuns", { ...run!, status: "Approved" });
    s.log("payroll", "Payroll processed", `${fmtPeriod(period)} payroll was approved for ${run!.lines.length} employees.`);
    setStep(3);
    show("Payroll approved — payslips generated");
  }
  function exportRun(r: PayrollRun) {
    downloadCSV(`payroll-${r.period}.csv`, [
      ["Emp ID", "Employee", "Basic", "Gross", "EPF Employee", "Total Deductions", "Net Pay", "EPF Employer", "ETF"],
      ...r.lines.map((l) => {
        const e = s.employees.find((x) => x.id === l.employeeId);
        return [e?.empNo ?? "", empName(e), l.basic, l.gross, l.epfEmployee, l.totalDeductions, l.net, l.epfEmployer, l.etf];
      }),
    ]);
  }

  if (view === "history") {
    const runs = [...s.payrollRuns].sort((a, b) => b.period.localeCompare(a.period));
    return (
      <div>
        <PageHeader title="Payroll History" subtitle="All payroll runs." actions={<Button onClick={() => router.push("/payroll")}>Process Payroll</Button>} />
        <Card>
          <DataTable rows={runs} empty={<EmptyState icon={History} title="No payroll runs yet" />} onRowClick={(r) => { setPeriod(r.period); setStep(null); router.push(`/payroll?period=${r.period}`); }} columns={[
            { key: "p", header: "Period", render: (r) => <span className="font-medium">{fmtPeriod(r.period)}</span> },
            { key: "e", header: "Employees", render: (r) => r.lines.length },
            { key: "g", header: "Total Earnings", className: "text-right", render: (r) => money(sum(r.lines, "gross"), code) },
            { key: "d", header: "Deductions", className: "text-right", render: (r) => money(sum(r.lines, "totalDeductions"), code) },
            { key: "n", header: "Net Pay", className: "text-right", render: (r) => <b>{money(sum(r.lines, "net"), code)}</b> },
            { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "x", header: "", className: "text-right", render: (r) => <Button size="sm" variant="ghost" icon={Download} onClick={(ev) => { ev.stopPropagation(); exportRun(r); }}>CSV</Button> },
          ]} />
        </Card>
        {toast}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Payroll (${fmtDate(period + "-01", { month: "short", year: "numeric" })})`} subtitle="Prepare, calculate, preview and approve the monthly payroll." actions={
        <>
          <Input type="month" value={period} onChange={(e) => { if (e.target.value) { setPeriod(e.target.value); setStep(null); } }} className="w-auto" />
          <Link href="/payroll?view=history"><Button variant="secondary" icon={History}>History</Button></Link>
        </>
      } />

      <Card className="p-6">
        <Stepper steps={STEPS} current={curStep} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Employees", String(lines.length)],
          ["Total Earnings", moneyShort(sum(lines, "gross"), code)],
          ["Total Deductions", moneyShort(sum(lines, "totalDeductions"), code)],
          ["Net Pay", moneyShort(sum(lines, "net"), code)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm">
            <div className="text-sm text-slate-500">{k}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{v}</div>
          </div>
        ))}
      </div>

      {curStep === 0 && (
        <Card title="Preparation checklist">
          <div className="space-y-3 p-5">
            <Check ok={eligible.length > 0} text={`${eligible.length} active employee(s) in ${fmtPeriod(period)}`} />
            <Check ok={missing.length === 0} text={missing.length ? `${missing.length} employee(s) without salary — they will be excluded: ${missing.map((e) => empName(e)).join(", ")}` : "All employees have salary data"} />
            <Check ok text={`Overtime from attendance: ${[...inputs.values()].reduce((a, b) => a + b.ot, 0)} hour(s) at ${s.settings.otRate}× rate`} />
            <Check ok text={`No-pay leave: ${[...inputs.values()].reduce((a, b) => a + b.np, 0)} day(s)`} />
            <Check ok text={`EPF ${s.settings.epfEmployee}% (employee) / ${s.settings.epfEmployer}% (employer), ETF ${s.settings.etf}%`} />
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">Statutory rates must be verified against current official rules before processing real payroll.</p>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
            <Button variant="secondary" onClick={() => router.push("/dashboard")}>Back</Button>
            <Button disabled={!ready.length} onClick={() => setStep(1)}>Continue <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {curStep === 1 && (
        <Card title="Calculate payroll">
          <p className="px-5 pt-2 text-sm text-slate-500">Calculate salaries for {ready.length} employee(s) using their salary structures, overtime and no-pay leave.</p>
          <div className="flex justify-end gap-3 p-5">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button icon={Calculator} onClick={calculate}>Calculate Payroll</Button>
          </div>
        </Card>
      )}

      {curStep >= 2 && run && (
        <Card title={curStep === 2 ? "Preview" : "Payslips"} action={<StatusBadge status={run.status} />}>
          <DataTable rows={run.lines.map((l) => ({ ...l, id: l.employeeId }))} searchText={(l) => empName(s.employees.find((e) => e.id === l.employeeId))} columns={[
            { key: "e", header: "Employee", render: (l) => { const e = s.employees.find((x) => x.id === l.employeeId); return <div className="flex items-center gap-3"><Avatar name={empName(e)} size={32} /><div><div className="font-medium text-slate-800">{empName(e)}</div><div className="text-xs text-slate-400">{e?.empNo}</div></div></div>; } },
            { key: "b", header: "Basic", className: "text-right", render: (l) => money(l.basic, code, false) },
            { key: "g", header: "Gross", className: "text-right", render: (l) => money(l.gross, code, false) },
            { key: "d", header: "Deductions", className: "text-right", render: (l) => money(l.totalDeductions, code, false) },
            { key: "n", header: "Net Pay", className: "text-right", render: (l) => <b>{money(l.net, code, false)}</b> },
            { key: "p", header: "", className: "text-right", render: (l) => <Link href={`/payroll/payslip/${run.id}/${l.employeeId}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"><FileText className="h-4 w-4" />Payslip</Link> },
          ]} />
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 p-5">
            <Button variant="secondary" icon={Download} onClick={() => exportRun(run)}>Export CSV</Button>
            {run.status === "Draft" && (
              <>
                <Button variant="secondary" icon={RotateCcw} onClick={() => setStep(1)}>Recalculate</Button>
                <Button icon={CheckCircle2} onClick={approve}>Approve &amp; Generate Payslips</Button>
              </>
            )}
          </div>
        </Card>
      )}
      {toast}
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />}
      <span className="text-slate-700">{text}</span>
    </div>
  );
}
