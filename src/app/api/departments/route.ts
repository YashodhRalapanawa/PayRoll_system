import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toDepartment } from "@/lib/mappers";
import { COLS, listDepartments } from "@/lib/server/data";
import { departmentSchema } from "@/lib/validation";
import type { DepartmentRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ departments: await listDepartments(supabase) }));

export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, departmentSchema);
  const { data, error } = await supabase.from("departments").insert(input).select(COLS.department).single<DepartmentRow>();
  if (error) throw dbError(error);
  return { department: toDepartment(data) };
});
