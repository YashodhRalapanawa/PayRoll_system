export type Status = "Active" | "Inactive";

export interface User { id: string; name: string; email: string; password: string; role: "Administrator" | "HR Manager" | "Viewer" }
export interface Company {
  name: string; email: string; phone: string; address: string; logo?: string;
  country: string; currencyCode: string; currencySymbol: string; currencyName: string;
}
export interface Branch { id: string; name: string; code: string; address: string; contact: string }
export interface Department { id: string; name: string }
export interface Designation { id: string; name: string; departmentId?: string }
export interface DocumentRef { id: string; name: string; reference: string; addedOn: string }
export interface Employee {
  id: string; empNo: string; firstName: string; lastName: string; nic: string; dob: string; gender: string;
  phone: string; email: string; address: string;
  departmentId: string; designationId: string; branchId: string; shiftId?: string;
  joinDate: string; employmentType: "Permanent" | "Contract" | "Probation" | "Intern";
  status: Status; salaryStructureId?: string; basicSalary?: number;
  bankName?: string; bankAccount?: string; epfNo?: string;
  documents: DocumentRef[];
}
export interface Shift { id: string; name: string; start: string; end: string; breakMins: number; status: Status }
export type AttendanceStatus = "Present" | "Absent" | "Late" | "On Leave" | "Half Day";
export interface Attendance { id: string; employeeId: string; date: string; inTime?: string; outTime?: string; status: AttendanceStatus; overtimeHours: number }
export interface LeaveType { id: string; name: string; daysPerYear: number; paid: boolean }
export type LeaveStatus = "Pending" | "Approved" | "Rejected";
export interface LeaveRequest { id: string; employeeId: string; leaveTypeId: string; from: string; to: string; days: number; reason: string; status: LeaveStatus; createdAt: string }
export interface Holiday { id: string; name: string; date: string }
export interface SalaryItem { id: string; name: string; type: "fixed" | "percent"; amount: number }
export interface SalaryStructure { id: string; name: string; basic: number; allowances: SalaryItem[]; deductions: SalaryItem[] }
export interface PayrollLine {
  employeeId: string; basic: number;
  allowances: { name: string; amount: number }[]; deductions: { name: string; amount: number }[];
  gross: number; epfEmployee: number; totalDeductions: number; net: number; epfEmployer: number; etf: number;
}
export interface PayrollRun { id: string; period: string; status: "Draft" | "Approved"; createdAt: string; paymentDate: string; lines: PayrollLine[] }
export interface PayrollSettings { epfEmployee: number; epfEmployer: number; etf: number; payDay: number; otRate: number }
export interface Activity { id: string; type: "employee" | "leave" | "payroll" | "shift" | "attendance" | "settings"; title: string; detail: string; at: string }
