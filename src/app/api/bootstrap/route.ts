import { route } from "@/lib/api/route";
import {
  isoDay, listActivities, listAttendance, listBranches, listDepartments, listDesignations, listEmployees, listShifts,
  loadCompany, toMe,
} from "@/lib/server/data";

/** Days of attendance loaded up front (dashboard chart, payroll, reports). */
const ATTENDANCE_WINDOW_DAYS = 92;

/**
 * Everything the app shell needs after sign-in, in one round trip.
 * Returns { needsSetup: true } for a signed-in user without a company.
 */
export const GET = route({ company: false }, async ({ supabase, profile }) => {
  if (!profile.companyId) return { needsSetup: true, me: toMe(profile) };

  const to = new Date();
  to.setDate(to.getDate() + 1);
  const from = new Date();
  from.setDate(from.getDate() - ATTENDANCE_WINDOW_DAYS);

  const [company, branches, departments, designations, employees, shifts, attendance, activities] = await Promise.all([
    loadCompany(supabase),
    listBranches(supabase),
    listDepartments(supabase),
    listDesignations(supabase),
    listEmployees(supabase),
    listShifts(supabase),
    listAttendance(supabase, isoDay(from), isoDay(to)),
    listActivities(supabase, 50),
  ]);

  return { needsSetup: false, me: toMe(profile), company, branches, departments, designations, employees, shifts, attendance, activities };
});
