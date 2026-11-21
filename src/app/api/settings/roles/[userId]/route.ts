import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { ROLE_LABEL, toUser } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS } from "@/lib/server/data";
import { roleUpdateSchema } from "@/lib/validation";
import type { ProfileRow } from "@/types/database";

/**
 * Change another user's role. Admin only. The database guard additionally
 * blocks self-changes and changes to users of other companies.
 */
export const PATCH = route<{ userId: string }>({ roles: ROLES.admin }, async ({ req, params, supabase, profile }) => {
  const userId = idParam(params.userId, "User");
  if (userId === profile.userId) throw new ApiError(400, "You cannot change your own role.");
  const { role } = await readJson(req, roleUpdateSchema);

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .eq("company_id", profile.companyId)
    .select(COLS.profile)
    .single<ProfileRow>();
  if (error) throw dbError(error, "User not found.");

  const activity = await logActivity(supabase, "settings", "Role updated", `${data.full_name || data.email} is now ${ROLE_LABEL[role]}.`);
  return { user: toUser(data), activity };
});
