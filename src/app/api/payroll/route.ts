import { route } from "@/lib/api/route";
import { listPayrollRuns } from "@/lib/server/data";

/** All payroll runs with their lines (history). */
export const GET = route({}, async ({ supabase }) => ({ payrollRuns: await listPayrollRuns(supabase) }));
