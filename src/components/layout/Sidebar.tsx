"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Building2, CalendarCheck, ChevronDown, CircleDollarSign, Home, Layers, Settings, Umbrella, Users, X, type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";

interface NavItem { label: string; icon: LucideIcon; href?: string; children?: { label: string; href: string }[] }
export const NAV: NavItem[] = [
  { label: "Dashboard", icon: Home, href: "/dashboard" },
  { label: "Employees", icon: Users, children: [{ label: "All Employees", href: "/employees" }, { label: "Add Employee", href: "/employees/new" }] },
  { label: "Attendance", icon: CalendarCheck, children: [{ label: "Daily Attendance", href: "/attendance" }, { label: "Shifts", href: "/attendance/shifts" }] },
  { label: "Leave Management", icon: Umbrella, children: [{ label: "Leave Requests", href: "/leave" }, { label: "Leave Balances", href: "/leave?tab=balances" }] },
  { label: "Payroll", icon: CircleDollarSign, children: [{ label: "Process Payroll", href: "/payroll" }, { label: "Payroll History", href: "/payroll?view=history" }] },
  { label: "Salary Setup", icon: Layers, children: [{ label: "Salary Structures", href: "/salary" }] },
  { label: "Organization", icon: Building2, children: [{ label: "Branches", href: "/organization?tab=branches" }, { label: "Departments", href: "/organization?tab=departments" }, { label: "Designations", href: "/organization?tab=designations" }] },
  { label: "Reports", icon: BarChart3, href: "/reports" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

function isActive(path: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/employees") return path === "/employees" || (path.startsWith("/employees/") && path !== "/employees/new");
  if (base === "/attendance") return path === "/attendance";
  return path === base || path.startsWith(base + "/");
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  const groupActive = (n: NavItem) => (n.href ? isActive(path, n.href) : n.children!.some((c) => isActive(path, c.href)));
  const [expanded, setExpanded] = useState<string | null>(() => NAV.find((n) => n.children && groupActive(n))?.label ?? null);

  return (
    <>
      <div className={clsx("fixed inset-0 z-30 bg-slate-900/50 lg:hidden", open ? "block" : "hidden")} onClick={onClose} />
      <aside
        className={clsx(
          "no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo />
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map((n) => {
            const active = groupActive(n);
            const Icon = n.icon;
            const cls = clsx(
              "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
              active && n.href ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30" : active ? "text-white" : "text-slate-300 hover:bg-navy-800 hover:text-white",
            );
            if (n.href)
              return (
                <Link key={n.label} href={n.href} className={cls} onClick={onClose}>
                  <Icon className="h-5 w-5" /> {n.label}
                </Link>
              );
            const isOpen = expanded === n.label;
            return (
              <div key={n.label}>
                <button className={cls} onClick={() => setExpanded(isOpen ? null : n.label)}>
                  <Icon className="h-5 w-5" /> <span className="flex-1 text-left">{n.label}</span>
                  <ChevronDown className={clsx("h-4 w-4 transition", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-navy-700 pl-3">
                    {n.children!.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        onClick={onClose}
                        className={clsx(
                          "block rounded-lg px-3 py-2 text-sm transition",
                          isActive(path, c.href) && !c.href.includes("?") ? "bg-brand-600/20 font-medium text-white" : "text-slate-400 hover:text-white",
                        )}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="m-4 hidden rounded-2xl bg-navy-800 p-4 text-center [@media(min-height:820px)]:block">
          <div className="mb-2 flex justify-center -space-x-2">
            {["bg-brand-500", "bg-sky-400", "bg-brand-300"].map((c, i) => (
              <span key={i} className={clsx("flex h-8 w-8 items-center justify-center rounded-full border-2 border-navy-800", c)}>
                <Users className="h-4 w-4 text-white" />
              </span>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-slate-300">Manage your people, attendance and payroll all in one system.</p>
        </div>
      </aside>
    </>
  );
}
