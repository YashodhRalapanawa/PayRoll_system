import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { calculatePayrollRun } from "@/lib/server/payroll";
import { payrollCalculateSchema } from "@/lib/validation";

/** B5 · Calculate or recalculate the draft run for { period: "YYYY-MM" } on the server. Admin only. */
export const POST = route({ roles: ROLES.admin }, async ({ req, supabase, profile }) => {
  const { period } = await readJson(req, payrollCalculateSchema, 1_000);
  return calculatePayrollRun(supabase, profile, period);
});
