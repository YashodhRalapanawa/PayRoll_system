import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toCompany } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS, loadCompany, logoUrl } from "@/lib/server/data";
import { companySchema } from "@/lib/validation";
import type { CompanyRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ company: await loadCompany(supabase) }));

/** Company profile (Settings › Company). Admin only; currency follows the country. */
export const PATCH = route({ roles: ROLES.admin }, async ({ req, supabase, profile }) => {
  const input = await readJson(req, companySchema);
  const { data, error } = await supabase
    .from("companies")
    .update(input)
    .eq("id", profile.companyId)
    .select(COLS.company)
    .single<CompanyRow>();
  if (error) throw dbError(error, "Company not found.");
  const activity = await logActivity(supabase, "settings", "Company settings updated", `${data.name} profile was updated.`);
  return { company: toCompany(data, logoUrl(supabase, data.logo_path)), activity };
});
