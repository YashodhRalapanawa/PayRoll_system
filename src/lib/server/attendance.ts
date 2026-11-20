import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError } from "@/lib/api/errors";
import { periodSchema } from "@/lib/validation";

export interface AttendanceSummary {
  employeeId: string;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  /** present + late + 0.5 × half days */
  workedDays: number;
  overtimeHours: number;
}

interface SummaryRow {
  employee_id: string;
  present_days: number;
  late_days: number;
  half_days: number;
  absent_days: number;
  leave_days: number;
  worked_days: number | string;
  overtime_hours: number | string;
}

/**
 * getAttendanceSummary(employeeId, period): integration contract for payroll (B5).
 * Pass employeeId = null for every employee. Period is "YYYY-MM".
 * Runs as the calling user, so it only ever sees their company's attendance.
 */
export async function getAttendanceSummary(
  supabase: SupabaseClient,
  employeeId: string | null,
  period: string,
): Promise<AttendanceSummary[]> {
  const p = periodSchema.parse(period);
  const { data, error } = await supabase.rpc("attendance_summary", { p_period: p, p_employee_id: employeeId });
  if (error) throw dbError(error);
  return ((data ?? []) as SummaryRow[]).map((r) => ({
    employeeId: r.employee_id,
    presentDays: r.present_days,
    lateDays: r.late_days,
    halfDays: r.half_days,
    absentDays: r.absent_days,
    leaveDays: r.leave_days,
    workedDays: Number(r.worked_days),
    overtimeHours: Number(r.overtime_hours),
  }));
}
