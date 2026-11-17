"use client";
import Link from "next/link";
import { use } from "react";
import { ArrowLeft, Download, FileX } from "lucide-react";
import { Avatar, Button, EmptyState, StatusBadge } from "@/components/ui";
import { empName, useStore } from "@/lib/store";
import { fmtDate, fmtPeriod, money } from "@/lib/format";

export default function PayslipPage({ params }: { params: Promise<{ runId: string; empId: string }> }) {
  const { runId, empId } = use(params);
  const s = useStore();
  const run = s.payrollRuns.find((r) => r.id === runId);
  const line = run?.lines.find((l) => l.employeeId === empId);
  const e = s.employees.find((x) => x.id === empId);
  if (!run || !line || !e) return <EmptyState icon={FileX} title="Payslip not found" action={<Link href="/payroll"><Button>Back to payroll</Button></Link>} />;

  const c = s.company!;
  const code = c.currencyCode;
  const [y, m] = run.period.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const earnings: [string, number][] = [["Basic Salary", line.basic], ...line.allowances.map((a) => [a.name, a.amount] as [string, number])];
  const deductions: [string, number][] = [[`EPF (${s.settings.epfEmployee}%)`, line.epfEmployee], ...line.deductions.map((d) => [d.name, d.amount] as [string, number])];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/payroll?period=${run.period}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back to payroll</Link>
        <div className="flex items-center gap-3">
          <StatusBadge status={run.status} />
          <Button variant="secondary" icon={Download} onClick={() => window.print()}>Download PDF</Button>
        </div>
      </div>

      <div className="print-area rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-10">
        {run.status === "Draft" && <div className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-700">Draft — not yet approved</div>}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="flex items-center gap-4">
            {c.logo ? <img src={c.logo} alt="" className="h-16 w-16 rounded-full object-contain" /> : <Avatar name={c.name} size={64} />}
            <div>
              <div className="text-xl font-bold text-slate-900">{c.name}</div>
              <div className="text-sm text-slate-500">{c.address}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-900">Payslip</div>
            <div className="text-sm text-slate-500">{fmtPeriod(run.period)}</div>
          </div>
        </div>

        <div className="grid gap-x-10 gap-y-2 py-6 text-sm sm:grid-cols-2">
          {[
            ["Employee", `${empName(e)} (${e.empNo})`],
            ["Basic Salary", money(line.basic, code)],
            ["Designation", s.designations.find((d) => d.id === e.designationId)?.name ?? "—"],
            ["Pay Period", `${fmtDate(run.period + "-01", { month: "short", day: "numeric" })} – ${fmtDate(`${run.period}-${last}`, { month: "short", day: "numeric", year: "numeric" })}`],
            ["Department", s.departments.find((d) => d.id === e.departmentId)?.name ?? "—"],
            ["Payment Date", fmtDate(run.paymentDate)],
            ["EPF No.", e.epfNo || "—"],
            ["Bank Account", e.bankAccount ? `${e.bankName ?? ""} ${e.bankAccount}` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3"><span className="w-28 shrink-0 text-slate-500">{k}</span><span className="font-medium text-slate-800">: {v}</span></div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Earnings" rows={earnings} total={["Total Earnings", line.gross]} code={code} />
          <Section title="Deductions" rows={deductions} total={["Total Deductions", line.totalDeductions]} code={code} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Employer contributions — EPF ({s.settings.epfEmployer}%): {money(line.epfEmployer, code)} · ETF ({s.settings.etf}%): {money(line.etf, code)}
          </div>
          <div className="rounded-xl bg-amber-50 px-6 py-3 text-lg font-bold text-slate-900 ring-1 ring-amber-200">
            Net Payable : <span className="text-brand-700">{money(line.net, code)}</span>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-400">This is a system-generated payslip and does not require a signature.</p>
      </div>
    </div>
  );
}

function Section({ title, rows, total, code }: { title: string; rows: [string, number][]; total: [string, number]; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="bg-brand-50 px-4 py-2.5 font-semibold text-brand-800">{title}</div>
      <div className="divide-y divide-slate-100">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between px-4 py-2 text-sm"><span className="text-slate-600">{k}</span><span className="tabular-nums">{money(v, code, false)}</span></div>
        ))}
      </div>
      <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold"><span>{total[0]}</span><span className="tabular-nums">{money(total[1], code, false)}</span></div>
    </div>
  );
}
