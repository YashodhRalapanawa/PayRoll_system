import { dbError } from "@/lib/api/errors";
import { readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toBranch } from "@/lib/mappers";
import { logActivity } from "@/lib/server/activity";
import { COLS, listBranches } from "@/lib/server/data";
import { branchSchema } from "@/lib/validation";
import type { BranchRow } from "@/types/database";

export const GET = route({}, async ({ supabase }) => ({ branches: await listBranches(supabase) }));

export const POST = route({ roles: ROLES.hr }, async ({ req, supabase }) => {
  const input = await readJson(req, branchSchema);
  const { data, error } = await supabase.from("branches").insert(input).select(COLS.branch).single<BranchRow>();
  if (error) throw dbError(error);
  const activity = await logActivity(supabase, "settings", "Branch added", `${data.name} (${data.code}) was added.`);
  return { branch: toBranch(data), activity };
});
