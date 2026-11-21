import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, route } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import type { EmployeeDocumentRow } from "@/types/database";

const BUCKET = "employee-documents";
/** Download links expire quickly so a leaked URL is short-lived. */
const SIGNED_URL_SECONDS = 60;

type P = { id: string; docId: string };

/** Returns a short-lived signed download URL for the document's file. */
export const GET = route<P>({}, async ({ params, supabase }) => {
  const employeeId = idParam(params.id, "Employee");
  const docId = idParam(params.docId, "Document");
  const { data, error } = await supabase
    .from("employee_documents")
    .select("name, storage_path, mime_type")
    .eq("id", docId)
    .eq("employee_id", employeeId)
    .single<Pick<EmployeeDocumentRow, "name" | "storage_path" | "mime_type">>();
  if (error) throw dbError(error, "Document not found.");
  if (!data.storage_path) throw new ApiError(404, "This document has no file attached.");

  const ext = data.storage_path.split(".").pop();
  const fileName = `${data.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "document"}.${ext}`;
  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.storage_path, SIGNED_URL_SECONDS, { download: fileName });
  if (sErr || !signed) throw new ApiError(404, "File not found.");
  return { url: signed.signedUrl };
});

export const DELETE = route<P>({ roles: ROLES.hr }, async ({ params, supabase }) => {
  const employeeId = idParam(params.id, "Employee");
  const docId = idParam(params.docId, "Document");
  const { data, error } = await supabase
    .from("employee_documents")
    .delete()
    .eq("id", docId)
    .eq("employee_id", employeeId)
    .select("storage_path")
    .returns<{ storage_path: string | null }[]>();
  if (error) throw dbError(error);
  if (!data?.length) throw new ApiError(404, "Document not found.");
  if (data[0].storage_path) await supabase.storage.from(BUCKET).remove([data[0].storage_path]);
  return { ok: true };
});
