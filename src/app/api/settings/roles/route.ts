import { dbError } from "@/lib/api/errors";
import { route } from "@/lib/api/route";
import { toInvite, toUser } from "@/lib/mappers";
import { COLS } from "@/lib/server/data";
import type { InviteRow, ProfileRow } from "@/types/database";

/** A4 · Users of the company, plus pending invites for admins. */
export const GET = route({}, async ({ supabase, profile }) => {
  const { data: users, error } = await supabase
    .from("profiles")
    .select(COLS.profile)
    .eq("company_id", profile.companyId)
    .order("created_at")
    .returns<ProfileRow[]>();
  if (error) throw dbError(error);

  let invites: InviteRow[] = [];
  if (profile.role === "admin") {
    const r = await supabase
      .from("company_invites")
      .select(COLS.invite)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .returns<InviteRow[]>();
    if (r.error) throw dbError(r.error);
    invites = r.data;
  }
  return { users: users.map(toUser), invites: invites.map(toInvite) };
});
