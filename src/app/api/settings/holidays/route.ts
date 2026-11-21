import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toHoliday } from "@/lib/mappers";
import { COLS, listHolidays } from "@/lib/server/data";
import { holidaySchema } from "@/lib/validation";
import type { HolidayRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ holidays: await listHolidays(supabase) }));

export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, holidaySchema);
  const { data, error } = await supabase.from("holidays").insert(input).select(COLS.holiday).single<HolidayRow>();
  if (error) throw dbError(error);
  return { holiday: toHoliday(data) };
});
