import { ApiError } from "@/lib/api/errors";
import { route } from "@/lib/api/route";
import { buildDashboard } from "@/lib/server/dashboard";
import { isoDate, periodSchema } from "@/lib/validation";

/** GET /api/dashboard?today=YYYY-MM-DD&range=7|14|30&period=YYYY-MM */
export const GET = route({}, async ({ req, supabase }) => {
  const sp = req.nextUrl.searchParams;
  const serverToday = new Date().toISOString().slice(0, 10);
  const today = sp.get("today") ? isoDate.parse(sp.get("today")) : serverToday;
  // The client's local date may differ from UTC by at most a day.
  if (Math.abs(Date.parse(today) - Date.parse(serverToday)) > 86_400_000) throw new ApiError(400, "Invalid date.");
  const range = [7, 14, 30].includes(Number(sp.get("range"))) ? Number(sp.get("range")) : 7;
  const period = sp.get("period") ? periodSchema.parse(sp.get("period")) : today.slice(0, 7);
  return { dashboard: await buildDashboard(supabase, { today, range, period }) };
});
