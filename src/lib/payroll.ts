/**
 * B1 · Payroll calculation as pure functions (no database, no I/O).
 * The server uses these to calculate payroll runs; screens use the same code
 * for previews, so the numbers always match.
 *
 * Statutory rates (EPF/ETF) and divisors come from payroll_settings and must be
 * verified against current official rules before real payroll is processed.
 * APIT/PAYE income tax is not calculated.
 */
import type { PayAmount, PayrollLine, PayrollSettings } from "./types";

// ---------- money ----------
/** Rounds to cents, half away from zero, without binary floating-point drift (1.005 -> 1.01). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(n) * 100).toPrecision(15)))) / 100;
}
const total = (items: PayAmount[]) => round2(items.reduce((a, b) => a + b.amount, 0));

// ---------- dates (UTC, so time zones and DST never shift a day) ----------
const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** First day, last day and length of a "YYYY-MM" period. */
export function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${period}-01`, end: `${period}-${pad(days)}`, days };
}

/** Pay day clamped to the month (pay day 31 in February -> the 28th/29th). */
export function paymentDate(period: string, payDay: number) {
  const { days } = periodRange(period);
  return `${period}-${pad(Math.min(Math.max(1, Math.trunc(payDay) || 1), days))}`;
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = toUtc(from), end = toUtc(to); t <= end; t += DAY) out.push(fromUtc(t));
  return out;
}

/** Working days: Sundays and company holidays are excluded. */
export const isWorkingDay = (date: string, holidays: ReadonlySet<string>) => new Date(toUtc(date)).getUTCDay() !== 0 && !holidays.has(date);

export function workingDates(from: string, to: string, holidays: ReadonlySet<string>) {
  return from > to ? [] : eachDate(from, to).filter((d) => isWorkingDay(d, holidays));
}

const clip = (from: string, to: string, start: string, end: string): [string, string] | null => {
  const a = from > start ? from : start;
  const b = to < end ? to : end;
  return a <= b ? [a, b] : null;
};

// ---------- inputs from attendance and leave ----------
export interface AttendanceFact { date: string; absent: boolean; overtimeHours: number }
export interface LeaveFact { start: string; end: string; paid: boolean }

/**
 * Overtime hours and no-pay days for one employee in a period.
 * No-pay days are the working days in the period that are any of:
 *   - covered by approved unpaid leave (only the part inside this period),
 *   - marked Absent in attendance and not covered by approved paid leave,
 *   - before the employee's join date (mid-month joiners are paid pro rata).
 * A day is counted once even if several rules apply.
 */
export function payrollInputs(
  period: string,
  opts: { joinDate?: string; attendance: AttendanceFact[]; leave: LeaveFact[]; holidays: Iterable<string> },
) {
  const { start, end } = periodRange(period);
  const holidays = new Set(opts.holidays);
  const nopay = new Set<string>();
  const paid = new Set<string>();

  for (const l of opts.leave) {
    const r = clip(l.start, l.end, start, end);
    if (!r) continue;
    for (const d of eachDate(r[0], r[1])) {
      if (l.paid) paid.add(d);
      else if (isWorkingDay(d, holidays)) nopay.add(d);
    }
  }

  let overtimeHours = 0;
  for (const a of opts.attendance) {
    if (a.date < start || a.date > end) continue;
    overtimeHours += Math.max(0, a.overtimeHours || 0);
    if (a.absent && !paid.has(a.date) && isWorkingDay(a.date, holidays)) nopay.add(a.date);
  }

  if (opts.joinDate && opts.joinDate > start) {
    const before = fromUtc(toUtc(opts.joinDate) - DAY);
    for (const d of workingDates(start, before < end ? before : end, holidays)) nopay.add(d);
  }

  return { overtimeHours: round2(overtimeHours), nopayDays: nopay.size };
}

// ---------- pay calculation ----------
export interface PayItem { name: string; type: "fixed" | "percent"; amount: number }
export type PayRates = Pick<PayrollSettings, "epfEmployee" | "epfEmployer" | "etf" | "otRate" | "otHoursDivisor" | "nopayDaysDivisor">;

export interface PayInput {
  basic: number;
  allowances: PayItem[];
  deductions: PayItem[];
  overtimeHours: number;
  nopayDays: number;
}

const qty = (n: number) => String(round2(n)).replace(/\.0+$/, "");

/**
 * One employee's pay for one period.
 *   gross            = basic + allowances (+ overtime)
 *   no-pay deduction = basic ÷ nopayDaysDivisor × days, never more than basic
 *   EPF/ETF base     = basic − no-pay deduction
 *   total deductions = deductions + no-pay + employee EPF
 *   net              = gross − total deductions
 * Every amount is rounded to cents, and totals are sums of the rounded
 * amounts, so a payslip always adds up exactly.
 */
export function calculatePay(input: PayInput, rates: PayRates): Omit<PayrollLine, "employeeId" | "employee"> {
  const basic = round2(Math.max(0, input.basic || 0));
  const ot = Math.max(0, input.overtimeHours || 0);
  const days = Math.max(0, input.nopayDays || 0);
  const resolve = (it: PayItem) => round2(it.type === "percent" ? (basic * it.amount) / 100 : it.amount);

  const allowances: PayAmount[] = input.allowances.map((a) => ({ name: a.name, amount: resolve(a) }));
  if (ot > 0 && rates.otHoursDivisor > 0) {
    allowances.push({ name: `Overtime (${qty(ot)}h × ${qty(rates.otRate)})`, amount: round2((basic / rates.otHoursDivisor) * rates.otRate * ot) });
  }

  const deductions: PayAmount[] = input.deductions.map((d) => ({ name: d.name, amount: resolve(d) }));
  const nopay = days > 0 && rates.nopayDaysDivisor > 0 ? round2(Math.min(basic, (basic / rates.nopayDaysDivisor) * days)) : 0;
  if (nopay > 0) deductions.push({ name: `No-pay (${qty(days)} day${days === 1 ? "" : "s"})`, amount: nopay });

  const epfBase = round2(basic - nopay);
  const epfEmployee = round2((epfBase * rates.epfEmployee) / 100);
  const gross = round2(basic + total(allowances));
  const totalDeductions = round2(total(deductions) + epfEmployee);

  return {
    basic,
    allowances,
    deductions,
    overtimeHours: round2(ot),
    nopayDays: days,
    gross,
    epfEmployee,
    totalDeductions,
    net: round2(gross - totalDeductions),
    epfEmployer: round2((epfBase * rates.epfEmployer) / 100),
    etf: round2((epfBase * rates.etf) / 100),
  };
}

/** Override first, otherwise the structure's basic, otherwise zero. */
export const resolveBasic = (override: number | null | undefined, structureBasic: number | null | undefined) =>
  override ?? structureBasic ?? 0;

export const sum = (lines: PayrollLine[], k: "gross" | "totalDeductions" | "net" | "epfEmployee" | "epfEmployer" | "etf" | "basic") =>
  round2(lines.reduce((a, l) => a + l[k], 0));
