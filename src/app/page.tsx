"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHydrated, useStore } from "@/lib/store";
import { Spinner } from "@/components/layout/AppShell";

export default function Home() {
  const router = useRouter();
  const hydrated = useHydrated();
  const session = useStore((s) => s.sessionUserId);
  const setupComplete = useStore((s) => s.setupComplete);
  useEffect(() => {
    if (!hydrated) return;
    router.replace(!session ? "/login" : setupComplete ? "/dashboard" : "/setup");
  }, [hydrated, session, setupComplete, router]);
  return <Spinner />;
}
