/**
 * Conversions between database rows (snake_case, lowercase enums) and the
 * app types the screens use (camelCase, display labels).
 */
import type {
  ActivityRow, AppRole, AttendanceRow, AttendanceStatusDb, BranchRow, CompanyRow, DepartmentRow,
  DesignationRow, EmployeeDocumentRow, EmployeeRow, EmploymentType, InviteRow, ProfileRow, RecordStatus, ShiftRow,
} from "@/types/database";
import type {
  Activity, Attendance, AttendanceStatus, Branch, Company, Department, Designation, DocumentRef, Employee,
  Invite, RoleLabel, Shift, Status, User,
} from "./types";

function invert<K extends string, V extends string>(m: Record<K, V>) {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;
}

export const ROLE_LABEL: Record<AppRole, RoleLabel> = { admin: "Administrator", hr_manager: "HR Manager", viewer: "Viewer" };
export const ROLE_VALUE = invert(ROLE_LABEL);

export const STATUS_LABEL: Record<RecordStatus, Status> = { active: "Active", inactive: "Inactive" };
export const STATUS_VALUE = invert(STATUS_LABEL);

export const EMPLOYMENT_LABEL: Record<EmploymentType, Employee["employmentType"]> = {
  permanent: "Permanent", contract: "Contract", probation: "Probation", intern: "Intern",
};
export const EMPLOYMENT_VALUE = invert(EMPLOYMENT_LABEL);

export const ATTENDANCE_LABEL: Record<AttendanceStatusDb, AttendanceStatus> = {
  present: "Present", absent: "Absent", late: "Late", on_leave: "On Leave", half_day: "Half Day",
};
export const ATTENDANCE_VALUE = invert(ATTENDANCE_LABEL);

/** "08:30:00" -> "08:30" */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : undefined);
const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? undefined : Number(v));

export const toUser = (p: ProfileRow): User => ({ id: p.id, name: p.full_name || p.email, email: p.email, role: ROLE_LABEL[p.role] });

export const toInvite = (i: InviteRow): Invite => ({ id: i.id, email: i.email, role: ROLE_LABEL[i.role], createdAt: i.created_at });

export const toCompany = (c: CompanyRow, logoUrl?: string): Company => ({
  name: c.name, email: c.email, phone: c.phone, address: c.address, logo: logoUrl,
  country: c.country, currencyCode: c.currency_code, currencySymbol: c.currency_symbol, currencyName: c.currency_name,
});

export const toBranch = (b: BranchRow): Branch => ({ id: b.id, name: b.name, code: b.code, address: b.address, contact: b.contact });
export const toDepartment = (d: DepartmentRow): Department => ({ id: d.id, name: d.name });
export const toDesignation = (d: DesignationRow): Designation => ({ id: d.id, name: d.name, departmentId: d.department_id ?? undefined });

export const toShift = (s: ShiftRow): Shift => ({
  id: s.id, name: s.name, start: hhmm(s.start_time)!, end: hhmm(s.end_time)!, breakMins: s.break_mins, status: STATUS_LABEL[s.status],
});

export const toEmployee = (e: EmployeeRow): Employee => ({
  id: e.id, empNo: e.emp_no, firstName: e.first_name, lastName: e.last_name, nic: e.nic,
  dob: e.dob ?? "", gender: e.gender ?? "", phone: e.phone, email: e.email, address: e.address,
  departmentId: e.department_id, designationId: e.designation_id, branchId: e.branch_id, shiftId: e.shift_id ?? undefined,
  joinDate: e.join_date, employmentType: EMPLOYMENT_LABEL[e.employment_type], status: STATUS_LABEL[e.status],
  salaryStructureId: e.salary_structure_id ?? undefined, basicSalary: num(e.basic_override),
  bankName: e.bank_name ?? undefined, bankAccount: e.bank_account ?? undefined, epfNo: e.epf_no ?? undefined,
  documents: [],
});

export const toDocument = (d: EmployeeDocumentRow): DocumentRef => ({
  id: d.id, name: d.name, reference: d.reference, addedOn: d.created_at.slice(0, 10),
  hasFile: !!d.storage_path, mimeType: d.mime_type ?? undefined, size: d.size_bytes ?? undefined,
});

export const toAttendance = (a: AttendanceRow): Attendance => ({
  id: a.id, employeeId: a.employee_id, date: a.date, inTime: hhmm(a.in_time), outTime: hhmm(a.out_time),
  status: ATTENDANCE_LABEL[a.status], overtimeHours: Number(a.overtime_hours) || 0,
});

export const toActivity = (a: ActivityRow): Activity => ({ id: a.id, type: a.type, title: a.title, detail: a.detail, at: a.created_at });
