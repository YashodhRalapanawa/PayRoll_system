/** The parts of a PostgREST / Postgres error this module reads. */
export interface DbErrorLike {
  code?: string;
  message: string;
  details?: string | null;
}

/** An error that is safe to show to the user, with an HTTP status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Friendly messages for unique / foreign-key constraint names. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  employees_company_id_emp_no_key: "This Employee ID is already in use.",
  branches_company_id_code_key: "This branch code is already in use.",
  departments_company_id_name_key: "A department with this name already exists.",
  designations_company_id_name_key: "A designation with this name already exists.",
  shifts_company_id_name_key: "A shift with this name already exists.",
  company_invites_company_id_email_key: "This email has already been invited.",
  attendance_employee_id_date_key: "Attendance is already marked for this day.",
  leave_types_company_id_name_key: "A leave type with this name already exists.",
  holidays_company_id_date_key: "A holiday already exists on this date.",
  salary_structures_company_id_name_key: "A salary structure with this name already exists.",
  payroll_runs_company_id_period_key: "A payroll run already exists for this period.",
  leave_requests_no_overlap: "This employee already has leave in that period.",
  employees_salary_structure_fk: "This salary structure is assigned to employees.",
};

/**
 * Maps a PostgREST / Postgres error to a safe ApiError. Raw database messages
 * are never returned to the client, except the ones our own SQL functions
 * raise on purpose (P0001/P0002 and guard messages), which are written for users.
 */
export function dbError(error: DbErrorLike, notFound = "Record not found."): ApiError {
  const msg = error.message ?? "";
  const constraint = Object.keys(CONSTRAINT_MESSAGES).find((c) => msg.includes(c) || error.details?.includes(c));

  switch (error.code) {
    case "PGRST116":
      return new ApiError(404, notFound);
    case "23505":
      return new ApiError(409, constraint ? CONSTRAINT_MESSAGES[constraint] : "This record already exists.");
    case "23P01": // exclusion constraint (overlapping leave)
      return new ApiError(409, constraint ? CONSTRAINT_MESSAGES[constraint] : "This overlaps an existing record.");
    case "23503":
      return new ApiError(409, constraint ? CONSTRAINT_MESSAGES[constraint] : "This record is linked to other data and cannot be changed or deleted.");
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
      return new ApiError(400, "One or more values are invalid.");
    case "P0001":
    case "P0002":
      return new ApiError(error.code === "P0002" ? 404 : 400, msg);
    case "42501":
    case "28000":
      if (/row-level security|permission denied/i.test(msg)) return new ApiError(403, "You do not have permission to do this.");
      return new ApiError(403, msg);
    default:
      return new ApiError(500, "Something went wrong. Please try again.");
  }
}
