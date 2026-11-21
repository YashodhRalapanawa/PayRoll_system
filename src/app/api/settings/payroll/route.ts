import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toPayrollSettings } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS, getPayrollSettings } from "@/lib/server/data";
import { payrollSettingsSchema } from "@/lib/validation";
import type { PayrollSettingsRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ settings: await getPayrollSettings(supabase) }));

/** B8 · Payroll rates. Admin only. Approved runs keep the rates they were calculated with. */
export const PUT = route({ roles: ROLES.admin }, async ({ req, supabase, profile }) => {
  const input = await readJson(req, payrollSettingsSchema);
  const { data, error } = await supabase
    .from("payroll_settings")
    .update(input)
    .eq("company_id", profile.companyId)
    .select(COLS.payrollSettings)
    .single<PayrollSettingsRow>();
  if (error) throw dbError(error, "Payroll settings not found.");
  const s = toPayrollSettings(data);
  const activity = await logActivity(supabase, "settings", "Payroll configuration updated", `EPF ${s.epfEmployee}%/${s.epfEmployer}%, ETF ${s.etf}%, OT ${s.otRate}×.`);
  return { settings: s, activity };
});
