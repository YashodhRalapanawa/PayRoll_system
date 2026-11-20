/**
 * Row shapes for Developer A's tables, matching supabase/migrations/*_a_*.sql.
 * Replace with `supabase gen types typescript` output once the CLI is linked.
 */
export type AppRole = "admin" | "hr_manager" | "viewer";
export type RecordStatus = "active" | "inactive";
export type ActivityType = "employee" | "leave" | "payroll" | "shift" | "attendance" | "settings";
export type EmploymentType = "permanent" | "contract" | "probation" | "intern";
export type AttendanceStatusDb = "present" | "absent" | "late" | "on_leave" | "half_day";

export interface CompanyRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo_path: string | null;
  country: string;
  currency_code: string;
  currency_symbol: string;
  currency_name: string;
  setup_complete: boolean;
}

export interface ProfileRow {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string;
  role: AppRole;
  created_at: string;
}

export interface InviteRow {
  id: string;
  email: string;
  role: AppRole;
  accepted_at: string | null;
  created_at: string;
}

export interface BranchRow { id: string; name: string; code: string; address: string; contact: string }
export interface DepartmentRow { id: string; name: string }
export interface DesignationRow { id: string; name: string; department_id: string | null }

export interface ShiftRow {
  id: string;
  name: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  break_mins: number;
  late_grace_mins: number;
  status: RecordStatus;
}

export interface EmployeeRow {
  id: string;
  emp_no: string;
  first_name: string;
  last_name: string;
  nic: string;
  dob: string | null;
  gender: string | null;
  phone: string;
  email: string;
  address: string;
  department_id: string;
  designation_id: string;
  branch_id: string;
  shift_id: string | null;
  join_date: string;
  employment_type: EmploymentType;
  status: RecordStatus;
  salary_structure_id: string | null;
  basic_override: number | string | null; // numeric may arrive as string
  bank_name: string | null;
  bank_account: string | null;
  epf_no: string | null;
}

export interface EmployeeDocumentRow {
  id: string;
  employee_id: string;
  name: string;
  reference: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  employee_id: string;
  date: string;
  in_time: string | null;
  out_time: string | null;
  status: AttendanceStatusDb;
  overtime_hours: number | string;
}

export interface ActivityRow {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  created_at: string;
}
