import type { LeaveRequest, LeaveType } from "./types";

export function leaveBalances(employeeId: string, types: LeaveType[], requests: LeaveRequest[], year = new Date().getFullYear()) {
  return types.map((t) => {
    const used = requests
      .filter((r) => r.employeeId === employeeId && r.leaveTypeId === t.id && r.status === "Approved" && r.from.startsWith(String(year)))
      .reduce((a, r) => a + r.days, 0);
    const pending = requests
      .filter((r) => r.employeeId === employeeId && r.leaveTypeId === t.id && r.status === "Pending" && r.from.startsWith(String(year)))
      .reduce((a, r) => a + r.days, 0);
    return { type: t, entitled: t.daysPerYear, used, pending, remaining: t.paid ? Math.max(0, t.daysPerYear - used) : Infinity };
  });
}
