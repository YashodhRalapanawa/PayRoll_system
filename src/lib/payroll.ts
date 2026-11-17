import type { Employee, PayrollLine, PayrollSettings, SalaryStructure } from "./types";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Basic MVP payroll calculation.
 * Statutory rates (EPF/ETF) are configurable in Settings and must be verified
 * against current official rules before real payroll is processed.
 */
export function calcLine(
  emp: Employee,
  structure: SalaryStructure | undefined,
  s: PayrollSettings,
  overtimeHours = 0,
  unpaidLeaveDays = 0,
): PayrollLine {
  const basic = emp.basicSalary || structure?.basic || 0;
  const resolve = (it: { type: "fixed" | "percent"; amount: number }) => (it.type === "percent" ? (basic * it.amount) / 100 : it.amount);
  const allowances = (structure?.allowances ?? []).map((a) => ({ name: a.name, amount: round(resolve(a)) }));
  if (overtimeHours > 0) {
    const hourly = basic / 240;
    allowances.push({ name: `Overtime (${overtimeHours}h)`, amount: round(hourly * s.otRate * overtimeHours) });
  }
  const deductions = (structure?.deductions ?? []).map((d) => ({ name: d.name, amount: round(resolve(d)) }));
  if (unpaidLeaveDays > 0) deductions.push({ name: `No-pay leave (${unpaidLeaveDays}d)`, amount: round((basic / 30) * unpaidLeaveDays) });
  const gross = round(basic + allowances.reduce((a, b) => a + b.amount, 0));
  const epfEmployee = round((basic * s.epfEmployee) / 100);
  const totalDeductions = round(deductions.reduce((a, b) => a + b.amount, 0) + epfEmployee);
  return {
    employeeId: emp.id,
    basic,
    allowances,
    deductions,
    gross,
    epfEmployee,
    totalDeductions,
    net: round(gross - totalDeductions),
    epfEmployer: round((basic * s.epfEmployer) / 100),
    etf: round((basic * s.etf) / 100),
  };
}

export const sum = (lines: PayrollLine[], k: "gross" | "totalDeductions" | "net" | "epfEmployee" | "epfEmployer" | "etf" | "basic") =>
  lines.reduce((a, l) => a + l[k], 0);
