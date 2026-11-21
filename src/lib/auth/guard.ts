import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import type { AppRole, ProfileRow } from "@/types/database";

export interface CurrentProfile {
  userId: string;
  email: string;
  fullName: string;
  companyId: string | null;
  role: AppRole;
}

export type Role = AppRole;
export type ActiveProfile = CurrentProfile & { companyId: string };

/**
 * The signed-in user's profile, validated against Supabase Auth (getUser, not
 * getSession, so a forged cookie is rejected). Returns null when signed out.
 */
export async function getCurrentProfile(supabase: SupabaseClient): Promise<CurrentProfile | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data, error: pErr } = await supabase
    .from("profiles")
    .select("id, company_id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle<Pick<ProfileRow, "id" | "company_id" | "full_name" | "email" | "role">>();
  if (pErr || !data) return null;

  return { userId: data.id, email: data.email, fullName: data.full_name, companyId: data.company_id, role: data.role };
}

/** Throws 403 unless the user belongs to a company and has one of the roles. */
export function requireRole(profile: CurrentProfile, roles: readonly Role[]): asserts profile is ActiveProfile {
  if (!profile.companyId) throw new ApiError(403, "Complete company setup first.");
  if (!roles.includes(profile.role)) throw new ApiError(403, "You do not have permission to do this.");
}

/** Role sets matching the permission matrix in Settings › Roles. */
export const ROLES = {
  anyMember: ["admin", "hr_manager", "viewer"],
  hr: ["admin", "hr_manager"],
  admin: ["admin"],
} as const satisfies Record<string, readonly Role[]>;
