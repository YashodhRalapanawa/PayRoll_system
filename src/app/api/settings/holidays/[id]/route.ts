import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toHoliday } from "@/lib/mappers";
import { COLS } from "@/lib/server/data";
import { holidaySchema } from "@/lib/validation";
import type { HolidayRow } from "@/types/database";

export const PATCH = route<{ id: string }>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Holiday");
  const input = await readJson(req, holidaySchema);
  const { data, error } = await supabase.from("holidays").update(input).eq("id", id).select(COLS.holiday).single<HolidayRow>();
  if (error) throw dbError(error, "Holiday not found.");
  return { holiday: toHoliday(data) };
});

export const DELETE = route<{ id: string }>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Holiday");
  const { data, error } = await supabase.from("holidays").delete().eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new ApiError(404, "Holiday not found.");
  return { ok: true };
});
