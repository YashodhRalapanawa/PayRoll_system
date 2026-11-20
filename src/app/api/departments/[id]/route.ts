import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toDepartment } from "@/lib/mappers";
import { COLS } from "@/lib/server/data";
import { departmentSchema } from "@/lib/validation";
import type { DepartmentRow } from "@/types/database";

export const PATCH = route<{ id: string }>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Department");
  const input = await readJson(req, departmentSchema);
  const { data, error } = await supabase.from("departments").update(input).eq("id", id).select(COLS.department).single<DepartmentRow>();
  if (error) throw dbError(error, "Department not found.");
  return { department: toDepartment(data) };
});

/** Designations linked to the department become "any department" (DB rule). */
export const DELETE = route<{ id: string }>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Department");
  const { data, error } = await supabase.from("departments").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new ApiError(409, "Cannot delete: employees are assigned to this department.");
    throw dbError(error);
  }
  if (!data?.length) throw new ApiError(404, "Department not found.");
  return { ok: true };
});
