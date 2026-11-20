import { z } from "zod";

/**
 * Public Supabase settings. Next.js inlines NEXT_PUBLIC_* at build time, so they
 * must be read with literal property access (no dynamic lookup).
 * Only the anon key is used anywhere in the app: every query runs as the
 * signed-in user and is filtered by row-level security.
 */
const schema = z.object({
  url: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  anonKey: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing"),
});

let cached: z.infer<typeof schema> | null = null;

export function publicEnv() {
  if (!cached) {
    cached = schema.parse({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  }
  return cached;
}
