import { Suspense, type ReactNode } from "react";
import { AppShell, Spinner } from "@/components/layout/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Spinner />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
