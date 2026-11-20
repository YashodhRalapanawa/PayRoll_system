import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toShift } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS } from "@/lib/server/data";
import { shiftSchema } from "@/lib/validation";
import type { ShiftRow } from "@/types/database";

type P = { id: string };

export const PATCH = route<P>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Shift");
  const input = await readJson(req, shiftSchema);
  const { data, error } = await supabase.from("shifts").update(input).eq("id", id).select(COLS.shift).single<ShiftRow>();
  if (error) throw dbError(error, "Shift not found.");
  const shift = toShift(data);
  const activity = await logActivity(supabase, "shift", "Shift updated", `${shift.name} (${shift.start} – ${shift.end}).`);
  return { shift, activity };
});

export const DELETE = route<P>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Shift");
  const { count, error: cErr } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("shift_id", id);
  if (cErr) throw dbError(cErr);
  if ((count ?? 0) > 0) throw new ApiError(409, "Unassign employees before deleting this shift.");

  const { data, error } = await supabase.from("shifts").delete().eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new ApiError(404, "Shift not found.");
  return { ok: true };
});
