import { idParam, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { decideLeave } from "@/lib/server/leave-decision";

export const POST = route<{ id: string }>({ roles: ROLES.hr }, async ({ params, supabase }) =>
  decideLeave(supabase, idParam(params.id, "Leave request"), "approved"),
);
