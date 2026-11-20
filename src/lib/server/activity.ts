import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toActivity } from "@/lib/mappers";
import type { Activity } from "@/lib/types";
import type { ActivityRow, ActivityType } from "@/types/database";

/**
 * logActivity(type, title, detail): shared helper for every write (A and B).
 * company_id and actor_id are filled by the database from the session, so a
 * client can never log activity for another company or user. A failure here
 * never fails the main operation.
 */
export async function logActivity(
  supabase: SupabaseClient,
  type: ActivityType,
  title: string,
  detail = "",
): Promise<Activity | null> {
  const { data, error } = await supabase
    .from("activity_log")
    .insert({ type, title: title.slice(0, 200), detail: detail.slice(0, 1000) })
    .select("id, type, title, detail, created_at")
    .single<ActivityRow>();
  if (error || !data) {
    console.error("[activity] insert failed", error?.code);
    return null;
  }
  return toActivity(data);
}
