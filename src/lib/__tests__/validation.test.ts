import { describe, expect, it } from "vitest";
import {
  attendanceSchema, employeeCreateSchema, employeeUpdateSchema, inviteSchema, onboardingSchema, roleUpdateSchema, shiftSchema,
} from "@/lib/validation";

const DEP = "11111111-1111-4111-8111-111111111111";
const DES = "22222222-2222-4222-8222-222222222222";
const BR = "33333333-3333-4333-8333-333333333333";

const validEmployee = {
  empNo: "EMP001", firstName: " Nimal ", lastName: "Perera", nic: "901234567V", dob: "1990-05-01", gender: "Male",
  phone: "077 123 4567", email: "Nimal@Example.com", address: "Colombo", departmentId: DEP, designationId: DES,
  branchId: BR, joinDate: "2026-01-15", employmentType: "Permanent", status: "Active", basicSalary: 60000,
};

describe("employee validation", () => {
  it("accepts a valid employee and maps it to database columns", () => {
    const row = employeeCreateSchema.parse(validEmployee);
    expect(row).toMatchObject({
      emp_no: "EMP001", first_name: "Nimal", email: "nimal@example.com", employment_type: "permanent",
      status: "active", basic_override: 60000, shift_id: null, department_id: DEP,
    });
  });

  it("strips unknown keys such as id, company_id and documents", () => {
    const row = employeeCreateSchema.parse({ ...validEmployee, id: "x", company_id: "evil", documents: [], salaryStructureId: "local" });
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("company_id");
    expect(row).not.toHaveProperty("documents");
    expect(row).not.toHaveProperty("salary_structure_id");
  });

  it.each([
    ["empty first name", { firstName: "  " }],
    ["bad NIC characters", { nic: "90123'; drop table" }],
    ["future date of birth", { dob: "2999-01-01" }],
    ["impossible date", { joinDate: "2026-02-30" }],
    ["invalid email", { email: "not-an-email" }],
    ["negative salary", { basicSalary: -1 }],
    ["non-uuid department", { departmentId: "dep-1" }],
    ["unknown employment type", { employmentType: "Owner" }],
    ["overlong name", { lastName: "x".repeat(81) }],
    ["phone with letters", { phone: "call me" }],
  ])("rejects %s", (_label, patch) => {
    expect(employeeCreateSchema.safeParse({ ...validEmployee, ...patch }).success).toBe(false);
  });

  it("allows optional fields to be empty", () => {
    const row = employeeCreateSchema.parse({ ...validEmployee, dob: "", email: "", gender: "", basicSalary: undefined });
    expect(row).toMatchObject({ dob: null, email: "", gender: null, basic_override: null });
  });

  it("partial update only includes the fields sent", () => {
    expect(employeeUpdateSchema.parse({ status: "Inactive" })).toEqual({ status: "inactive" });
    expect(employeeUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("onboarding validation", () => {
  const input = {
    company: { name: "ABC", email: "info@abc.lk", phone: "011 234 5678", address: "Colombo", country: "India", currencyCode: "XXX" },
    branch: { name: "Main", code: "ST001", address: "Colombo", contact: "011" },
  };
  it("derives the currency from the country and ignores client currency", () => {
    const r = onboardingSchema.parse(input);
    expect(r.company).toMatchObject({ country: "India", currency_code: "INR", currency_symbol: "₹" });
  });
  it("rejects unsupported countries and bad branch codes", () => {
    expect(onboardingSchema.safeParse({ ...input, company: { ...input.company, country: "Atlantis" } }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...input, branch: { ...input.branch, code: "ST 001" } }).success).toBe(false);
  });
});

describe("attendance validation", () => {
  const base = { employeeId: DEP, date: "2026-11-02", inTime: "08:30", outTime: "17:30", status: "Present", overtimeHours: 1 };
  it("maps labels and keeps times for present", () => {
    expect(attendanceSchema.parse(base)).toMatchObject({ status: "present", in_time: "08:30", overtime_hours: 1 });
  });
  it("clears times and overtime for absent / on leave", () => {
    expect(attendanceSchema.parse({ ...base, status: "On Leave" })).toMatchObject({ status: "on_leave", in_time: null, out_time: null, overtime_hours: 0 });
  });
  it("rejects future dates, bad times and excessive overtime", () => {
    expect(attendanceSchema.safeParse({ ...base, date: "2999-01-01" }).success).toBe(false);
    expect(attendanceSchema.safeParse({ ...base, inTime: "25:00" }).success).toBe(false);
    expect(attendanceSchema.safeParse({ ...base, overtimeHours: 30 }).success).toBe(false);
  });
});

describe("roles, invites and shifts", () => {
  it("maps role labels and rejects unknown roles", () => {
    expect(roleUpdateSchema.parse({ role: "HR Manager" })).toEqual({ role: "hr_manager" });
    expect(roleUpdateSchema.safeParse({ role: "superuser" }).success).toBe(false);
  });
  it("lower-cases invite emails", () => {
    expect(inviteSchema.parse({ email: " Person@Mail.COM ", role: "Viewer" })).toEqual({ email: "person@mail.com", role: "viewer" });
  });
  it("validates shift times and break length", () => {
    expect(shiftSchema.parse({ name: "General", start: "08:30", end: "17:30", breakMins: 60, status: "Active" }))
      .toEqual({ name: "General", start_time: "08:30", end_time: "17:30", break_mins: 60, status: "active" });
    expect(shiftSchema.safeParse({ name: "X", start: "8:30am", end: "17:30", breakMins: 60, status: "Active" }).success).toBe(false);
    expect(shiftSchema.safeParse({ name: "X", start: "08:30", end: "17:30", breakMins: 1000, status: "Active" }).success).toBe(false);
  });
});
