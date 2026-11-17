import { Users } from "lucide-react";
import clsx from "clsx";

export function Logo({ dark = true }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/30">
        <Users className="h-6 w-6 text-white" />
      </div>
      <div className="leading-tight">
        <div className={clsx("text-base font-bold", dark ? "text-white" : "text-slate-900")}>HR &amp; Payroll</div>
        <div className={clsx("text-xs", dark ? "text-slate-300" : "text-slate-500")}>Management System</div>
      </div>
    </div>
  );
}
