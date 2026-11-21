import { ApiError, dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { ROLE_LABEL, toInvite } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS } from "@/lib/server/data";
import { inviteSchema } from "@/lib/validation";
import type { InviteRow } from "@/types/database";

/**
 * Invite a person by email. When they register with that email (and confirm
 * it) they join this company with the chosen role. Admin only.
 */
export const POST = route({ roles: ROLES.admin }, async ({ req, supabase, profile }) => {
  const { email, role } = await readJson(req, inviteSchema);

  const { data: member } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", profile.companyId)
    .eq("email", email)
    .maybeSingle();
  if (member) throw new ApiError(409, "This person is already a member of your company.");

  const { data, error } = await supabase.from("company_invites").insert({ email, role }).select(COLS.invite).single<InviteRow>();
  if (error) throw dbError(error);

  const activity = await logActivity(supabase, "settings", "User invited", `${email} was invited as ${ROLE_LABEL[role]}.`);
  return { invite: toInvite(data), activity };
});
