import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { logActivity } from "@/lib/server/activity";
import { listSalaryStructures } from "@/lib/server/data";
import { replaceSalaryItems } from "@/lib/server/salary";
import { salaryStructureSchema } from "@/lib/validation";

export const GET = route({}, async ({ supabase }) => ({ salaryStructures: await listSalaryStructures(supabase) }));

/** B4 · Create a salary structure with its allowances and deductions. Admin only. */
export const POST = route({ roles: ROLES.admin }, async ({ req, supabase }) => {
  const input = await readJson(req, salaryStructureSchema);
  const { data, error } = await supabase.from("salary_structures").insert({ name: input.name, basic: input.basic }).select("id").single<{ id: string }>();
  if (error) throw dbError(error);
  try {
    await replaceSalaryItems(supabase, data.id, input);
  } catch (e) {
    await supabase.from("salary_structures").delete().eq("id", data.id);
    throw e;
  }
  const [structure] = await listSalaryStructures(supabase, [data.id]);
  const activity = await logActivity(supabase, "settings", "Salary structure created", `${structure.name}.`);
  return { salaryStructure: structure, activity };
});
