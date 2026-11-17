"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useHydrated, useStore } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
    </div>
  );
}

/** Guards app pages: needs a session and a completed company setup. */
export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const session = useStore((s) => s.sessionUserId);
  const setupComplete = useStore((s) => s.setupComplete);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace("/login");
    else if (!setupComplete) router.replace("/setup");
  }, [hydrated, session, setupComplete, router]);

  if (!hydrated || !session || !setupComplete) return <Spinner />;
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
