"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Building, CalendarCheck, ClipboardList, Download, FileSpreadsheet, Landmark, Receipt, Umbrella, Users, type LucideIcon } from "lucide-react";
import { Button, Card, Checkbox, DataTable, Input, PageHeader, Select } from "@/components/ui";
import { empName, useStore } from "@/lib/store";
import { currentPeriod, downloadCSV, fmtDate, fmtHours, fmtPeriod, hoursBetween, money, relTime } from "@/lib/format";
import { sum } from "@/lib/payroll";
import { leaveBalances } from "@/lib/leave";

type Key = "employee" | "attendance" | "leave" | "payroll" | "register" | "epf" | "department" | "custom" | "activity";
const REPORTS: { key: Key; title: string; text: string; icon: LucideIcon }[] = [
  { key: "employee", title: "Employee Report", text: "Employee list and details", icon: Users },
  { key: "attendance", title: "Attendance Report", text: "Daily / monthly attendance", icon: CalendarCheck },
  { key: "leave", title: "Leave Report", text: "Leave usage and balances", icon: Umbrella },
  { key: "payroll", title: "Payroll Report", text: "Payroll summary and details", icon: Receipt },
  { key: "register", title: "Salary Register", text: "Employee salary register", icon: FileSpreadsheet },
  { key: "epf", title: "EPF / ETF Report", text: "Statutory contribution details", icon: Landmark },
  { key: "department", title: "Department Report", text: "Department-wise analytics", icon: Building },
  { key: "custom", title: "Custom Report", text: "Create custom reports", icon: BarChart3 },
  { key: "activity", title: "Activity Log", text: "Recent system activity", icon: ClipboardList },
];

type Row = Record<string, string | number> & { id: string };

export default function ReportsPage() {
  const s = useStore();
  const [open, setOpen] = useState<Key | null>(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [dep, setDep] = useState("");
  const code = s.company?.currencyCode ?? "LKR";
  const dName = (id: string) => s.departments.find((d) => d.id === id)?.name ?? "—";
  const gName = (id: string) => s.designations.find((d) => d.id === id)?.name ?? "—";
  const emps = s.employees.filter((e) => !dep || e.departmentId === dep);
  const run = s.payrollRuns.find((r) => r.period === period);
  const runLines = (run?.lines ?? []).filter((l) => emps.some((e) => e.id === l.employeeId));

  const allFields = useMemo(() => ({
    "Emp ID": (e: (typeof s.employees)[number]) => e.empNo, Name: empName, NIC: (e: (typeof s.employees)[number]) => e.nic,
    Department: (e: (typeof s.employees)[number]) => dName(e.departmentId), Designation: (e: (typeof s.employees)[number]) => gName(e.designationId),
    Phone: (e: (typeof s.employees)[number]) => e.phone, Email: (e: (typeof s.employees)[number]) => e.email,
    "Join Date": (e: (typeof s.employees)[number]) => e.joinDate, Type: (e: (typeof s.employees)[number]) => e.employmentType,
    Status: (e: (typeof s.employees)[number]) => e.status, "EPF No": (e: (typeof s.employees)[number]) => e.epfNo ?? "",
    Bank: (e: (typeof s.employees)[number]) => `${e.bankName ?? ""} ${e.bankAccount ?? ""}`.trim(),
  }), [s.employees, s.departments, s.designations]); // eslint-disable-line react-hooks/exhaustive-deps
  const [custom, setCustom] = useState<Set<string>>(new Set(["Emp ID", "Name", "Department", "Status"]));

  const { headers, rows, footer } = useMemo((): { headers: string[]; rows: Row[]; footer?: string } => {
    const lineRow = (l: (typeof runLines)[number]) => {
      const e = s.employees.find((x) => x.id === l.employeeId);
      return { e, name: empName(e), no: e?.empNo ?? "" };
    };
    switch (open) {
      case "employee":
        return { headers: ["Emp ID", "Name", "Department", "Designation", "Join Date", "Type", "Status"],
          rows: emps.map((e) => ({ id: e.id, "Emp ID": e.empNo, Name: empName(e), Department: dName(e.departmentId), Designation: gName(e.designationId), "Join Date": e.joinDate, Type: e.employmentType, Status: e.status })) };
      case "attendance":
        return { headers: ["Emp ID", "Name", "Present", "Late", "Half Day", "Absent", "On Leave", "Hours", "OT Hours"],
          rows: emps.map((e) => {
            const a = s.attendance.filter((x) => x.employeeId === e.id && x.date.startsWith(period));
            const c = (st: string) => a.filter((x) => x.status === st).length;
            return { id: e.id, "Emp ID": e.empNo, Name: empName(e), Present: c("Present"), Late: c("Late"), "Half Day": c("Half Day"), Absent: c("Absent"), "On Leave": c("On Leave"),
              Hours: fmtHours(a.reduce((t, x) => t + hoursBetween(x.inTime, x.outTime), 0)), "OT Hours": a.reduce((t, x) => t + x.overtimeHours, 0) };
          }) };
      case "leave": {
        const paid = s.leaveTypes.filter((t) => t.paid);
        return { headers: ["Emp ID", "Name", ...paid.flatMap((t) => [`${t.name} used`, `${t.name} left`])],
          rows: emps.map((e) => {
            const b = leaveBalances(e.id, s.leaveTypes, s.leaveRequests);
            const r: Row = { id: e.id, "Emp ID": e.empNo, Name: empName(e) };
            paid.forEach((t) => { const x = b.find((y) => y.type.id === t.id)!; r[`${t.name} used`] = x.used; r[`${t.name} left`] = x.remaining; });
            return r;
          }) };
      }
      case "payroll":
        return { headers: ["Emp ID", "Name", "Gross", "Deductions", "Net Pay"],
          rows: runLines.map((l) => { const x = lineRow(l); return { id: l.employeeId, "Emp ID": x.no, Name: x.name, Gross: money(l.gross, code, false), Deductions: money(l.totalDeductions, code, false), "Net Pay": money(l.net, code, false) }; }),
          footer: run ? `${run.status} · Gross ${money(sum(runLines, "gross"), code)} · Deductions ${money(sum(runLines, "totalDeductions"), code)} · Net ${money(sum(runLines, "net"), code)}` : `No payroll run for ${fmtPeriod(period)}.` };
      case "register":
        return { headers: ["Emp ID", "Name", "Basic", "Allowances", "Gross", "EPF 8%", "Other Deductions", "Net Pay", "Bank"],
          rows: runLines.map((l) => { const x = lineRow(l); return { id: l.employeeId, "Emp ID": x.no, Name: x.name, Basic: money(l.basic, code, false), Allowances: money(l.gross - l.basic, code, false), Gross: money(l.gross, code, false), "EPF 8%": money(l.epfEmployee, code, false), "Other Deductions": money(l.totalDeductions - l.epfEmployee, code, false), "Net Pay": money(l.net, code, false), Bank: `${x.e?.bankName ?? ""} ${x.e?.bankAccount ?? ""}`.trim() }; }),
          footer: run ? undefined : `No payroll run for ${fmtPeriod(period)}.` };
      case "epf":
        return { headers: ["Emp ID", "Name", "EPF No", "Basic", "EPF Employee", "EPF Employer", "Total EPF", "ETF"],
          rows: runLines.map((l) => { const x = lineRow(l); return { id: l.employeeId, "Emp ID": x.no, Name: x.name, "EPF No": x.e?.epfNo ?? "", Basic: money(l.basic, code, false), "EPF Employee": money(l.epfEmployee, code, false), "EPF Employer": money(l.epfEmployer, code, false), "Total EPF": money(l.epfEmployee + l.epfEmployer, code, false), ETF: money(l.etf, code, false) }; }),
          footer: run ? `Total EPF ${money(sum(runLines, "epfEmployee") + sum(runLines, "epfEmployer"), code)} · Total ETF ${money(sum(runLines, "etf"), code)}` : `No payroll run for ${fmtPeriod(period)}.` };
      case "department":
        return { headers: ["Department", "Employees", "Active", "Present (period)", "Net Payroll"],
          rows: s.departments.map((d) => {
            const de = s.employees.filter((e) => e.departmentId === d.id);
            const ids = new Set(de.map((e) => e.id));
            return { id: d.id, Department: d.name, Employees: de.length, Active: de.filter((e) => e.status === "Active").length,
              "Present (period)": s.attendance.filter((a) => ids.has(a.employeeId) && a.date.startsWith(period) && a.status !== "Absent" && a.status !== "On Leave").length,
              "Net Payroll": money(sum((run?.lines ?? []).filter((l) => ids.has(l.employeeId)), "net"), code, false) };
          }) };
      case "custom": {
        const keys = Object.keys(allFields).filter((k) => custom.has(k));
        return { headers: keys, rows: emps.map((e) => { const r: Row = { id: e.id }; keys.forEach((k) => (r[k] = allFields[k as keyof typeof allFields](e))); return r; }) };
      }
      case "activity":
        return { headers: ["When", "Activity", "Detail"], rows: s.activities.map((a) => ({ id: a.id, When: `${fmtDate(a.at)} ${relTime(a.at)}`, Activity: a.title, Detail: a.detail })) };
      default:
        return { headers: [], rows: [] };
    }
  }, [open, emps, s, period, run, runLines, code, custom, allFields]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open)
    return (
      <div>
        <PageHeader title="Reports" subtitle="Generate and export HR and payroll reports." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {REPORTS.map((r) => (
            <button key={r.key} onClick={() => setOpen(r.key)} className="group flex cursor-pointer flex-col items-center rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white"><r.icon className="h-7 w-7" /></span>
              <span className="mt-4 font-semibold text-slate-800">{r.title}</span>
              <span className="mt-1 text-sm text-slate-500">{r.text}</span>
            </button>
          ))}
        </div>
      </div>
    );

  const meta = REPORTS.find((r) => r.key === open)!;
  const usesPeriod = ["attendance", "payroll", "register", "epf", "department"].includes(open);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen(null)} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
          <p className="text-sm text-slate-500">{meta.text}{usesPeriod && ` · ${fmtPeriod(period)}`}</p>
        </div>
      </div>
      <Card>
        {open === "custom" && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-100 p-5">
            {Object.keys(allFields).map((k) => (
              <Checkbox key={k} checked={custom.has(k)} label={k} onChange={(v) => setCustom((p) => { const n = new Set(p); if (v) n.add(k); else n.delete(k); return n; })} />
            ))}
          </div>
        )}
        <DataTable
          rows={rows}
          searchText={(r) => Object.values(r).join(" ")}
          toolbar={
            <>
              {usesPeriod && <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-auto" />}
              {open !== "department" && open !== "activity" && (
                <Select value={dep} onChange={(e) => setDep(e.target.value)} className="w-auto">
                  <option value="">All departments</option>
                  {s.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              )}
              <Button icon={Download} disabled={!rows.length} onClick={() => downloadCSV(`${open}-report${usesPeriod ? "-" + period : ""}.csv`, [headers, ...rows.map((r) => headers.map((h) => r[h]))])}>Export CSV</Button>
            </>
          }
          columns={headers.map((h) => ({ key: h, header: h, render: (r: Row) => r[h] }))}
        />
        {footer && <div className="border-t border-slate-100 px-5 py-4 text-sm font-medium text-slate-700">{footer}</div>}
      </Card>
    </div>
  );
}
