"use client";
/**
 * Data layer for Developer B's modules (leave, salary, payroll, settings,
 * dashboard, reports). Same rule as lib/api/hr.ts: call the API, then update
 * the store with what the server returned.
 */
import type { DashboardData } from "@/lib/server/dashboard";
import { useStore } from "@/lib/store";
import type { Employee, Holiday, LeaveRequest, LeaveType, PayrollRun, PayrollSettings, SalaryStructure } from "@/lib/types";
import { api } from "./client";

const st = () => useStore.getState();
const exists = (list: { id: string }[], id: string) => list.some((x) => x.id === id);

// ---------- leave ----------
export async function requestLeave(input: { employeeId: string; leaveTypeId: string; from: string; to: string; reason: string }) {
  const { leaveRequest } = await api.post<{ leaveRequest: LeaveRequest }>("/api/leave", input);
  st().upsert("leaveRequests", leaveRequest);
  return leaveRequest;
}

export async function decideLeave(id: string, decision: "approve" | "reject") {
  const { leaveRequest } = await api.post<{ leaveRequest: LeaveRequest }>(`/api/leave/${id}/${decision}`);
  st().upsert("leaveRequests", leaveRequest);
  return leaveRequest;
}

export async function saveLeaveType(t: LeaveType) {
  const isNew = !exists(st().leaveTypes, t.id);
  const { leaveType } = isNew
    ? await api.post<{ leaveType: LeaveType }>("/api/settings/leave-types", t)
    : await api.patch<{ leaveType: LeaveType }>(`/api/settings/leave-types/${t.id}`, t);
  st().upsert("leaveTypes", leaveType);
}

export async function deleteLeaveType(id: string) {
  await api.del(`/api/settings/leave-types/${id}`);
  st().remove("leaveTypes", id);
}

export async function saveHoliday(h: Holiday) {
  const isNew = !exists(st().holidays, h.id);
  const { holiday } = isNew
    ? await api.post<{ holiday: Holiday }>("/api/settings/holidays", h)
    : await api.patch<{ holiday: Holiday }>(`/api/settings/holidays/${h.id}`, h);
  st().upsert("holidays", holiday);
}

export async function deleteHoliday(id: string) {
  await api.del(`/api/settings/holidays/${id}`);
  st().remove("holidays", id);
}

// ---------- settings ----------
export async function savePayrollSettings(s: PayrollSettings) {
  const { settings } = await api.put<{ settings: PayrollSettings }>("/api/settings/payroll", s);
  st().setSettings(settings);
  return settings;
}

// ---------- salary structures ----------
export async function saveSalaryStructure(s: SalaryStructure) {
  const isNew = !exists(st().salaryStructures, s.id);
  const { salaryStructure } = isNew
    ? await api.post<{ salaryStructure: SalaryStructure }>("/api/salary-structures", s)
    : await api.patch<{ salaryStructure: SalaryStructure }>(`/api/salary-structures/${s.id}`, s);
  st().upsert("salaryStructures", salaryStructure);
  return salaryStructure;
}

export async function deleteSalaryStructure(id: string) {
  await api.del(`/api/salary-structures/${id}`);
  st().remove("salaryStructures", id);
}

export async function assignSalaryStructure(id: string, employeeIds: string[]) {
  const { employees } = await api.post<{ employees: Employee[] }>(`/api/salary-structures/${id}/assign`, { employeeIds });
  useStore.setState({ employees });
}

// ---------- payroll ----------
export async function calculatePayroll(period: string) {
  const res = await api.post<{ run: PayrollRun; skipped: { id: string; name: string }[] }>("/api/payroll/calculate", { period });
  st().upsert("payrollRuns", res.run);
  return res;
}

export async function approvePayroll(runId: string) {
  const { run } = await api.post<{ run: PayrollRun }>(`/api/payroll/${runId}/approve`);
  st().upsert("payrollRuns", run);
  return run;
}

export const payslipPdfUrl = (runId: string, employeeId: string) =>
  `/api/payslips/${encodeURIComponent(runId)}/${encodeURIComponent(employeeId)}.pdf`;

// ---------- dashboard & reports ----------
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function getDashboard(range: number, period: string) {
  const q = new URLSearchParams({ today: localToday(), range: String(range), period });
  return (await api.get<{ dashboard: DashboardData }>(`/api/dashboard?${q}`)).dashboard;
}

export interface ReportData { headers: string[]; rows: (Record<string, string | number> & { id: string })[]; footer?: string }

function reportQuery(opts: { period: string; departmentId?: string; fields?: string[] }) {
  const q = new URLSearchParams({ period: opts.period });
  if (opts.departmentId) q.set("departmentId", opts.departmentId);
  if (opts.fields?.length) q.set("fields", opts.fields.join(","));
  return q;
}

export async function getReport(type: string, opts: { period: string; departmentId?: string; fields?: string[] }) {
  return (await api.get<{ report: ReportData }>(`/api/reports/${encodeURIComponent(type)}?${reportQuery(opts)}`)).report;
}

export function reportCsvUrl(type: string, opts: { period: string; departmentId?: string; fields?: string[] }) {
  const q = reportQuery(opts);
  q.set("format", "csv");
  return `/api/reports/${encodeURIComponent(type)}?${q}`;
}
