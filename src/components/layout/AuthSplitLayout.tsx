import type { ReactNode } from "react";
import { Logo } from "./Logo";

function Illustration() {
  return (
    <svg viewBox="0 0 320 200" className="w-full max-w-sm" aria-hidden>
      <ellipse cx="160" cy="188" rx="140" ry="8" fill="#ffffff" opacity=".15" />
      <rect x="70" y="40" width="150" height="100" rx="10" fill="#c7d2fe" />
      <rect x="78" y="48" width="134" height="84" rx="6" fill="#eef2ff" />
      <rect x="88" y="58" width="50" height="8" rx="3" fill="#6d4aff" />
      <rect x="88" y="74" width="114" height="6" rx="3" fill="#c4b5fd" />
      <rect x="88" y="86" width="90" height="6" rx="3" fill="#c4b5fd" />
      <rect x="88" y="100" width="30" height="22" rx="3" fill="#a78bfa" />
      <rect x="124" y="94" width="30" height="28" rx="3" fill="#8b5cf6" />
      <rect x="160" y="104" width="30" height="18" rx="3" fill="#a78bfa" />
      <path d="M55 140h180l10 14H45z" fill="#94a3f8" />
      <path d="M30 150c0-24 6-40 14-46 2 12-2 30-6 46z" fill="#34d399" />
      <path d="M38 150c-4-18-14-28-22-30 2 12 10 24 18 30z" fill="#10b981" />
      <rect x="24" y="148" width="24" height="26" rx="4" fill="#f8fafc" />
      <circle cx="268" cy="62" r="11" fill="#fbcfe8" />
      <path d="M262 52c2-6 14-6 16 2-6-2-10-2-16-2z" fill="#1e1b4b" />
      <rect x="256" y="74" width="24" height="46" rx="10" fill="#6d4aff" />
      <rect x="258" y="118" width="8" height="58" rx="3" fill="#1e1b4b" />
      <rect x="270" y="118" width="8" height="58" rx="3" fill="#1e1b4b" />
      <rect x="236" y="84" width="24" height="6" rx="3" fill="#fbcfe8" />
    </svg>
  );
}

export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-indigo-50 p-4 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-brand-600/10 lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 p-10 text-white lg:flex">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
          <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-white/5" />
          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight">HR &amp; Payroll</h2>
            <p className="text-2xl font-semibold text-brand-100">Management System</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-100">Manage Employees, Attendance, Leave &amp; Payroll in One Platform</p>
          </div>
          <div className="relative flex justify-center"><Illustration /></div>
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-12">
          <div className="mb-8 lg:hidden"><Logo dark={false} /></div>
          {children}
        </div>
      </div>
    </div>
  );
}
