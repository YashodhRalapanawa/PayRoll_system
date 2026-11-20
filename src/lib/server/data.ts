import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "@/lib/api/errors";
import {
  ROLE_LABEL, toActivity, toAttendance, toBranch, toCompany, toDepartment, toDesignation, toEmployee, toHoliday,
  toLeaveRequest, toLeaveType, toPayrollRun, toPayrollSettings, toSalaryStructure, toShift,
} from "@/lib/mappers";
import type { CurrentProfile } from "@/lib/auth/guard";
import type { Me } from "@/lib/types";
import type {
  ActivityRow, AttendanceRow, BranchRow, CompanyRow, DepartmentRow, DesignationRow, EmployeeRow, HolidayRow,
  LeaveRequestRow, LeaveTypeRow, PayrollLineRow, PayrollRunRow, PayrollSettingsRow, SalaryItemRow, SalaryStructureRow, ShiftRow,
} from "@/types/database";

/** Explicit column lists: never select("*"), so new sensitive columns are not leaked by accident. */
export const COLS = {
  company: "id, name, email, phone, address, logo_path, country, currency_code, currency_symbol, currency_name, setup_complete",
  branch: "id, name, code, address, contact",
  department: "id, name",
  designation: "id, name, department_id",
  shift: "id, name, start_time, end_time, break_mins, late_grace_mins, status",
  employee:
    "id, emp_no, first_name, last_name, nic, dob, gender, phone, email, address, department_id, designation_id, branch_id, shift_id, join_date, employment_type, status, salary_structure_id, basic_override, bank_name, bank_account, epf_no",
  document: "id, employee_id, name, reference, storage_path, mime_type, size_bytes, created_at",
  attendance: "id, employee_id, date, in_time, out_time, status, overtime_hours",
  activity: "id, type, title, detail, created_at",
  profile: "id, company_id, full_name, email, role, created_at",
  invite: "id, email, role, accepted_at, created_at",
  leaveType: "id, name, days_per_year, paid",
  holiday: "id, name, date",
  leaveRequest: "id, employee_id, leave_type_id, start_date, end_date, days, reason, status, created_at",
  salaryStructure: "id, name, basic",
  salaryItem: "id, structure_id, kind, name, amount_type, amount, sort_order",
  payrollSettings: "epf_employee, epf_employer, etf, pay_day, ot_rate, ot_hours_divisor, nopay_days_divisor",
  payrollRun: "id, period, status, payment_date, created_at, approved_at, settings_snapshot",
  payrollLine:
    "id, run_id, employee_id, employee_snapshot, basic, allowances, deductions, overtime_hours, nopay_days, gross, epf_employee, total_deductions, net, epf_employer, etf, payslip_path",
} as const;

export const toMe = (p: CurrentProfile): Me => ({
  id: p.userId, name: p.fullName || p.email, email: p.email, role: ROLE_LABEL[p.role], companyId: p.companyId,
});

export function logoUrl(supabase: SupabaseClient, path: string | null) {
  return path ? supabase.storage.from("company-logos").getPublicUrl(path).data.publicUrl : undefined;
}

export async function loadCompany(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("companies").select(COLS.company).single<CompanyRow>();
  if (error) throw dbError(error, "Company not found.");
  return toCompany(data, logoUrl(supabase, data.logo_path));
}

export async function listBranches(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("branches").select(COLS.branch).order("code").returns<BranchRow[]>();
  if (error) throw dbError(error);
  return data.map(toBranch);
}

export async function listDepartments(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("departments").select(COLS.department).order("name").returns<DepartmentRow[]>();
  if (error) throw dbError(error);
  return data.map(toDepartment);
}

export async function listDesignations(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("designations").select(COLS.designation).order("name").returns<DesignationRow[]>();
  if (error) throw dbError(error);
  return data.map(toDesignation);
}

export async function listShifts(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("shifts").select(COLS.shift).order("name").returns<ShiftRow[]>();
  if (error) throw dbError(error);
  return data.map(toShift);
}

export async function listEmployees(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("employees").select(COLS.employee).order("emp_no").returns<EmployeeRow[]>();
  if (error) throw dbError(error);
  return data.map(toEmployee);
}

export async function listAttendance(supabase: SupabaseClient, from: string, to: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select(COLS.attendance)
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .limit(50_000)
    .returns<AttendanceRow[]>();
  if (error) throw dbError(error);
  return data.map(toAttendance);
}

export async function listActivities(supabase: SupabaseClient, limit = 50) {
  const { data, error } = await supabase
    .from("activity_log")
    .select(COLS.activity)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ActivityRow[]>();
  if (error) throw dbError(error);
  return data.map(toActivity);
}

// ---------- Developer B ----------
export async function listLeaveTypes(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("leave_types").select(COLS.leaveType).order("name").returns<LeaveTypeRow[]>();
  if (error) throw dbError(error);
  return data.map(toLeaveType);
}

export async function listHolidays(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("holidays").select(COLS.holiday).order("date").returns<HolidayRow[]>();
  if (error) throw dbError(error);
  return data.map(toHoliday);
}

export async function listLeaveRequests(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select(COLS.leaveRequest)
    .order("created_at", { ascending: false })
    .limit(20_000)
    .returns<LeaveRequestRow[]>();
  if (error) throw dbError(error);
  return data.map(toLeaveRequest);
}

export async function listSalaryStructures(supabase: SupabaseClient, ids?: string[]) {
  let sq = supabase.from("salary_structures").select(COLS.salaryStructure).order("name");
  let iq = supabase.from("salary_items").select(COLS.salaryItem);
  if (ids) {
    sq = sq.in("id", ids);
    iq = iq.in("structure_id", ids);
  }
  const [s, i] = await Promise.all([sq.returns<SalaryStructureRow[]>(), iq.returns<SalaryItemRow[]>()]);
  if (s.error) throw dbError(s.error);
  if (i.error) throw dbError(i.error);
  return s.data.map((row) => toSalaryStructure(row, i.data));
}

export async function getPayrollSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("payroll_settings").select(COLS.payrollSettings).single<PayrollSettingsRow>();
  if (error) throw dbError(error, "Payroll settings not found.");
  return toPayrollSettings(data);
}

/** Payroll runs with their lines; pass runIds to load specific runs. */
export async function listPayrollRuns(supabase: SupabaseClient, runIds?: string[]) {
  let rq = supabase.from("payroll_runs").select(COLS.payrollRun).order("period", { ascending: false });
  if (runIds) rq = rq.in("id", runIds);
  const { data: runs, error } = await rq.returns<PayrollRunRow[]>();
  if (error) throw dbError(error);
  if (!runs.length) return [];
  const { data: lines, error: lErr } = await supabase
    .from("payroll_lines")
    .select(COLS.payrollLine)
    .in("run_id", runs.map((r) => r.id))
    .limit(100_000)
    .returns<PayrollLineRow[]>();
  if (lErr) throw dbError(lErr);
  return runs.map((r) => toPayrollRun(r, lines));
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
