import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { logActivity } from "@/lib/server/activity";
import { listEmployees } from "@/lib/server/data";
import { employeeIdsSchema } from "@/lib/validation";

/**
 * Sets which employees use this structure: the given employees are assigned
 * and anyone else on it is unassigned. Admin only. Returns updated employees.
 */
export const POST = route<{ id: string }>({ roles: ROLES.admin }, async ({ req, params, supabase }) => {
  const structureId = idParam(params.id, "Salary structure");
  const { employeeIds } = await readJson(req, employeeIdsSchema, 300_000);
  const ids = [...new Set(employeeIds)];

  const { data: st, error: sErr } = await supabase.from("salary_structures").select("id, name").eq("id", structureId).maybeSingle<{ id: string; name: string }>();
  if (sErr) throw dbError(sErr);
  if (!st) throw new ApiError(404, "Salary structure not found.");

  if (ids.length) {
    const { error } = await supabase.from("employees").update({ salary_structure_id: structureId }).in("id", ids);
    if (error) throw dbError(error);
  }
  // ids are validated UUIDs, so building the "not in" list is safe.
  let clear = supabase.from("employees").update({ salary_structure_id: null }).eq("salary_structure_id", structureId);
  if (ids.length) clear = clear.not("id", "in", `(${ids.join(",")})`);
  const { error: cErr } = await clear;
  if (cErr) throw dbError(cErr);

  const activity = await logActivity(supabase, "settings", "Salary structure assigned", `${ids.length} employee(s) on ${st.name}.`);
  return { employees: await listEmployees(supabase), activity };
});
