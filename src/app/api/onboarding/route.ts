import { ApiError, dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { onboardingSchema } from "@/lib/validation";

/**
 * A3 · Company onboarding. Creates the company, makes the caller its admin and
 * creates the first branch in one transaction (create_company RPC).
 * The logo is uploaded afterwards via POST /api/company/logo.
 */
export const POST = route({ company: false }, async ({ req, supabase, profile }) => {
  if (profile.companyId) throw new ApiError(409, "You already belong to a company.");
  const { company, branch } = await readJson(req, onboardingSchema);

  const { data, error } = await supabase.rpc("create_company", {
    p_name: company.name,
    p_email: company.email,
    p_phone: company.phone,
    p_address: company.address,
    p_country: company.country,
    p_currency_code: company.currency_code,
    p_currency_symbol: company.currency_symbol,
    p_currency_name: company.currency_name,
    p_branch_name: branch.name,
    p_branch_code: branch.code,
    p_branch_address: branch.address,
    p_branch_contact: branch.contact,
  });
  if (error) throw dbError(error);
  return { companyId: data as string };
});
