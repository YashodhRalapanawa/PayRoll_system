import { route } from "@/lib/api/route";
import { loadCompany, toMe } from "@/lib/server/data";

/** Current user and company (null before onboarding). */
export const GET = route({ company: false }, async ({ supabase, profile }) => ({
  me: toMe(profile),
  company: profile.companyId ? await loadCompany(supabase) : null,
}));
