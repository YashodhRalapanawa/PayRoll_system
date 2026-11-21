import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toLeaveType } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS, listLeaveTypes } from "@/lib/server/data";
import { leaveTypeSchema } from "@/lib/validation";
import type { LeaveTypeRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ leaveTypes: await listLeaveTypes(supabase) }));

export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, leaveTypeSchema);
  const { data, error } = await supabase.from("leave_types").insert(input).select(COLS.leaveType).single<LeaveTypeRow>();
  if (error) throw dbError(error);
  const activity = await logActivity(supabase, "settings", "Leave type added", `${data.name} (${data.paid ? `${data.days_per_year} days/year` : "unpaid"}).`);
  return { leaveType: toLeaveType(data), activity };
});
