import { workingDates } from "./payroll";
import type { LeaveRequest, LeaveType } from "./types";

/** Working days in a leave request (Sundays and holidays excluded). Used by the form preview and the server. */
export function leaveWorkingDays(from: string, to: string, holidays: Iterable<string>) {
  return workingDates(from, to, new Set(holidays)).length;
}

/**
 * Balances for one employee for a calendar year. A request counts toward the
 * year it starts in. `remaining` is Infinity for unpaid types (no limit).
 */
export function leaveBalances(employeeId: string, types: LeaveType[], requests: LeaveRequest[], year = new Date().getFullYear()) {
  return types.map((t) => {
    const mine = requests.filter((r) => r.employeeId === employeeId && r.leaveTypeId === t.id && r.from.startsWith(String(year)));
    const used = mine.filter((r) => r.status === "Approved").reduce((a, r) => a + r.days, 0);
    const pending = mine.filter((r) => r.status === "Pending").reduce((a, r) => a + r.days, 0);
    return { type: t, entitled: t.daysPerYear, used, pending, remaining: t.paid ? Math.max(0, t.daysPerYear - used) : Infinity };
  });
}
