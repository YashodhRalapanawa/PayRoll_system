import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toEmployee } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS } from "@/lib/server/data";
import { employeeUpdateSchema } from "@/lib/validation";
import type { EmployeeRow } from "@/types/database";

type P = { id: string };

export const GET = route<P>({}, async ({ params, supabase }) => {
  const id = idParam(params.id, "Employee");
  const { data, error } = await supabase.from("employees").select(COLS.employee).eq("id", id).single<EmployeeRow>();
  if (error) throw dbError(error, "Employee not found.");
  return { employee: toEmployee(data) };
});

/** Update any subset of fields (e.g. just { status }). HR manager or admin. */
export const PATCH = route<P>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Employee");
  const changes = await readJson(req, employeeUpdateSchema);
  const { data, error } = await supabase.from("employees").update(changes).eq("id", id).select(COLS.employee).single<EmployeeRow>();
  if (error) throw dbError(error, "Employee not found.");

  const activity =
    "status" in changes
      ? await logActivity(supabase, "employee", `Employee marked ${data.status}`, `${data.first_name} ${data.last_name} (${data.emp_no}) is now ${data.status}.`)
      : null;
  return { employee: toEmployee(data), activity };
});

/**
 * Delete an employee and their attendance, documents and leave. Employees with
 * payroll history cannot be deleted (database foreign key); mark them inactive.
 */
export const DELETE = route<P>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Employee");

  const { data: docs, error: dErr } = await supabase
    .from("employee_documents")
    .select("storage_path")
    .eq("employee_id", id)
    .returns<{ storage_path: string | null }[]>();
  if (dErr) throw dbError(dErr);

  const { data, error } = await supabase.from("employees").delete().eq("id", id).select("first_name, last_name, emp_no");
  if (error) {
    if (error.code === "23503") throw new ApiError(409, "This employee has payroll history. Mark them inactive instead.");
    throw dbError(error);
  }
  if (!data?.length) throw new ApiError(404, "Employee not found.");

  const paths = (docs ?? []).map((d) => d.storage_path).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from("employee-documents").remove(paths);

  const e = data[0] as { first_name: string; last_name: string; emp_no: string };
  const activity = await logActivity(supabase, "employee", "Employee deleted", `${e.first_name} ${e.last_name} (${e.emp_no}) was deleted.`);
  return { ok: true, activity };
});
