import { dbError } from "@/lib/api/errors";
import { idParam, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { listActivities, listPayrollRuns } from "@/lib/server/data";

/**
 * B5 · Approve and lock a draft run. The approve_payroll_run() database
 * function checks the admin role, locks the run (trigger) and writes the
 * audit log entry in the same transaction.
 */
export const POST = route<{ id: string }>({ roles: ROLES.admin }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Payroll run");
  const { error } = await supabase.rpc("approve_payroll_run", { p_run_id: id });
  if (error) throw dbError(error, "Draft payroll run not found.");
  const [[run], [activity]] = await Promise.all([listPayrollRuns(supabase, [id]), listActivities(supabase, 1)]);
  return { run, activity };
});
