import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, dbError } from "@/lib/api/errors";
import { fmtDate } from "@/lib/format";
import { toLeaveRequest } from "@/lib/mappers";
import { logActivity } from "./activity";
import { COLS } from "./data";
import { assertBalance, leaveUsage } from "./leave";
import type { LeaveRequestRow } from "@/types/database";

/**
 * Approves or rejects a pending request. Approval re-checks the paid-leave
 * balance against already-approved leave, so concurrent requests cannot push
 * an employee over their entitlement. Decisions are final (database trigger).
 */
export async function decideLeave(supabase: SupabaseClient, id: string, decision: "approved" | "rejected") {
  const { data: req, error } = await supabase.from("leave_requests").select(COLS.leaveRequest).eq("id", id).maybeSingle<LeaveRequestRow>();
  if (error) throw dbError(error);
  if (!req) throw new ApiError(404, "Leave request not found.");
  if (req.status !== "pending") throw new ApiError(409, `This request has already been ${req.status}.`);

  const [{ data: emp }, { data: type, error: tErr }] = await Promise.all([
    supabase.from("employees").select("first_name, last_name").eq("id", req.employee_id).maybeSingle<{ first_name: string; last_name: string }>(),
    supabase.from("leave_types").select("paid, days_per_year").eq("id", req.leave_type_id).maybeSingle<{ paid: boolean; days_per_year: number | string }>(),
  ]);
  if (tErr) throw dbError(tErr);

  if (decision === "approved" && type?.paid) {
    const { used } = await leaveUsage(supabase, req.employee_id, req.leave_type_id, Number(req.start_date.slice(0, 4)), req.id);
    assertBalance(Number(type.days_per_year), used, 0, Number(req.days));
  }

  const { data, error: uErr } = await supabase
    .from("leave_requests")
    .update({ status: decision })
    .eq("id", id)
    .eq("status", "pending")
    .select(COLS.leaveRequest)
    .single<LeaveRequestRow>();
  if (uErr) {
    if (uErr.code === "PGRST116") throw new ApiError(409, "This request was already decided.");
    throw dbError(uErr);
  }

  const who = emp ? `${emp.first_name} ${emp.last_name}` : "an employee";
  const activity = await logActivity(
    supabase,
    "leave",
    `Leave ${decision}`,
    `Leave request from ${who} (${fmtDate(req.start_date, { month: "short", day: "numeric" })} – ${fmtDate(req.end_date, { month: "short", day: "numeric" })}) ${decision}.`,
  );
  return { leaveRequest: toLeaveRequest(data), activity };
}
