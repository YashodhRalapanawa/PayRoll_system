import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, readJson, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toBranch } from "@/lib/mappers";
import { COLS } from "@/lib/server/data";
import { branchSchema } from "@/lib/validation";
import type { BranchRow } from "@/types/database";

export const PATCH = route<{ id: string }>({ roles: ROLES.hr }, async ({ req, params, supabase }) => {
  const id = idParam(params.id, "Branch");
  const input = await readJson(req, branchSchema);
  const { data, error } = await supabase.from("branches").update(input).eq("id", id).select(COLS.branch).single<BranchRow>();
  if (error) throw dbError(error, "Branch not found.");
  return { branch: toBranch(data) };
});

export const DELETE = route<{ id: string }>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const id = idParam(params.id, "Branch");
  const { count, error: cErr } = await supabase.from("branches").select("id", { count: "exact", head: true });
  if (cErr) throw dbError(cErr);
  if ((count ?? 0) <= 1) throw new ApiError(409, "At least one branch is required.");

  const { data, error } = await supabase.from("branches").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new ApiError(409, "Cannot delete: employees are assigned to this branch.");
    throw dbError(error);
  }
  if (!data?.length) throw new ApiError(404, "Branch not found.");
  return { ok: true };
});
