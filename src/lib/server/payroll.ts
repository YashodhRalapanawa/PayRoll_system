import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, dbError } from "@/lib/api/errors";
import type { ActiveProfile } from "@/lib/auth/guard";
import { calculatePay, paymentDate, payrollInputs, periodRange, resolveBasic } from "@/lib/payroll";
import type { EmployeeSnapshot, PayrollRun } from "@/lib/types";
import type { AttendanceRow, EmployeeRow, LeaveRequestRow } from "@/types/database";
import { logActivity } from "./activity";
import { COLS, getPayrollSettings, listPayrollRuns, listSalaryStructures } from "./data";

export interface CalculationResult {
  run: PayrollRun;
  /** Active employees left out because they have no salary structure or basic salary. */
  skipped: { id: string; name: string }[];
}

const num = (v: number | string | null) => (v === null || v === "" ? null : Number(v));

/**
 * B5 · Calculates (or recalculates) the draft payroll run for a period, on the
 * server, from database data only. Approved runs are locked and refused here
 * and again by the database trigger.
 *
 * Included employees: active, joined on or before the period's last day, with
 * a salary structure or a basic salary override.
 */
export async function calculatePayrollRun(supabase: SupabaseClient, profile: ActiveProfile, period: string): Promise<CalculationResult> {
  const { start, end } = periodRange(period);

  const { data: existing, error: exErr } = await supabase
    .from("payroll_runs")
    .select("id, status")
    .eq("period", period)
    .maybeSingle<{ id: string; status: "draft" | "approved" }>();
  if (exErr) throw dbError(exErr);
  if (existing?.status === "approved") throw new ApiError(409, `Payroll for ${period} is approved and locked.`);

  const [settings, empRes, leaveRes, typeRes, holRes, attRes, depRes, desRes, brRes] = await Promise.all([
    getPayrollSettings(supabase),
    supabase.from("employees").select(COLS.employee).eq("status", "active").lte("join_date", end).returns<EmployeeRow[]>(),
    supabase
      .from("leave_requests")
      .select(COLS.leaveRequest)
      .eq("status", "approved")
      .lte("start_date", end)
      .gte("end_date", start)
      .returns<LeaveRequestRow[]>(),
    supabase.from("leave_types").select("id, paid").returns<{ id: string; paid: boolean }[]>(),
    supabase.from("holidays").select("date").gte("date", start).lte("date", end).returns<{ date: string }[]>(),
    supabase.from("attendance").select(COLS.attendance).gte("date", start).lte("date", end).limit(100_000).returns<AttendanceRow[]>(),
    supabase.from("departments").select("id, name").returns<{ id: string; name: string }[]>(),
    supabase.from("designations").select("id, name").returns<{ id: string; name: string }[]>(),
    supabase.from("branches").select("id, name").returns<{ id: string; name: string }[]>(),
  ]);
  for (const r of [empRes, leaveRes, typeRes, holRes, attRes, depRes, desRes, brRes]) if (r.error) throw dbError(r.error);

  const employees = empRes.data!;
  const structureIds = [...new Set(employees.map((e) => e.salary_structure_id).filter((x): x is string => !!x))];
  const structures = new Map((structureIds.length ? await listSalaryStructures(supabase, structureIds) : []).map((s) => [s.id, s]));
  const paidType = new Map(typeRes.data!.map((t) => [t.id, t.paid]));
  const holidays = holRes.data!.map((h) => h.date);
  const nameOf = (rows: { id: string; name: string }[] | null) => {
    const m = new Map((rows ?? []).map((r) => [r.id, r.name]));
    return (id: string | null) => (id ? m.get(id) ?? "" : "");
  };
  const dep = nameOf(depRes.data), des = nameOf(desRes.data), br = nameOf(brRes.data);

  const included = employees.filter((e) => e.salary_structure_id || num(e.basic_override) !== null);
  const skipped = employees
    .filter((e) => !included.includes(e))
    .map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }));
  if (!included.length) throw new ApiError(400, "No active employees with salary data for this period.");

  const lines = included.map((e) => {
    const structure = e.salary_structure_id ? structures.get(e.salary_structure_id) : undefined;
    const inputs = payrollInputs(period, {
      joinDate: e.join_date,
      attendance: attRes
        .data!.filter((a) => a.employee_id === e.id)
        .map((a) => ({ date: a.date, absent: a.status === "absent", overtimeHours: Number(a.overtime_hours) || 0 })),
      leave: leaveRes
        .data!.filter((l) => l.employee_id === e.id)
        .map((l) => ({ start: l.start_date, end: l.end_date, paid: paidType.get(l.leave_type_id) ?? true })),
      holidays,
    });
    const pay = calculatePay(
      {
        basic: resolveBasic(num(e.basic_override), structure?.basic),
        allowances: structure?.allowances ?? [],
        deductions: structure?.deductions ?? [],
        ...inputs,
      },
      settings,
    );
    const snapshot: EmployeeSnapshot = {
      name: `${e.first_name} ${e.last_name}`,
      empNo: e.emp_no,
      designation: des(e.designation_id),
      department: dep(e.department_id),
      branch: br(e.branch_id),
      epfNo: e.epf_no ?? "",
      bankName: e.bank_name ?? "",
      bankAccount: e.bank_account ?? "",
    };
    return {
      employee_id: e.id,
      employee_snapshot: snapshot,
      basic: pay.basic,
      allowances: pay.allowances,
      deductions: pay.deductions,
      overtime_hours: pay.overtimeHours,
      nopay_days: pay.nopayDays,
      gross: pay.gross,
      epf_employee: pay.epfEmployee,
      total_deductions: pay.totalDeductions,
      net: pay.net,
      epf_employer: pay.epfEmployer,
      etf: pay.etf,
    };
  });

  const runFields = {
    payment_date: paymentDate(period, settings.payDay),
    settings_snapshot: settings,
    calculated_by: profile.userId,
    calculated_at: new Date().toISOString(),
  };

  let runId: string;
  if (existing) {
    const { data, error } = await supabase
      .from("payroll_runs")
      .update(runFields)
      .eq("id", existing.id)
      .eq("status", "draft")
      .select("id")
      .single<{ id: string }>();
    if (error) throw dbError(error, "Draft payroll run not found.");
    runId = data.id;
    const { error: delErr } = await supabase.from("payroll_lines").delete().eq("run_id", runId);
    if (delErr) throw dbError(delErr);
  } else {
    const { data, error } = await supabase.from("payroll_runs").insert({ period, ...runFields }).select("id").single<{ id: string }>();
    if (error) throw dbError(error);
    runId = data.id;
  }

  const { error: lineErr } = await supabase.from("payroll_lines").insert(lines.map((l) => ({ ...l, run_id: runId })));
  if (lineErr) throw dbError(lineErr);

  await logActivity(supabase, "payroll", "Payroll calculated", `${period} draft payroll calculated for ${lines.length} employees.`);
  const [run] = await listPayrollRuns(supabase, [runId]);
  return { run, skipped };
}
