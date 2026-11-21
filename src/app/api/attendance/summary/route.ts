import { route } from "@/lib/api/route";
import { getAttendanceSummary } from "@/lib/server/attendance";
import { uuid } from "@/lib/validation";

/** GET /api/attendance/summary?period=YYYY-MM[&employeeId=…] — worked/absent days and overtime. */
export const GET = route({}, async ({ req, supabase }) => {
  const sp = req.nextUrl.searchParams;
  const employeeId = sp.get("employeeId");
  return {
    summary: await getAttendanceSummary(supabase, employeeId ? uuid.parse(employeeId) : null, sp.get("period") ?? ""),
  };
});
