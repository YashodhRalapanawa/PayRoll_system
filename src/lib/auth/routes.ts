/** Route access rules shared by the middleware and tests. */

/** Only for signed-out users; signed-in users are sent to "/". */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];
/** Reachable whether signed in or not. */
const OPEN = ["/auth/callback", "/reset-password"];

const matches = (path: string, base: string) => path === base || path.startsWith(base + "/");

/**
 * Returns the path to redirect to, or null to let the request through.
 * API routes are never redirected; each handler returns 401/403 itself.
 */
export function routeRedirect(pathname: string, signedIn: boolean): string | null {
  if (pathname.startsWith("/api/")) return null;
  if (OPEN.some((p) => matches(pathname, p))) return null;
  if (GUEST_ONLY.some((p) => matches(pathname, p))) return signedIn ? "/" : null;
  return signedIn ? null : "/login";
}

/**
 * Accepts only same-site relative paths for post-login redirects, which
 * blocks open redirects such as "//evil.com" or "https://evil.com".
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
