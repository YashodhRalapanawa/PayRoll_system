"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowUp, CalendarCheck, CalendarDays, CheckCircle2, CircleDollarSign, Clock, Coins, Play, Settings, UserPlus, Users, Umbrella, AlertCircle,
} from "lucide-react";
import { Avatar, Card, Select, StatCard } from "@/components/ui";
import { useCurrentUser, useStore } from "@/lib/store";
import { currentPeriod, fmtDate, fmtPeriod, moneyShort, relTime } from "@/lib/format";
import { getDashboard } from "@/lib/api/payroll";
import { errorMessage } from "@/lib/api/client";
import type { DashboardData } from "@/lib/server/dashboard";

const COLORS = ["#7c5cff", "#3b9cff", "#34d399", "#fbbf24", "#f472b6", "#cbd5e1", "#a78bfa", "#22d3ee"];
const activityIcon = { employee: UserPlus, leave: CalendarCheck, payroll: Coins, shift: CalendarDays, attendance: Clock, settings: Settings };
const activityTint = {
  employee: "bg-emerald-50 text-emerald-600", leave: "bg-sky-50 text-sky-600", payroll: "bg-amber-50 text-amber-600",
  shift: "bg-brand-50 text-brand-600", attendance: "bg-brand-50 text-brand-600", settings: "bg-slate-100 text-slate-600",
};

/** B7 · Dashboard figures come from GET /api/dashboard (fresh on every visit). */
export default function DashboardPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const code = useStore((s) => s.company?.currencyCode ?? "LKR");
  const [range, setRange] = useState(7);
  const [period, setPeriod] = useState(currentPeriod());
  const [d, setD] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getDashboard(range, period)
      .then((x) => { if (alive) { setD(x); setError(""); } })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [range, period]);

  const periods = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date();
    dt.setDate(1);
    dt.setMonth(dt.getMonth() - i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  });
  const active = d?.stats.activeEmployees ?? 0;
  const pct = (n: number) => (active ? ((n / active) * 100).toFixed(1) : "0");
  const chart = (d?.attendanceTrend ?? []).map((p) => ({ day: fmtDate(p.date, { month: "short", day: "numeric" }), rate: p.rate }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Welcome back, {user?.name.split(" ")[0]}!</h1>
          <p className="mt-1 text-slate-500">Here&apos;s what&apos;s happening in your organization today.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm">
          <CalendarDays className="h-4 w-4 text-slate-500" />
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load the dashboard: {error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Employees" value={active} icon={Users} tint="violet"
          badge={d && d.stats.joinedThisMonth > 0 ? <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><ArrowUp className="h-3 w-3" />{d.stats.joinedThisMonth}</span> : undefined}
          sub="joined this month"
        />
        <StatCard label="Present Today" value={d?.stats.presentToday ?? "—"} icon={CalendarCheck} tint="green" sub={`${pct(d?.stats.presentToday ?? 0)}% attendance`} />
        <StatCard label="On Leave" value={d?.stats.onLeaveToday ?? "—"} icon={Umbrella} tint="amber" sub={`${pct(d?.stats.onLeaveToday ?? 0)}% of employees`} />
        <StatCard label="Payroll (This Month)" value={moneyShort(d?.stats.payrollThisMonth ?? 0, code)} icon={CircleDollarSign} tint="pink" sub={fmtPeriod(currentPeriod())} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Attendance Overview" action={
          <Select value={range} onChange={(e) => setRange(+e.target.value)} className="w-auto py-1.5">
            <option value={7}>Last 7 Days</option><option value={14}>Last 14 Days</option><option value={30}>Last 30 Days</option>
          </Select>
        }>
          <div className="h-72 p-4">
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ left: -10, right: 10, top: 10 }}>
                <defs>
                  <linearGradient id="att" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#7c5cff" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef0f5" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${v}%`, "Attendance"]} />
                <Area type="monotone" dataKey="rate" stroke="#6d4aff" strokeWidth={2.5} fill="url(#att)" dot={{ r: 4, fill: "#6d4aff" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Employee Distribution">
          {!d || d.departments.length === 0 ? (
            <Empty text={d ? "Add employees to departments to see the distribution." : "Loading…"} href={d ? "/employees/new" : undefined} cta="Add employee" />
          ) : (
            <div className="flex flex-col items-center gap-4 p-5 sm:flex-row">
              <div className="relative h-52 w-52 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={d.departments} dataKey="value" innerRadius={62} outerRadius={92} paddingAngle={1} stroke="none">
                      {d.departments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900">{active}</span>
                  <span className="text-xs text-slate-500">Employees</span>
                </div>
              </div>
              <ul className="w-full space-y-2.5 text-sm">
                {d.departments.map((x, i) => (
                  <li key={x.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 truncate text-slate-700">{x.name}</span>
                    <span className="w-8 text-right font-semibold text-slate-800">{x.value}</span>
                    <span className="w-12 text-right text-slate-500">{pct(x.value)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Recent Activities" action={<Link href="/reports" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>}>
          {!d || d.activities.length === 0 ? (
            <Empty text={d ? "Activity will appear here as you use the system." : "Loading…"} />
          ) : (
            <ul className="space-y-4 p-5">
              {d.activities.map((a) => {
                const Icon = activityIcon[a.type];
                return (
                  <li key={a.id} className="flex gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activityTint[a.type]}`}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{a.title}</div>
                      <div className="truncate text-xs text-slate-500">{a.detail}</div>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{relTime(a.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Upcoming Leaves" action={<Link href="/leave" className="text-sm font-medium text-brand-600 hover:underline">View All</Link>}>
          {!d || d.upcomingLeaves.length === 0 ? (
            <Empty text={d ? "No upcoming leave." : "Loading…"} />
          ) : (
            <ul className="divide-y divide-slate-100 px-5 py-3">
              {d.upcomingLeaves.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <Avatar name={l.employeeName} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{l.employeeName}</div>
                    <div className="text-xs text-slate-500">{l.leaveType} {l.status === "Pending" && "· Pending"}</div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-600">{fmtDate(l.from, { month: "short", day: "numeric" })}{l.to !== l.from && ` – ${fmtDate(l.to, { month: "short", day: "numeric" })}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Payroll Status" action={
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto py-1.5">
            {periods.map((p) => <option key={p} value={p}>{fmtDate(p + "-01", { month: "short", year: "numeric" })}</option>)}
          </Select>
        }>
          <div className="flex flex-col items-center p-6 text-center">
            {!d ? (
              <Empty text="Loading…" />
            ) : d.payroll.status === "Approved" ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <div className="mt-3 text-lg font-bold text-emerald-600">Payroll Completed</div>
                <p className="text-sm text-slate-500">{d.payroll.employees} payslips · {moneyShort(d.payroll.net, code)} net</p>
              </>
            ) : active === 0 ? (
              <>
                <AlertCircle className="h-12 w-12 text-slate-300" />
                <div className="mt-3 text-lg font-bold text-slate-600">No Employees Yet</div>
                <p className="text-sm text-slate-500">Add employees before processing payroll.</p>
              </>
            ) : d.payroll.missingSalary > 0 ? (
              <>
                <AlertCircle className="h-12 w-12 text-amber-500" />
                <div className="mt-3 text-lg font-bold text-amber-600">Salary Data Incomplete</div>
                <p className="text-sm text-slate-500">{d.payroll.missingSalary} employee(s) have no salary structure.</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <div className="mt-3 text-lg font-bold text-emerald-600">{d.payroll.status === "Draft" ? "Draft Ready for Approval" : "Ready for Processing"}</div>
                <p className="text-sm text-slate-500">All employee salary data is up to date.</p>
              </>
            )}
            <button
              onClick={() => router.push(`/payroll?period=${period}`)}
              className="mt-6 flex w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700"
            >
              <Play className="h-4 w-4 fill-white" /> Process Payroll
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Empty({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-sm text-slate-400">
      {text}
      {href && <Link href={href} className="mt-2 font-medium text-brand-600 hover:underline">{cta}</Link>}
    </div>
  );
}
