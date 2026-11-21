import { route } from "@/lib/api/route";
import {
  getPayrollSettings, isoDay, listActivities, listAttendance, listBranches, listDepartments, listDesignations, listEmployees,
  listHolidays, listLeaveRequests, listLeaveTypes, listPayrollRuns, listSalaryStructures, listShifts, loadCompany, toMe,
} from "@/lib/server/data";

/** Days of attendance loaded up front (attendance screen, payroll preview). Reports query the server directly. */
const ATTENDANCE_WINDOW_DAYS = 92;

/**
 * Everything the app shell needs after sign-in, in one round trip. Nothing
 * here is stored in the browser. Returns { needsSetup: true } for a signed-in
 * user without a company.
 */
export const GET = route({ company: false }, async ({ supabase, profile }) => {
  if (!profile.companyId) return { needsSetup: true, me: toMe(profile) };

  const to = new Date();
  to.setDate(to.getDate() + 1);
  const from = new Date();
  from.setDate(from.getDate() - ATTENDANCE_WINDOW_DAYS);

  const [
    company, branches, departments, designations, employees, shifts, attendance, activities,
    leaveTypes, leaveRequests, holidays, salaryStructures, payrollRuns, settings,
  ] = await Promise.all([
    loadCompany(supabase),
    listBranches(supabase),
    listDepartments(supabase),
    listDesignations(supabase),
    listEmployees(supabase),
    listShifts(supabase),
    listAttendance(supabase, isoDay(from), isoDay(to)),
    listActivities(supabase, 50),
    listLeaveTypes(supabase),
    listLeaveRequests(supabase),
    listHolidays(supabase),
    listSalaryStructures(supabase),
    listPayrollRuns(supabase),
    getPayrollSettings(supabase),
  ]);

  return {
    needsSetup: false, me: toMe(profile), company, branches, departments, designations, employees, shifts, attendance,
    activities, leaveTypes, leaveRequests, holidays, salaryStructures, payrollRuns, settings,
  };
});
