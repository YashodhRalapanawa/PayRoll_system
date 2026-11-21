"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Building, CalendarCheck, ClipboardList, Download, FileSpreadsheet, Landmark, Receipt, Umbrella, Users, type LucideIcon } from "lucide-react";
import { Button, Card, Checkbox, DataTable, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { useToast } from "@/components/ui/useToast";
import { useStore } from "@/lib/store";
import { currentPeriod, fmtPeriod } from "@/lib/format";
import { CUSTOM_FIELDS, PERIOD_REPORTS, type ReportType } from "@/lib/reports";
import { getReport, reportCsvUrl, type ReportData } from "@/lib/api/payroll";
import { errorMessage } from "@/lib/api/client";

const REPORTS: { key: ReportType; title: string; text: string; icon: LucideIcon }[] = [
  { key: "employee", title: "Employee Report", text: "Employee list and details", icon: Users },
  { key: "attendance", title: "Attendance Report", text: "Monthly attendance summary", icon: CalendarCheck },
  { key: "leave", title: "Leave Report", text: "Leave usage and balances", icon: Umbrella },
  { key: "payroll", title: "Payroll Report", text: "Payroll summary and details", icon: Receipt },
  { key: "register", title: "Salary Register", text: "Employee salary register", icon: FileSpreadsheet },
  { key: "epf", title: "EPF / ETF Report", text: "Statutory contribution details", icon: Landmark },
  { key: "department", title: "Department Report", text: "Department-wise analytics", icon: Building },
  { key: "custom", title: "Custom Report", text: "Choose your own columns", icon: BarChart3 },
  { key: "activity", title: "Activity Log", text: "Recent system activity", icon: ClipboardList },
];

/** B7 · Reports are built on the server, so they cover any period and always reflect the database. */
export default function ReportsPage() {
  const s = useStore();
  const [toast, show] = useToast();
  const [open, setOpen] = useState<ReportType | null>(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [dep, setDep] = useState("");
  const [custom, setCustom] = useState<Set<string>>(new Set(["Emp ID", "Name", "Department", "Status"]));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fields = CUSTOM_FIELDS.filter((f) => custom.has(f));
  const opts = { period, departmentId: dep || undefined, fields: open === "custom" ? fields : undefined };
  const optsKey = JSON.stringify(opts);

  useEffect(() => {
    if (!open || (open === "custom" && !fields.length)) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    getReport(open, JSON.parse(optsKey))
      .then((r) => alive && setData(r))
      .catch((e) => { if (alive) { setData(null); show(errorMessage(e)); } })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, optsKey, fields.length, show]);

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
  const usesPeriod = PERIOD_REPORTS.includes(open);
  const rows = data?.rows ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { setOpen(null); setData(null); }} className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
          <p className="text-sm text-slate-500">{meta.text}{usesPeriod && ` · ${fmtPeriod(period)}`}</p>
        </div>
      </div>
      <Card>
        {open === "custom" && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-100 p-5">
            {CUSTOM_FIELDS.map((k) => (
              <Checkbox key={k} checked={custom.has(k)} label={k} onChange={(v) => setCustom((p) => { const n = new Set(p); if (v) n.add(k); else n.delete(k); return n; })} />
            ))}
          </div>
        )}
        <DataTable
          rows={rows}
          searchText={(r) => Object.values(r).join(" ")}
          empty={<EmptyState icon={BarChart3} title={loading ? "Loading…" : open === "custom" && !fields.length ? "Choose at least one field" : "No data for this report"} />}
          toolbar={
            <>
              {usesPeriod && <Input type="month" value={period} onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && setPeriod(e.target.value)} className="w-auto" />}
              {open !== "department" && open !== "activity" && (
                <Select value={dep} onChange={(e) => setDep(e.target.value)} className="w-auto">
                  <option value="">All departments</option>
                  {s.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              )}
              <a href={reportCsvUrl(open, opts)} download aria-disabled={!rows.length} className={!rows.length ? "pointer-events-none opacity-50" : undefined}>
                <Button icon={Download} disabled={!rows.length}>Export CSV</Button>
              </a>
            </>
          }
          columns={(data?.headers ?? []).map((h) => ({ key: h, header: h, render: (r: ReportData["rows"][number]) => r[h] }))}
        />
        {data?.footer && <div className="border-t border-slate-100 px-5 py-4 text-sm font-medium text-slate-700">{data.footer}</div>}
      </Card>
      {toast}
    </div>
  );
}
