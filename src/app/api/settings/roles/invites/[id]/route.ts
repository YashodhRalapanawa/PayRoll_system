import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";

/** Cancel a pending invite. Admin only. */
export const DELETE = route<{ id: string }>({ roles: ROLES.admin }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Invite");
  const { data, error } = await supabase.from("company_invites").delete().eq("id", id).is("accepted_at", null).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new ApiError(404, "Invite not found.");
  return { ok: true };
});
