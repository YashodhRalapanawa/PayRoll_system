"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Browser client, used only for authentication (sign in, sign up, sign out,
 * password reset). All data reads and writes go through the /api routes.
 */
export function createClient() {
  if (!client) {
    const { url, anonKey } = publicEnv();
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
