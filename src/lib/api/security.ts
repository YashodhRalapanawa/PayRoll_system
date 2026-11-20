/** Request-level checks with no framework dependencies (unit tested). */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated routes: state-changing requests must
 * carry an Origin header from this same host. Browsers always send Origin on
 * cross-origin and same-origin POST/PUT/PATCH/DELETE fetches.
 */
export function isSameOriginRequest(method: string, origin: string | null, host: string | null): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export type SniffedType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

/** Detects the real file type from its first bytes; never trust the browser's MIME type. */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export const EXTENSION: Record<SniffedType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
