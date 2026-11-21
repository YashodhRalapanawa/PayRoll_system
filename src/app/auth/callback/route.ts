import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Email links (sign-up confirmation, password reset) land here with a PKCE
 * code. The code is exchanged for a session, then the user is sent on to a
 * same-site path only (open-redirect safe).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(new URL(next, url.origin));
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
