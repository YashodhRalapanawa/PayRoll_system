import { randomUUID } from "node:crypto";
import { ApiError, dbError } from "@/lib/api/errors";
import { formText, idParam, readMultipart, route, takeFile } from "@/lib/api/route";
import { ROLES } from "@/lib/auth/guard";
import { toDocument } from "@/lib/mappers";
import { COLS } from "@/lib/server/data";
import { documentMetaSchema } from "@/lib/validation";
import type { EmployeeDocumentRow } from "@/types/database";

const BUCKET = "employee-documents";
const MAX_BYTES = 10 * 1024 * 1024;

type P = { id: string };

export const GET = route<P>({}, async ({ params, supabase }) => {
  const employeeId = idParam(params.id, "Employee");
  const { data, error } = await supabase
    .from("employee_documents")
    .select(COLS.document)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .returns<EmployeeDocumentRow[]>();
  if (error) throw dbError(error);
  return { documents: data.map(toDocument) };
});

/**
 * Add a document: name + optional reference, with an optional file
 * (PDF/PNG/JPG/WEBP, max 10MB). Files live in a private bucket under
 * {company_id}/{employee_id}/ with a server-generated name.
 */
export const POST = route<P>({ roles: ROLES.hr }, async ({ req, params, supabase, profile }) => {
  const employeeId = idParam(params.id, "Employee");
  const form = await readMultipart(req, MAX_BYTES);
  const meta = documentMetaSchema.parse({ name: formText(form, "name"), reference: formText(form, "reference") ?? "" });
  const file = await takeFile(form, {
    maxBytes: MAX_BYTES,
    allowed: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    required: false,
  });

  const { data: emp, error: eErr } = await supabase.from("employees").select("id").eq("id", employeeId).maybeSingle();
  if (eErr) throw dbError(eErr);
  if (!emp) throw new ApiError(404, "Employee not found.");

  let path: string | null = null;
  if (file) {
    path = `${profile.companyId}/${employeeId}/${randomUUID()}.${file.ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: false });
    if (error) throw new ApiError(400, "File upload failed. Please try again.");
  }

  const { data, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: employeeId,
      name: meta.name,
      reference: meta.reference,
      storage_path: path,
      mime_type: file?.type ?? null,
      size_bytes: file?.bytes.byteLength ?? null,
    })
    .select(COLS.document)
    .single<EmployeeDocumentRow>();
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    throw dbError(error);
  }
  return { document: toDocument(data) };
});
