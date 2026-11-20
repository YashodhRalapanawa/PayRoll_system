/**
 * Input validation shared by API routes (authoritative) and forms (early feedback).
 * Unknown keys are stripped, strings are trimmed and length-limited, and
 * enum labels from the UI are mapped to database values.
 */
import { z } from "zod";
import { COUNTRIES } from "./countries";
import {
  ATTENDANCE_VALUE, EMPLOYMENT_VALUE, ROLE_VALUE, STATUS_VALUE,
} from "./mappers";

// ---------- primitives ----------
const text = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer`);
const required = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max, `Must be ${max} characters or fewer`);
const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : null));

export const uuid = z.string().uuid("Invalid id");

function isRealDate(s: string) {
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD").refine(isRealDate, "Invalid date");
const optionalDate = z.union([z.literal(""), isoDate]).optional().nullable().transform((v) => v || null);

export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use the format HH:MM");
const optionalTime = z.union([z.literal(""), time]).optional().nullable().transform((v) => (v ? v.slice(0, 5) : null));

const phone = text(20).regex(/^[0-9+()\-\s]*$/, "Use digits, spaces, +, - and brackets only");
const email = z.string().trim().toLowerCase().max(254).email("Enter a valid email address");
const code = (label: string, max: number) => required(label, max).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - and _ only");

const statusLabel = z.enum(["Active", "Inactive"]);
const roleLabel = z.enum(["Administrator", "HR Manager", "Viewer"]);

/** Local calendar date with a one-day allowance for time-zone differences. */
function latestAllowedDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------- company & onboarding ----------
const companyFields = z.object({
  name: required("Company name", 120),
  email,
  phone: phone.min(1, "Phone number is required"),
  address: required("Business address", 500),
  country: z.string().refine((c) => COUNTRIES.some((x) => x.name === c), "Select a supported country"),
});

/** Currency always follows the country; client-sent currency fields are ignored. */
export const companySchema = companyFields.transform((c) => {
  const k = COUNTRIES.find((x) => x.name === c.country)!;
  return {
    name: c.name, email: c.email, phone: c.phone, address: c.address, country: k.name,
    currency_code: k.code, currency_symbol: k.symbol, currency_name: k.currency,
  };
});

export const branchSchema = z.object({
  name: required("Branch name", 120),
  code: code("Branch code", 20),
  address: text(500).default(""),
  contact: phone.default(""),
});

export const onboardingSchema = z.object({
  company: companySchema,
  branch: branchSchema.extend({
    address: required("Store address", 500),
    contact: phone.min(1, "Contact number is required"),
  }),
});

// ---------- organization ----------
export const departmentSchema = z.object({ name: required("Department name", 80) });

export const designationSchema = z
  .object({ name: required("Designation name", 80), departmentId: uuid.nullable().optional() })
  .transform((d) => ({ name: d.name, department_id: d.departmentId ?? null }));

// ---------- employees ----------
const employeeFields = {
  empNo: code("Employee ID", 20),
  firstName: required("First name", 80),
  lastName: required("Last name", 80),
  nic: required("NIC number", 20).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and - only"),
  dob: optionalDate.refine((d) => !d || (d >= "1900-01-01" && d <= new Date().toISOString().slice(0, 10)), "Date of birth must be in the past"),
  gender: z.union([z.enum(["Male", "Female", "Other"]), z.literal("")]).optional().transform((g) => g || null),
  phone: phone.default(""),
  email: z.union([z.literal(""), email]).default(""),
  address: text(500).default(""),
  departmentId: uuid,
  designationId: uuid,
  branchId: uuid,
  shiftId: uuid.nullable().optional(),
  joinDate: isoDate,
  employmentType: z.enum(["Permanent", "Contract", "Probation", "Intern"]),
  status: statusLabel,
  salaryStructureId: uuid.nullable().optional(),
  basicSalary: z.number().finite().nonnegative("Must be zero or more").max(1_000_000_000).nullable().optional(),
  bankName: optionalText(100),
  bankAccount: text(34).regex(/^[0-9A-Za-z -]*$/, "Use letters, numbers, spaces and - only").optional().transform((v) => v || null),
  epfNo: optionalText(30),
};

type EmployeeKey = keyof typeof employeeFields;
const employeeColumns: Record<EmployeeKey, string> = {
  empNo: "emp_no", firstName: "first_name", lastName: "last_name", nic: "nic", dob: "dob", gender: "gender",
  phone: "phone", email: "email", address: "address", departmentId: "department_id", designationId: "designation_id",
  branchId: "branch_id", shiftId: "shift_id", joinDate: "join_date", employmentType: "employment_type", status: "status",
  salaryStructureId: "salary_structure_id", basicSalary: "basic_override", bankName: "bank_name", bankAccount: "bank_account", epfNo: "epf_no",
};

function employeeToRow(input: Partial<Record<EmployeeKey, unknown>>) {
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(employeeColumns) as [EmployeeKey, string][]) {
    if (!(key in input) || input[key] === undefined) continue;
    let v = input[key];
    if (key === "employmentType") v = EMPLOYMENT_VALUE[v as keyof typeof EMPLOYMENT_VALUE];
    if (key === "status") v = STATUS_VALUE[v as keyof typeof STATUS_VALUE];
    row[column] = v;
  }
  return row;
}

export const employeeCreateSchema = z.object(employeeFields).transform((e) => ({
  ...employeeToRow(e),
  shift_id: e.shiftId ?? null,
  salary_structure_id: e.salaryStructureId ?? null,
  basic_override: e.basicSalary ?? null,
}));

/** PATCH: any subset of fields; only the keys sent are changed. */
export const employeeUpdateSchema = z
  .object(employeeFields)
  .partial()
  .refine((e) => Object.values(e).some((v) => v !== undefined), "Nothing to update")
  .transform((e) => employeeToRow(e));

export const documentMetaSchema = z.object({
  name: required("Document name", 120),
  reference: text(300).default(""),
});

// ---------- shifts & attendance ----------
export const shiftSchema = z
  .object({
    name: required("Shift name", 60),
    start: time,
    end: time,
    breakMins: z.number().int("Whole minutes only").min(0).max(720),
    status: statusLabel,
  })
  .transform((s) => ({
    name: s.name, start_time: s.start, end_time: s.end, break_mins: s.breakMins, status: STATUS_VALUE[s.status],
  }));

export const shiftAssignSchema = z.object({ employeeIds: z.array(uuid).max(5000) });

export const attendanceSchema = z
  .object({
    employeeId: uuid,
    date: isoDate.refine((d) => d <= latestAllowedDate(), "Attendance cannot be marked for a future date"),
    inTime: optionalTime,
    outTime: optionalTime,
    status: z.enum(["Present", "Absent", "Late", "On Leave", "Half Day"]),
    overtimeHours: z.number().finite().min(0).max(24),
    note: optionalText(500),
  })
  .transform((a) => {
    const status = ATTENDANCE_VALUE[a.status];
    const off = status === "absent" || status === "on_leave";
    return {
      employee_id: a.employeeId,
      date: a.date,
      status,
      in_time: off ? null : a.inTime,
      out_time: off ? null : a.outTime,
      overtime_hours: off ? 0 : a.overtimeHours,
      note: a.note,
    };
  });

export const attendanceBulkSchema = z.object({
  date: isoDate.refine((d) => d <= latestAllowedDate(), "Attendance cannot be marked for a future date"),
  employeeIds: z.array(uuid).min(1, "No employees selected").max(2000),
});

export const attendanceQuerySchema = z.union([
  z.object({ date: isoDate }),
  z.object({ from: isoDate, to: isoDate }).refine((r) => r.from <= r.to, "from must be on or before to"),
]);

export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM");

// ---------- leave (B3) ----------
export const leaveRequestSchema = z
  .object({
    employeeId: uuid,
    leaveTypeId: uuid,
    from: isoDate,
    to: isoDate,
    reason: text(500).default(""),
  })
  .refine((l) => l.to >= l.from, { message: "End date must be on or after the start date.", path: ["to"] })
  .refine((l) => Date.parse(l.to) - Date.parse(l.from) <= 366 * 86_400_000, { message: "A single request cannot exceed one year.", path: ["to"] });

export const leaveTypeSchema = z
  .object({
    name: required("Leave type name", 60),
    daysPerYear: z.number().finite().min(0).max(366).multipleOf(0.5, "Use whole or half days"),
    paid: z.boolean(),
  })
  .transform((t) => ({ name: t.name, days_per_year: t.paid ? t.daysPerYear : 0, paid: t.paid }));

export const holidaySchema = z.object({ name: required("Holiday name", 80), date: isoDate });

// ---------- salary (B4) ----------
const money = (label: string) => z.number({ invalid_type_error: `${label} must be a number` }).finite().min(0).max(1_000_000_000);

const salaryItemSchema = z
  .object({
    name: required("Item name", 60),
    type: z.enum(["fixed", "percent"]),
    amount: money("Amount"),
  })
  .refine((i) => i.type !== "percent" || i.amount <= 100, { message: "A percentage cannot exceed 100.", path: ["amount"] });

export const salaryStructureSchema = z.object({
  name: required("Structure name", 80),
  basic: money("Basic salary").refine((v) => v > 0, "Basic salary must be greater than zero."),
  allowances: z.array(salaryItemSchema).max(30, "At most 30 allowances"),
  deductions: z.array(salaryItemSchema).max(30, "At most 30 deductions"),
});

export const employeeIdsSchema = z.object({ employeeIds: z.array(uuid).max(5000) });

// ---------- payroll (B5/B8) ----------
const pct = (label: string) => z.number().finite().min(0, `${label} cannot be negative`).max(100, `${label} cannot exceed 100%`);

export const payrollSettingsSchema = z
  .object({
    epfEmployee: pct("EPF employee"),
    epfEmployer: pct("EPF employer"),
    etf: pct("ETF"),
    payDay: z.number().int("Whole day only").min(1).max(31),
    otRate: z.number().finite().min(0).max(10),
    otHoursDivisor: z.number().finite().min(1).max(744),
    nopayDaysDivisor: z.number().finite().min(1).max(31),
  })
  .transform((p) => ({
    epf_employee: p.epfEmployee, epf_employer: p.epfEmployer, etf: p.etf, pay_day: p.payDay,
    ot_rate: p.otRate, ot_hours_divisor: p.otHoursDivisor, nopay_days_divisor: p.nopayDaysDivisor,
  }));

export const payrollCalculateSchema = z.object({ period: periodSchema });

// ---------- roles & activity ----------
export const roleUpdateSchema = z.object({ role: roleLabel }).transform((r) => ({ role: ROLE_VALUE[r.role] }));

export const inviteSchema = z
  .object({ email, role: roleLabel })
  .transform((i) => ({ email: i.email, role: ROLE_VALUE[i.role] }));

export const activitySchema = z.object({
  type: z.enum(["employee", "leave", "payroll", "shift", "attendance", "settings"]),
  title: required("Title", 200),
  detail: text(1000).default(""),
});

// ---------- auth forms (client side; Supabase Auth enforces its own rules) ----------
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.")
  .regex(/[A-Za-z]/, "Password must include a letter.")
  .regex(/[0-9]/, "Password must include a number.");

/** Flattens a ZodError into { "field.path": "message" } for forms and API responses. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
