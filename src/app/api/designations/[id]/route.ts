import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toDesignation } from "@/lib/mappers";
import { COLS } from "@/lib/server/data";
import { designationSchema } from "@/lib/validation";
import type { DesignationRow } from "@/types/database";

export const PATCH = route<{ id: string }>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Designation");
  const input = await readJson(req, designationSchema);
  const { data, error } = await supabase.from("designations").update(input).eq("id", id).select(COLS.designation).single<DesignationRow>();
  if (error) throw dbError(error, "Designation not found.");
  return { designation: toDesignation(data) };
});

export const DELETE = route<{ id: string }>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Designation");
  const { data, error } = await supabase.from("designations").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new ApiError(409, "Cannot delete: employees are assigned to this designation.");
    throw dbError(error);
  }
  if (!data?.length) throw new ApiError(404, "Designation not found.");
  return { ok: true };
});
