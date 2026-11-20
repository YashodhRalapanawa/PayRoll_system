import { ApiError, dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { leaveWorkingDays } from "@/lib/leave";
import { toLeaveRequest } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS, listLeaveRequests } from "@/lib/server/data";
import { assertBalance, leaveUsage } from "@/lib/server/leave";
import { leaveRequestSchema } from "@/lib/validation";
import type { LeaveRequestRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ leaveRequests: await listLeaveRequests(supabase) }));

/**
 * B3 · New leave request (pending). The server counts the working days
 * (Sundays and holidays excluded) and checks the balance; the client's day
 * count is ignored. Overlaps are rejected by a database constraint.
 */
export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, leaveRequestSchema);

  const [{ data: emp, error: eErr }, { data: type, error: tErr }, { data: hol, error: hErr }] = await Promise.all([
    supabase.from("employees").select("id, status, join_date, first_name, last_name").eq("id", input.employeeId).maybeSingle<{ id: string; status: string; join_date: string; first_name: string; last_name: string }>(),
    supabase.from("leave_types").select("id, name, paid, days_per_year").eq("id", input.leaveTypeId).maybeSingle<{ id: string; name: string; paid: boolean; days_per_year: number | string }>(),
    supabase.from("holidays").select("date").gte("date", input.from).lte("date", input.to).returns<{ date: string }[]>(),
  ]);
  if (eErr || tErr || hErr) throw dbError((eErr ?? tErr ?? hErr)!);
  if (!emp) throw new ApiError(404, "Employee not found.");
  if (!type) throw new ApiError(404, "Leave type not found.");
  if (emp.status !== "active") throw new ApiError(400, "Leave can only be requested for active employees.");
  if (input.from < emp.join_date) throw new ApiError(400, "Leave cannot start before the employee's join date.");

  const days = leaveWorkingDays(input.from, input.to, hol.map((h) => h.date));
  if (days <= 0) throw new ApiError(400, "The selected dates contain no working days.");

  if (type.paid) {
    const { used, pending } = await leaveUsage(supabase, emp.id, type.id, Number(input.from.slice(0, 4)));
    assertBalance(Number(type.days_per_year), used, pending, days);
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({ employee_id: emp.id, leave_type_id: type.id, start_date: input.from, end_date: input.to, days, reason: input.reason })
    .select(COLS.leaveRequest)
    .single<LeaveRequestRow>();
  if (error) throw dbError(error);

  const activity = await logActivity(supabase, "leave", "Leave requested", `${emp.first_name} ${emp.last_name}: ${type.name}, ${days} day(s) from ${input.from}.`);
  return { leaveRequest: toLeaveRequest(data), activity };
});
