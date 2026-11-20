import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "@/lib/api/errors";
import {
  ROLE_LABEL, toActivity, toAttendance, toBranch, toCompany, toDepartment, toDesignation, toEmployee, toShift,
} from "@/lib/mappers";
import type { CurrentProfile } from "@/lib/auth/guard";
import type { Me } from "@/lib/types";
import type {
  ActivityRow, AttendanceRow, BranchRow, CompanyRow, DepartmentRow, DesignationRow, EmployeeRow, ShiftRow,
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

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
