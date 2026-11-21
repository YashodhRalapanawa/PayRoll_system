import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { fmtDate } from "@/lib/format";
import { hhmm, toAttendance } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS } from "@/lib/server/data";
import { attendanceBulkSchema } from "@/lib/validation";
import type { AttendanceRow } from "@/types/database";

const DEFAULT_IN = "08:30";
const DEFAULT_OUT = "17:30";

/**
 * "Mark all present": marks the given employees present for the date using
 * their shift hours. Only active employees who had joined by that date are
 * marked, and existing records are never overwritten.
 */
export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const { date, employeeIds } = await readJson(req, attendanceBulkSchema, 200_000);
  const ids = [...new Set(employeeIds)];

  const { data: emps, error: eErr } = await supabase
    .from("employees")
    .select("id, shift_id")
    .in("id", ids)
    .eq("status", "active")
    .lte("join_date", date)
    .returns<{ id: string; shift_id: string | null }[]>();
  if (eErr) throw dbError(eErr);
  if (!emps.length) return { records: [], activity: null };

  const { data: shifts, error: sErr } = await supabase
    .from("shifts")
    .select("id, start_time, end_time")
    .returns<{ id: string; start_time: string; end_time: string }[]>();
  if (sErr) throw dbError(sErr);
  const byId = new Map(shifts.map((s) => [s.id, s]));

  const rows = emps.map((e) => {
    const s = e.shift_id ? byId.get(e.shift_id) : undefined;
    return {
      employee_id: e.id,
      date,
      status: "present" as const,
      in_time: hhmm(s?.start_time) ?? DEFAULT_IN,
      out_time: hhmm(s?.end_time) ?? DEFAULT_OUT,
      overtime_hours: 0,
    };
  });

  const { data, error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "employee_id,date", ignoreDuplicates: true })
    .select(COLS.attendance)
    .returns<AttendanceRow[]>();
  if (error) throw dbError(error);

  const activity = data.length
    ? await logActivity(supabase, "attendance", "Attendance marked", `${data.length} employees marked present for ${fmtDate(date)}.`)
    : null;
  return { records: data.map(toAttendance), activity };
});
