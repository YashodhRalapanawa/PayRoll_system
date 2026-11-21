"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { Bell, Building2, ChevronDown, LogOut, Menu, Search, Settings, User as UserIcon } from "lucide-react";
import { Avatar } from "@/components/ui";
import { empName, useCurrentUser, useStore } from "@/lib/store";
import { NAV } from "./Sidebar";
import { relTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

function useOutside(cb: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && cb();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [cb]);
  return ref;
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const user = useCurrentUser();
  const company = useStore((s) => s.company);
  const branches = useStore((s) => s.branches);
  const employees = useStore((s) => s.employees);
  const activities = useStore((s) => s.activities);
  const pending = useStore((s) => s.leaveRequests.filter((l) => l.status === "Pending").length);
  const [menu, setMenu] = useState<null | "user" | "notif" | "branch" | "search">(null);
  const [q, setQ] = useState("");
  const close = () => setMenu(null);
  const ref = useOutside(close);

  async function signOut() {
    close();
    await createClient().auth.signOut();
    // Clears server data from memory and this company's local data from the browser.
    useStore.getState().clearSession();
    router.replace("/login");
    router.refresh();
  }

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    const mods = NAV.flatMap((n) => (n.href ? [{ label: n.label, href: n.href }] : n.children!.map((c) => ({ label: `${n.label} › ${c.label}`, href: c.href }))))
      .filter((m) => m.label.toLowerCase().includes(s))
      .map((m) => ({ ...m, kind: "Module" }));
    const emps = employees
      .filter((e) => `${empName(e)} ${e.empNo}`.toLowerCase().includes(s))
      .slice(0, 6)
      .map((e) => ({ label: `${empName(e)} (${e.empNo})`, href: `/employees/${e.id}`, kind: "Employee" }));
    return [...emps, ...mods].slice(0, 8);
  }, [q, employees]);

  return (
    <header ref={ref} className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden md:block">
        <button onClick={() => setMenu(menu === "branch" ? null : "branch")} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Building2 className="h-4 w-4 text-brand-600" />
          <span className="max-w-48 truncate">{company?.name ?? "Company"}</span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
        {menu === "branch" && (
          <div className="absolute left-0 top-12 w-64 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
            <div className="px-3 py-1.5 text-xs font-semibold uppercase text-slate-400">Branches</div>
            {branches.map((b) => (
              <div key={b.id} className="rounded-lg px-3 py-2 text-sm text-slate-700">{b.name} <span className="text-xs text-slate-400">({b.code})</span></div>
            ))}
            <Link href="/organization?tab=branches" onClick={close} className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50">Manage branches</Link>
          </div>
        )}
      </div>

      <div className="relative ml-auto w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setMenu("search"); }}
          onFocus={() => setMenu("search")}
          placeholder="Search employees, modules..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
        />
        {menu === "search" && q && (
          <div className="absolute left-0 right-0 top-12 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
            {results.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            {results.map((r) => (
              <button key={r.href + r.label} onClick={() => { router.push(r.href); setQ(""); close(); }} className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50">
                <span className="truncate text-slate-700">{r.label}</span>
                <span className="text-xs text-slate-400">{r.kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setMenu(menu === "notif" ? null : "notif")} className="relative cursor-pointer rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {pending > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
        </button>
        {menu === "notif" && (
          <div className="absolute right-0 top-12 w-80 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
            <div className="px-3 py-1.5 text-sm font-semibold text-slate-800">Notifications</div>
            {pending > 0 && (
              <Link href="/leave?tab=Pending" onClick={close} className="block rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {pending} leave request{pending > 1 ? "s" : ""} awaiting approval
              </Link>
            )}
            {activities.slice(0, 5).map((a) => (
              <div key={a.id} className="rounded-lg px-3 py-2 text-sm">
                <div className="font-medium text-slate-700">{a.title}</div>
                <div className="text-xs text-slate-400">{relTime(a.at)}</div>
              </div>
            ))}
            {pending === 0 && activities.length === 0 && <div className="px-3 py-4 text-center text-sm text-slate-400">You&apos;re all caught up.</div>}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setMenu(menu === "user" ? null : "user")} className="flex cursor-pointer items-center gap-3 rounded-xl py-1 pl-1 pr-2 hover:bg-slate-50">
          <Avatar name={user?.name ?? "User"} size={38} />
          <div className="hidden text-left leading-tight sm:block">
            <div className="text-sm font-semibold text-slate-800">{user?.name}</div>
            <div className="text-xs text-slate-500">{user?.role}</div>
          </div>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
        </button>
        {menu === "user" && (
          <div className="absolute right-0 top-12 w-56 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
            <div className="truncate px-3 py-2 text-xs text-slate-400">{user?.email}</div>
            <Link href="/settings" onClick={close} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><UserIcon className="h-4 w-4" /> My Profile</Link>
            <Link href="/settings" onClick={close} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" /> Settings</Link>
            <button onClick={signOut} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
