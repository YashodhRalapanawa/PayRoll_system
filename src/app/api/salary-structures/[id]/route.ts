import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { logActivity } from "@/lib/server/activity";
import { listSalaryStructures } from "@/lib/server/data";
import { replaceSalaryItems } from "@/lib/server/salary";
import { salaryStructureSchema } from "@/lib/validation";

type P = { id: string };

export const PATCH = route<P>({ roles: ROLES.admin }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Salary structure");
  const input = await readJson(req, salaryStructureSchema);
  const { error } = await supabase.from("salary_structures").update({ name: input.name, basic: input.basic }).eq("id", id).select("id").single();
  if (error) throw dbError(error, "Salary structure not found.");
  await replaceSalaryItems(supabase, id, input);
  const [structure] = await listSalaryStructures(supabase, [id]);
  const activity = await logActivity(supabase, "settings", "Salary structure updated", `${structure.name}.`);
  return { salaryStructure: structure, activity };
});

export const DELETE = route<P>({ roles: ROLES.admin }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Salary structure");
  const { data, error } = await supabase.from("salary_structures").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new ApiError(409, "Unassign employees before deleting this structure.");
    throw dbError(error);
  }
  if (!data?.length) throw new ApiError(404, "Salary structure not found.");
  return { ok: true };
});
