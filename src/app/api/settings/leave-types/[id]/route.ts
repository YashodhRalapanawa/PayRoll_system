import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toLeaveType } from "@/lib/mappers";
import { COLS } from "@/lib/server/data";
import { leaveTypeSchema } from "@/lib/validation";
import type { LeaveTypeRow } from "@/types/database";

export const PATCH = route<{ id: string }>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Leave type");
  const input = await readJson(req, leaveTypeSchema);
  const { data, error } = await supabase.from("leave_types").update(input).eq("id", id).select(COLS.leaveType).single<LeaveTypeRow>();
  if (error) throw dbError(error, "Leave type not found.");
  return { leaveType: toLeaveType(data) };
});

export const DELETE = route<{ id: string }>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Leave type");
  const { data, error } = await supabase.from("leave_types").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new ApiError(409, "This leave type is used by leave requests and cannot be deleted.");
    throw dbError(error);
  }
  if (!data?.length) throw new ApiError(404, "Leave type not found.");
  return { ok: true };
});
