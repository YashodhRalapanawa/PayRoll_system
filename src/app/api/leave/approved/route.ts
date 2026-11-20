import { route } from "@/lib/api/route";
import { getApprovedLeave } from "@/lib/server/leave";
import { isoDate } from "@/lib/validation";

/** GET /api/leave/approved?date=YYYY-MM-DD — who is on approved leave that day. */
export const GET = route({}, async ({ req, supabase }) => ({
  approved: await getApprovedLeave(supabase, isoDate.parse(req.nextUrl.searchParams.get("date"))),
}));
