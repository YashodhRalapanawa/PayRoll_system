import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { logActivity } from "@/lib/server/activity";
import { listEmployees } from "@/lib/server/data";
import { shiftAssignSchema } from "@/lib/validation";

/**
 * Sets the shift's employee list: the given employees move onto this shift and
 * anyone else currently on it is unassigned. Returns the updated employees.
 */
export const POST = route<{ id: string }>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const shiftId = idParam(params.id, "Shift");
  const { employeeIds } = await readJson(req, shiftAssignSchema, 300_000);
  const ids = [...new Set(employeeIds)];

  const { data: shift, error: sErr } = await supabase.from("shifts").select("id, name").eq("id", shiftId).maybeSingle<{ id: string; name: string }>();
  if (sErr) throw dbError(sErr);
  if (!shift) throw new ApiError(404, "Shift not found.");

  if (ids.length) {
    const { error } = await supabase.from("employees").update({ shift_id: shiftId }).in("id", ids);
    if (error) throw dbError(error);
  }
  // ids are validated UUIDs, so building the "not in" list is safe.
  let clear = supabase.from("employees").update({ shift_id: null }).eq("shift_id", shiftId);
  if (ids.length) clear = clear.not("id", "in", `(${ids.join(",")})`);
  const { error: cErr } = await clear;
  if (cErr) throw dbError(cErr);

  const activity = await logActivity(supabase, "shift", "Shift assignments updated", `${ids.length} employee(s) on ${shift.name}.`);
  return { employees: await listEmployees(supabase), activity };
});
