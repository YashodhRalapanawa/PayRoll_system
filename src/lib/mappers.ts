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
import type {
  HolidayRow, LeaveRequestRow, LeaveStatusDb, LeaveTypeRow, PayrollLineRow, PayrollRunRow, PayrollSettingsRow,
  SalaryItemRow, SalaryStructureRow,
} from "@/types/database";
import type {
  EmployeeSnapshot, Holiday, LeaveRequest, LeaveStatus, LeaveType, PayrollLine, PayrollRun, PayrollSettings, SalaryStructure,
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

// ---------- Developer B ----------

export const LEAVE_STATUS_LABEL: Record<LeaveStatusDb, LeaveStatus> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

const n0 = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export const toLeaveType = (t: LeaveTypeRow): LeaveType => ({ id: t.id, name: t.name, daysPerYear: n0(t.days_per_year), paid: t.paid });
export const toHoliday = (h: HolidayRow): Holiday => ({ id: h.id, name: h.name, date: h.date });

export const toLeaveRequest = (r: LeaveRequestRow): LeaveRequest => ({
  id: r.id, employeeId: r.employee_id, leaveTypeId: r.leave_type_id, from: r.start_date, to: r.end_date,
  days: n0(r.days), reason: r.reason, status: LEAVE_STATUS_LABEL[r.status], createdAt: r.created_at,
});

export function toSalaryStructure(s: SalaryStructureRow, items: SalaryItemRow[]): SalaryStructure {
  const mine = items.filter((i) => i.structure_id === s.id).sort((a, b) => a.sort_order - b.sort_order);
  const item = (i: SalaryItemRow) => ({ id: i.id, name: i.name, type: i.amount_type, amount: n0(i.amount) });
  return {
    id: s.id, name: s.name, basic: n0(s.basic),
    allowances: mine.filter((i) => i.kind === "allowance").map(item),
    deductions: mine.filter((i) => i.kind === "deduction").map(item),
  };
}

export const toPayrollSettings = (p: PayrollSettingsRow): PayrollSettings => ({
  epfEmployee: n0(p.epf_employee), epfEmployer: n0(p.epf_employer), etf: n0(p.etf), payDay: p.pay_day,
  otRate: n0(p.ot_rate), otHoursDivisor: n0(p.ot_hours_divisor) || 240, nopayDaysDivisor: n0(p.nopay_days_divisor) || 30,
});

const SNAPSHOT_KEYS: (keyof EmployeeSnapshot)[] = ["name", "empNo", "designation", "department", "branch", "epfNo", "bankName", "bankAccount"];
const toSnapshot = (s: Record<string, string> | null): EmployeeSnapshot | undefined =>
  s && s.name ? (Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, String(s[k] ?? "")])) as unknown as EmployeeSnapshot) : undefined;

export const toPayrollLine = (l: PayrollLineRow): PayrollLine => ({
  employeeId: l.employee_id, basic: n0(l.basic),
  allowances: (l.allowances ?? []).map((a) => ({ name: String(a.name), amount: n0(a.amount) })),
  deductions: (l.deductions ?? []).map((a) => ({ name: String(a.name), amount: n0(a.amount) })),
  overtimeHours: n0(l.overtime_hours), nopayDays: n0(l.nopay_days),
  gross: n0(l.gross), epfEmployee: n0(l.epf_employee), totalDeductions: n0(l.total_deductions), net: n0(l.net),
  epfEmployer: n0(l.epf_employer), etf: n0(l.etf), employee: toSnapshot(l.employee_snapshot),
});

export const toPayrollRun = (r: PayrollRunRow, lines: PayrollLineRow[]): PayrollRun => ({
  id: r.id, period: r.period, status: r.status === "approved" ? "Approved" : "Draft", createdAt: r.created_at,
  paymentDate: r.payment_date ?? "", approvedAt: r.approved_at ?? undefined,
  lines: lines.filter((l) => l.run_id === r.id).map(toPayrollLine),
  rates: r.settings_snapshot
    ? { epfEmployee: n0(r.settings_snapshot.epfEmployee), epfEmployer: n0(r.settings_snapshot.epfEmployer), etf: n0(r.settings_snapshot.etf) }
    : undefined,
});
