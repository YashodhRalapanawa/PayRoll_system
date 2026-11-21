import { ApiError, dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { resolveStatus } from "@/lib/attendance-rules";
import { hhmm, toAttendance } from "@/lib/mappers";
import { COLS, listAttendance } from "@/lib/server/data";
import { attendanceQuerySchema, attendanceSchema } from "@/lib/validation";
import type { AttendanceRow } from "@/types/database";

const MAX_RANGE_DAYS = 400;

/** GET /api/attendance?date=YYYY-MM-DD  or  ?from=…&to=… */
export const GET = route({}, async ({ req, supabase }) => {
  const sp = req.nextUrl.searchParams;
  const q = attendanceQuerySchema.parse(sp.has("date") ? { date: sp.get("date") } : { from: sp.get("from"), to: sp.get("to") });
  const [from, to] = "date" in q ? [q.date, q.date] : [q.from, q.to];
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) throw new ApiError(400, `Range is limited to ${MAX_RANGE_DAYS} days.`);
  return { attendance: await listAttendance(supabase, from, to) };
});

/**
 * Mark or edit one employee's attendance for a day (upsert on employee + date).
 * The late rule is applied here from the employee's shift, so the client
 * cannot mark a late arrival as on time.
 */
export const PUT = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, attendanceSchema);

  const { data: emp, error: eErr } = await supabase
    .from("employees")
    .select("id, join_date, shift_id")
    .eq("id", input.employee_id)
    .maybeSingle<{ id: string; join_date: string; shift_id: string | null }>();
  if (eErr) throw dbError(eErr);
  if (!emp) throw new ApiError(404, "Employee not found.");
  if (input.date < emp.join_date) throw new ApiError(400, "Attendance cannot be marked before the employee's join date.");

  let status = input.status;
  if (emp.shift_id) {
    const { data: shift } = await supabase
      .from("shifts")
      .select("start_time, late_grace_mins")
      .eq("id", emp.shift_id)
      .maybeSingle<{ start_time: string; late_grace_mins: number }>();
    if (shift) status = resolveStatus(status, input.in_time, hhmm(shift.start_time), shift.late_grace_mins);
  }

  const { data, error } = await supabase
    .from("attendance")
    .upsert({ ...input, status }, { onConflict: "employee_id,date" })
    .select(COLS.attendance)
    .single<AttendanceRow>();
  if (error) throw dbError(error);
  return { record: toAttendance(data) };
});
