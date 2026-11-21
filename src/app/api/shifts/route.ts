import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toShift } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS, listShifts } from "@/lib/server/data";
import { shiftSchema } from "@/lib/validation";
import type { ShiftRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ shifts: await listShifts(supabase) }));

export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, shiftSchema);
  const { data, error } = await supabase.from("shifts").insert(input).select(COLS.shift).single<ShiftRow>();
  if (error) throw dbError(error);
  const shift = toShift(data);
  const activity = await logActivity(supabase, "shift", "Shift created", `${shift.name} (${shift.start} – ${shift.end}).`);
  return { shift, activity };
});
