import { route } from "@/lib/api/route";
import { listActivities } from "@/lib/server/data";

/**
 * Read-only: activity is written only by the server inside each API route
 * (logActivity), so the audit log cannot be filled with client-made entries.
 */
export const GET = route({}, async ({ req, supabase }) => {
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1), 200);
  return { activities: await listActivities(supabase, limit) };
});
