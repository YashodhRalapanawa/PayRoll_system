import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, dbError } from "@/lib/api/errors";

/**
 * getApprovedLeave(date): integration contract for the attendance screen (A).
 * Employees on approved leave on that date, for the caller's company only.
 */
export async function getApprovedLeave(supabase: SupabaseClient, date: string) {
  const { data, error } = await supabase.rpc("approved_leave_on", { p_date: date });
  if (error) throw dbError(error);
  return ((data ?? []) as { employee_id: string; leave_request_id: string; leave_type_id: string }[]).map((r) => ({
    employeeId: r.employee_id,
    leaveRequestId: r.leave_request_id,
    leaveTypeId: r.leave_type_id,
  }));
}

/**
 * Days of a leave type already used (approved) and requested (pending) by an
 * employee in a calendar year. A request counts toward the year it starts in.
 */
export async function leaveUsage(supabase: SupabaseClient, employeeId: string, leaveTypeId: string, year: number, excludeId?: string) {
  let q = supabase
    .from("leave_requests")
    .select("id, days, status")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveTypeId)
    .in("status", ["approved", "pending"])
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.returns<{ id: string; days: number | string; status: "approved" | "pending" }[]>();
  if (error) throw dbError(error);
  const total = (s: string) => data.filter((r) => r.status === s).reduce((a, r) => a + Number(r.days), 0);
  return { used: total("approved"), pending: total("pending") };
}

export function assertBalance(entitled: number, used: number, pending: number, days: number) {
  const available = Math.max(0, entitled - used - pending);
  if (days > available) throw new ApiError(409, `Insufficient leave balance: ${available} day(s) available.`);
}
