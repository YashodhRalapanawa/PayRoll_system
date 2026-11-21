import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getCurrentProfile, requireRole, ROLES, type ActiveProfile, type CurrentProfile, type Role } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, uuid } from "@/lib/validation";
import { ApiError } from "./errors";
import { EXTENSION, isSameOriginRequest, sniffFileType, type SniffedType } from "./security";

interface Options {
  /** Roles allowed to call this handler. Defaults to any member of the company. */
  roles?: readonly Role[];
  /** Set false for routes used before the user has a company (onboarding, /api/me). */
  company?: boolean;
}

type ProfileFor<O extends Options> = O extends { company: false } ? CurrentProfile : ActiveProfile;

export interface Ctx<P, O extends Options> {
  req: NextRequest;
  params: P;
  supabase: SupabaseClient;
  profile: ProfileFor<O>;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Wraps every API handler with, in order:
 *   1. CSRF check (same-origin Origin header on state-changing methods)
 *   2. authentication (Supabase getUser)
 *   3. company membership and role check
 *   4. safe error responses (no stack traces or raw database messages)
 * Data access inside the handler uses the user's own session, so row-level
 * security still applies even if a check here were wrong.
 */
export function route<P extends Record<string, string> = Record<string, never>, O extends Options = Options>(
  opts: O,
  handler: (ctx: Ctx<P, O>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (!isSameOriginRequest(req.method, req.headers.get("origin"), host)) {
        throw new ApiError(403, "Cross-site request blocked.");
      }

      const supabase = await createClient();
      const profile = await getCurrentProfile(supabase);
      if (!profile) throw new ApiError(401, "Please sign in to continue.");
      if (opts.company !== false) requireRole(profile, opts.roles ?? ROLES.anyMember);

      const params = ((await context?.params) ?? {}) as P;
      const result = await handler({ req, params, supabase, profile: profile as ProfileFor<O> });

      if (result instanceof Response) {
        result.headers.set("Cache-Control", "no-store");
        return result;
      }
      return NextResponse.json(result ?? { ok: true }, { headers: NO_STORE });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message, fields: e.fields }, { status: e.status, headers: NO_STORE });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(e) }, { status: 400, headers: NO_STORE });
  }
  console.error("[api] unexpected error", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: NO_STORE });
}

/** Reads a size-limited JSON body and validates it. */
export async function readJson<S extends ZodTypeAny>(req: NextRequest, schema: S, maxBytes = 100_000): Promise<z.output<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new ApiError(415, "Expected a JSON request body.");
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new ApiError(413, "Request is too large.");
  const raw = await req.text();
  if (raw.length > maxBytes) throw new ApiError(413, "Request is too large.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Invalid JSON.");
  }
  return schema.parse(data);
}

/** Validates a route id; anything that is not a UUID is simply "not found". */
export function idParam(value: string | undefined, label = "Record"): string {
  const r = uuid.safeParse(value);
  if (!r.success) throw new ApiError(404, `${label} not found.`);
  return r.data;
}

export interface Upload {
  bytes: Uint8Array;
  type: SniffedType;
  ext: string;
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`;

/** Parses a multipart form after checking the declared size. */
export async function readMultipart(req: NextRequest, maxBytes: number): Promise<FormData> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) throw new ApiError(415, "Expected a file upload form.");
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes + 64 * 1024) {
    throw new ApiError(413, `File must be ${mb(maxBytes)} or smaller.`);
  }
  try {
    return await req.formData();
  } catch {
    throw new ApiError(400, "Invalid upload.");
  }
}

/**
 * Takes one file from a parsed form. The size is re-checked and the type is
 * detected from the file's bytes, ignoring the name and browser MIME type.
 * Returns null when the field is empty and the file is optional.
 */
export async function takeFile(
  form: FormData,
  opts: { maxBytes: number; allowed: SniffedType[]; field?: string; required?: boolean },
): Promise<Upload | null> {
  const file = form.get(opts.field ?? "file");
  if (!(file instanceof File) || file.size === 0) {
    if (opts.required === false) return null;
    throw new ApiError(400, "Choose a file to upload.");
  }
  if (file.size > opts.maxBytes) throw new ApiError(413, `File must be ${mb(opts.maxBytes)} or smaller.`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffFileType(bytes);
  if (!sniffed || !opts.allowed.includes(sniffed)) {
    throw new ApiError(415, `Unsupported file type. Allowed: ${opts.allowed.map((t) => EXTENSION[t].toUpperCase()).join(", ")}.`);
  }
  return { bytes, type: sniffed, ext: EXTENSION[sniffed] };
}

/** Reads a text field from a form (FormData values may be files). */
export const formText = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};
