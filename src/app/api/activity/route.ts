import { ApiError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { logActivity } from "@/lib/server/activity";
import { listActivities } from "@/lib/server/data";
import { activitySchema } from "@/lib/validation";

export const GET = route({}, async ({ req, supabase }) => {
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1), 200);
  return { activities: await listActivities(supabase, limit) };
});

/**
 * Records an activity from screens that are still browser-only (Developer B
 * modules), so the log persists. Company and actor come from the session.
 */
export const POST = route({}, async ({ req, supabase }) => {
  const { type, title, detail } = await readJson(req, activitySchema, 4_000);
  const activity = await logActivity(supabase, type, title, detail);
  if (!activity) throw new ApiError(500, "Could not record activity.");
  return { activity };
});
