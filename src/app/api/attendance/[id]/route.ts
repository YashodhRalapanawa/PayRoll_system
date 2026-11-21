import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";

/** Clear one attendance record. */
export const DELETE = route<{ id: string }>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Attendance record");
  const { data, error } = await supabase.from("attendance").delete().eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new ApiError(404, "Attendance record not found.");
  return { ok: true };
});
