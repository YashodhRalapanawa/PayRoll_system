import { ApiError, dbError } from "@/lib/api/errors";
import { readMultipart, route, takeFile } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { logoUrl } from "@/lib/server/data";

const BUCKET = "company-logos";
const MAX_BYTES = 2 * 1024 * 1024;

async function currentLogoPath(supabase: Parameters<typeof logoUrl>[0], companyId: string) {
  const { data, error } = await supabase.from("companies").select("logo_path").eq("id", companyId).single<{ logo_path: string | null }>();
  if (error) throw dbError(error, "Company not found.");
  return data.logo_path;
}

/** Upload or replace the company logo (PNG/JPG, max 2MB). Admin only. */
export const POST = route({ roles: ROLES.admin }, async ({ req, supabase, profile }) => {
  const form = await readMultipart(req, MAX_BYTES);
  const file = (await takeFile(form, { maxBytes: MAX_BYTES, allowed: ["image/png", "image/jpeg"] }))!;

  const previous = await currentLogoPath(supabase, profile.companyId);
  // Server-generated path: the first folder must be the company id (storage policy).
  const path = `${profile.companyId}/logo-${Date.now()}.${file.ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: false });
  if (upErr) throw new ApiError(400, "Logo upload failed. Please try again.");

  const { error } = await supabase.from("companies").update({ logo_path: path }).eq("id", profile.companyId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw dbError(error);
  }
  if (previous) await supabase.storage.from(BUCKET).remove([previous]);
  return { logo: logoUrl(supabase, path) };
});

export const DELETE = route({ roles: ROLES.admin }, async ({ supabase, profile }) => {
  const previous = await currentLogoPath(supabase, profile.companyId);
  const { error } = await supabase.from("companies").update({ logo_path: null }).eq("id", profile.companyId);
  if (error) throw dbError(error);
  if (previous) await supabase.storage.from(BUCKET).remove([previous]);
  return { logo: null };
});
