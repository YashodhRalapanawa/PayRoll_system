import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { fmtDate, fmtHours, fmtPeriod, hoursBetween, money } from "@/lib/format";
import { leaveBalances } from "@/lib/leave";
import { periodRange, sum } from "@/lib/payroll";
import type { Employee, PayrollLine } from "@/lib/types";
import {
  listActivities, listAttendance, listDepartments, listDesignations, listEmployees, listLeaveRequests, listLeaveTypes,
  listPayrollRuns, loadCompany,
} from "./data";

import { CUSTOM_FIELDS, REPORT_TYPES, type ReportType } from "@/lib/reports";
export { REPORT_TYPES, type ReportType };

export type Row = Record<string, string | number> & { id: string };
export interface Report { headers: string[]; rows: Row[]; footer?: string }


interface Options { period: string; departmentId?: string | null; fields?: string[] }

const empName = (e?: Pick<Employee, "firstName" | "lastName">) => (e ? `${e.firstName} ${e.lastName}`.trim() : "Unknown");

/**
 * B7 · Builds one report on the server from the caller's own company data
 * (row-level security applies to every query).
 */
export async function buildReport(supabase: SupabaseClient, type: ReportType, opts: Options): Promise<Report> {
  const { period } = opts;
  const { start, end } = periodRange(period);
  const company = await loadCompany(supabase);
  const code = company.currencyCode;
  const m = (n: number) => money(n, code, false);

  const needsPeople = type !== "activity";
  const [employees, departments, designations] = needsPeople
    ? await Promise.all([listEmployees(supabase), listDepartments(supabase), listDesignations(supabase)])
    : [[], [], []];
  const dName = (id: string) => departments.find((d) => d.id === id)?.name ?? "—";
  const gName = (id: string) => designations.find((d) => d.id === id)?.name ?? "—";
  const emps = employees.filter((e) => !opts.departmentId || e.departmentId === opts.departmentId);
  const byId = new Map(employees.map((e) => [e.id, e]));

  const runFor = async () => (await listPayrollRuns(supabase)).find((r) => r.period === period);
  const linesIn = (lines: PayrollLine[]) => lines.filter((l) => emps.some((e) => e.id === l.employeeId));
  const who = (l: PayrollLine) => {
    const e = byId.get(l.employeeId);
    return { e, name: l.employee?.name ?? empName(e), no: l.employee?.empNo ?? e?.empNo ?? "" };
  };

  switch (type) {
    case "employee":
      return {
        headers: ["Emp ID", "Name", "Department", "Designation", "Join Date", "Type", "Status"],
        rows: emps.map((e) => ({ id: e.id, "Emp ID": e.empNo, Name: empName(e), Department: dName(e.departmentId), Designation: gName(e.designationId), "Join Date": e.joinDate, Type: e.employmentType, Status: e.status })),
      };

    case "attendance": {
      const att = await listAttendance(supabase, start, end);
      return {
        headers: ["Emp ID", "Name", "Present", "Late", "Half Day", "Absent", "On Leave", "Hours", "OT Hours"],
        rows: emps.map((e) => {
          const a = att.filter((x) => x.employeeId === e.id);
          const c = (st: string) => a.filter((x) => x.status === st).length;
          return {
            id: e.id, "Emp ID": e.empNo, Name: empName(e), Present: c("Present"), Late: c("Late"), "Half Day": c("Half Day"), Absent: c("Absent"), "On Leave": c("On Leave"),
            Hours: fmtHours(a.reduce((t, x) => t + hoursBetween(x.inTime, x.outTime), 0)), "OT Hours": a.reduce((t, x) => t + x.overtimeHours, 0),
          };
        }),
      };
    }

    case "leave": {
      const [types, requests] = await Promise.all([listLeaveTypes(supabase), listLeaveRequests(supabase)]);
      const paid = types.filter((t) => t.paid);
      const year = Number(period.slice(0, 4));
      return {
        headers: ["Emp ID", "Name", ...paid.flatMap((t) => [`${t.name} used`, `${t.name} left`])],
        rows: emps.map((e) => {
          const b = leaveBalances(e.id, types, requests, year);
          const r: Row = { id: e.id, "Emp ID": e.empNo, Name: empName(e) };
          paid.forEach((t) => {
            const x = b.find((y) => y.type.id === t.id)!;
            r[`${t.name} used`] = x.used;
            r[`${t.name} left`] = x.remaining;
          });
          return r;
        }),
        footer: `Balances for ${year}.`,
      };
    }

    case "payroll": {
      const run = await runFor();
      const lines = linesIn(run?.lines ?? []);
      return {
        headers: ["Emp ID", "Name", "Gross", "Deductions", "Net Pay"],
        rows: lines.map((l) => { const x = who(l); return { id: l.employeeId, "Emp ID": x.no, Name: x.name, Gross: m(l.gross), Deductions: m(l.totalDeductions), "Net Pay": m(l.net) }; }),
        footer: run ? `${run.status} · Gross ${money(sum(lines, "gross"), code)} · Deductions ${money(sum(lines, "totalDeductions"), code)} · Net ${money(sum(lines, "net"), code)}` : `No payroll run for ${fmtPeriod(period)}.`,
      };
    }

    case "register": {
      const run = await runFor();
      const lines = linesIn(run?.lines ?? []);
      return {
        headers: ["Emp ID", "Name", "Basic", "Allowances", "Gross", "EPF (employee)", "Other Deductions", "Net Pay", "Bank"],
        rows: lines.map((l) => {
          const x = who(l);
          const bank = l.employee ? `${l.employee.bankName} ${l.employee.bankAccount}` : `${x.e?.bankName ?? ""} ${x.e?.bankAccount ?? ""}`;
          return { id: l.employeeId, "Emp ID": x.no, Name: x.name, Basic: m(l.basic), Allowances: m(l.gross - l.basic), Gross: m(l.gross), "EPF (employee)": m(l.epfEmployee), "Other Deductions": m(l.totalDeductions - l.epfEmployee), "Net Pay": m(l.net), Bank: bank.trim() };
        }),
        footer: run ? undefined : `No payroll run for ${fmtPeriod(period)}.`,
      };
    }

    case "epf": {
      const run = await runFor();
      const lines = linesIn(run?.lines ?? []);
      return {
        headers: ["Emp ID", "Name", "EPF No", "Basic", "EPF Employee", "EPF Employer", "Total EPF", "ETF"],
        rows: lines.map((l) => {
          const x = who(l);
          return { id: l.employeeId, "Emp ID": x.no, Name: x.name, "EPF No": l.employee?.epfNo ?? x.e?.epfNo ?? "", Basic: m(l.basic), "EPF Employee": m(l.epfEmployee), "EPF Employer": m(l.epfEmployer), "Total EPF": m(l.epfEmployee + l.epfEmployer), ETF: m(l.etf) };
        }),
        footer: run ? `Total EPF ${money(sum(lines, "epfEmployee") + sum(lines, "epfEmployer"), code)} · Total ETF ${money(sum(lines, "etf"), code)}` : `No payroll run for ${fmtPeriod(period)}.`,
      };
    }

    case "department": {
      const [att, run] = await Promise.all([listAttendance(supabase, start, end), runFor()]);
      return {
        headers: ["Department", "Employees", "Active", "Present days", "Net Payroll"],
        rows: departments.map((d) => {
          const de = employees.filter((e) => e.departmentId === d.id);
          const ids = new Set(de.map((e) => e.id));
          return {
            id: d.id, Department: d.name, Employees: de.length, Active: de.filter((e) => e.status === "Active").length,
            "Present days": att.filter((a) => ids.has(a.employeeId) && a.status !== "Absent" && a.status !== "On Leave").length,
            "Net Payroll": m(sum((run?.lines ?? []).filter((l) => ids.has(l.employeeId)), "net")),
          };
        }),
      };
    }

    case "custom": {
      const fields = (opts.fields ?? []).filter((f): f is (typeof CUSTOM_FIELDS)[number] => (CUSTOM_FIELDS as readonly string[]).includes(f));
      if (!fields.length) throw new ApiError(400, "Choose at least one field.");
      const value: Record<(typeof CUSTOM_FIELDS)[number], (e: Employee) => string> = {
        "Emp ID": (e) => e.empNo, Name: (e) => empName(e), NIC: (e) => e.nic, Department: (e) => dName(e.departmentId),
        Designation: (e) => gName(e.designationId), Phone: (e) => e.phone, Email: (e) => e.email, "Join Date": (e) => e.joinDate,
        Type: (e) => e.employmentType, Status: (e) => e.status, "EPF No": (e) => e.epfNo ?? "", Bank: (e) => `${e.bankName ?? ""} ${e.bankAccount ?? ""}`.trim(),
      };
      return {
        headers: fields,
        rows: emps.map((e) => {
          const r: Row = { id: e.id };
          fields.forEach((f) => (r[f] = value[f](e)));
          return r;
        }),
      };
    }

    case "activity": {
      const acts = await listActivities(supabase, 200);
      return {
        headers: ["When", "Activity", "Detail"],
        rows: acts.map((a) => ({ id: a.id, When: `${fmtDate(a.at)} ${new Date(a.at).toISOString().slice(11, 16)} UTC`, Activity: a.title, Detail: a.detail })),
      };
    }
  }
}
