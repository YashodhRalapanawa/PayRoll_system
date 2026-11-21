import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "@/lib/api/errors";
import { eachDate, round2, sum } from "@/lib/payroll";
import type { Activity } from "@/lib/types";
import type { PayrollRunRow } from "@/types/database";
import { listActivities, listAttendance, listDepartments, listEmployees, listLeaveRequests, listLeaveTypes, listPayrollRuns } from "./data";

export interface DashboardData {
  today: string;
  stats: { activeEmployees: number; joinedThisMonth: number; presentToday: number; onLeaveToday: number; payrollThisMonth: number };
  attendanceTrend: { date: string; rate: number }[];
  departments: { name: string; value: number }[];
  upcomingLeaves: { id: string; employeeId: string; employeeName: string; leaveType: string; from: string; to: string; status: string }[];
  payroll: { period: string; status: "Approved" | "Draft" | null; employees: number; net: number; missingSalary: number };
  activities: Activity[];
}

const PRESENT = new Set(["Present", "Late", "Half Day"]);
/** Adds whole days to a YYYY-MM-DD date (UTC, no DST effects). */
const shift = (date: string, days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);

/**
 * B7 · Dashboard figures for the caller's company. `today` is the user's
 * local date (validated by the route) so "today" matches their time zone.
 */
export async function buildDashboard(supabase: SupabaseClient, opts: { today: string; range: number; period: string }): Promise<DashboardData> {
  const { today, range, period } = opts;
  const from = shift(today, -(range - 1));
  const thisPeriod = today.slice(0, 7);

  const [employees, departments, attendance, requests, types, runRows, activities] = await Promise.all([
    listEmployees(supabase),
    listDepartments(supabase),
    listAttendance(supabase, from, today),
    listLeaveRequests(supabase),
    listLeaveTypes(supabase),
    supabase.from("payroll_runs").select("id, period, status").in("period", [...new Set([period, thisPeriod])]).returns<Pick<PayrollRunRow, "id" | "period" | "status">[]>(),
    listActivities(supabase, 4),
  ]);
  if (runRows.error) throw dbError(runRows.error);
  const runs = runRows.data.length ? await listPayrollRuns(supabase, runRows.data.map((r) => r.id)) : [];

  const active = employees.filter((e) => e.status === "Active");
  const activeIds = new Set(active.map((e) => e.id));
  const onLeave = new Set(requests.filter((l) => l.status === "Approved" && l.from <= today && l.to >= today && activeIds.has(l.employeeId)).map((l) => l.employeeId));
  const presentOn = (d: string) => attendance.filter((a) => a.date === d && PRESENT.has(a.status) && activeIds.has(a.employeeId)).length;

  const deptCounts = new Map<string, number>();
  for (const e of active) {
    const n = departments.find((d) => d.id === e.departmentId)?.name ?? "Other";
    deptCounts.set(n, (deptCounts.get(n) ?? 0) + 1);
  }

  const name = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "Unknown";
  };
  const current = runs.find((r) => r.period === thisPeriod);
  const selected = runs.find((r) => r.period === period);

  return {
    today,
    stats: {
      activeEmployees: active.length,
      joinedThisMonth: employees.filter((e) => e.joinDate.slice(0, 7) === thisPeriod).length,
      presentToday: presentOn(today),
      onLeaveToday: onLeave.size,
      payrollThisMonth: current ? sum(current.lines, "net") : 0,
    },
    attendanceTrend: eachDate(from, today).map((d) => ({ date: d, rate: active.length ? round2((presentOn(d) / active.length) * 100) : 0 })),
    departments: [...deptCounts.entries()].sort((a, b) => b[1] - a[1]).map(([n, value]) => ({ name: n, value })),
    upcomingLeaves: requests
      .filter((l) => l.status !== "Rejected" && l.to >= today)
      .sort((a, b) => a.from.localeCompare(b.from))
      .slice(0, 4)
      .map((l) => ({ id: l.id, employeeId: l.employeeId, employeeName: name(l.employeeId), leaveType: types.find((t) => t.id === l.leaveTypeId)?.name ?? "", from: l.from, to: l.to, status: l.status })),
    payroll: {
      period,
      status: selected?.status ?? null,
      employees: selected?.lines.length ?? 0,
      net: selected ? sum(selected.lines, "net") : 0,
      missingSalary: active.filter((e) => !e.salaryStructureId && e.basicSalary === undefined).length,
    },
    activities,
  };
}
