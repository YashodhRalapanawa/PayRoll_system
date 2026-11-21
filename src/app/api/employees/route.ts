import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toEmployee } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS, listEmployees } from "@/lib/server/data";
import { employeeCreateSchema } from "@/lib/validation";
import type { EmployeeRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ employees: await listEmployees(supabase) }));

/** A6 · Create an employee. HR manager or admin. */
export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, employeeCreateSchema);
  const { data, error } = await supabase.from("employees").insert(input).select(COLS.employee).single<EmployeeRow>();
  if (error) throw dbError(error);

  const { data: dep } = await supabase.from("departments").select("name").eq("id", data.department_id).maybeSingle<{ name: string }>();
  const activity = await logActivity(
    supabase,
    "employee",
    "New employee added",
    `${data.first_name} ${data.last_name} was added to the ${dep?.name ?? "—"} department.`,
  );
  return { employee: toEmployee(data), activity };
});
