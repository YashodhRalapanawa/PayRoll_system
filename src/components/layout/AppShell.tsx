"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { loadBootstrap } from "@/lib/api/hr";
import { errorMessage } from "@/lib/api/client";
import { useStore } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
    </div>
  );
}

/**
 * Loads the signed-in user's data from the server, then renders the app.
 * The middleware already keeps signed-out users out; this sends users without
 * a company to /setup.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ready = useStore((s) => s.serverReady);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (ready) return;
    let alive = true;
    setError(null);
    loadBootstrap()
      .then((r) => {
        if (!alive) return;
        if (r === "unauthenticated") router.replace("/login");
        else if (r === "needs-setup") router.replace("/setup");
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [ready, router, attempt]);

  if (error)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-slate-600">Could not load your data: {error}</p>
        <button onClick={() => setAttempt((n) => n + 1)} className="cursor-pointer rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Try again
        </button>
      </div>
    );
  if (!ready) return <Spinner />;
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
