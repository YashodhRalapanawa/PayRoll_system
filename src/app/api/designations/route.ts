import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toDesignation } from "@/lib/mappers";
import { COLS, listDesignations } from "@/lib/server/data";
import { designationSchema } from "@/lib/validation";
import type { DesignationRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ designations: await listDesignations(supabase) }));

export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, designationSchema);
  const { data, error } = await supabase.from("designations").insert(input).select(COLS.designation).single<DesignationRow>();
  if (error) throw dbError(error);
  return { designation: toDesignation(data) };
});
