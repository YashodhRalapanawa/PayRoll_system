"use client";
import type { Activity } from "@/lib/types";

/** Error from an /api route, with per-field messages for forms. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type Listener = (activity: Activity) => void;
let activityListener: Listener | null = null;
/** The store registers here so server-logged activity shows up immediately. */
export function onActivity(fn: Listener) {
  activityListener = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", cache: "no-store" };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiClientError(0, "Network error. Check your connection and try again.");
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiClientError(res.status, (data?.error as string) ?? "Request failed.", data?.fields as Record<string, string> | undefined);
  }
  if (data?.activity && activityListener) activityListener(data.activity as Activity);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T = { ok: true }>(url: string) => request<T>("DELETE", url),
};

/** Message for a toast or form banner from any thrown error. */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
