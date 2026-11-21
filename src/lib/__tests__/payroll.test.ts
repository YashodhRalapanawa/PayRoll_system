import { describe, expect, it } from "vitest";
import { leaveWorkingDays } from "@/lib/leave";
import { calculatePay, eachDate, paymentDate, payrollInputs, periodRange, resolveBasic, round2, sum, type PayRates } from "@/lib/payroll";

const RATES: PayRates = { epfEmployee: 8, epfEmployer: 12, etf: 3, otRate: 1.5, otHoursDivisor: 240, nopayDaysDivisor: 30 };

describe("round2 (money rounding)", () => {
  it("rounds half away from zero without float drift", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(3333.3333)).toBe(3333.33);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(NaN)).toBe(0);
  });
});

describe("calculatePay", () => {
  it("gross, EPF 8%/12%, ETF 3%, overtime and fixed items", () => {
    const line = calculatePay(
      {
        basic: 60000,
        allowances: [{ name: "Transport", type: "fixed", amount: 5000 }],
        deductions: [{ name: "Advance", type: "fixed", amount: 2000 }],
        overtimeHours: 2,
        nopayDays: 0,
      },
      RATES,
    );
    // OT = 60000 / 240 × 1.5 × 2 = 750
    expect(line.allowances).toEqual([{ name: "Transport", amount: 5000 }, { name: "Overtime (2h × 1.5)", amount: 750 }]);
    expect(line.gross).toBe(65750);
    expect(line.epfEmployee).toBe(4800);
    expect(line.epfEmployer).toBe(7200);
    expect(line.etf).toBe(1800);
    expect(line.totalDeductions).toBe(6800); // 2000 + 4800
    expect(line.net).toBe(58950);
  });

  it("no-pay deduction reduces pay and the EPF/ETF base", () => {
    const line = calculatePay({ basic: 60000, allowances: [], deductions: [], overtimeHours: 0, nopayDays: 3 }, RATES);
    expect(line.deductions).toEqual([{ name: "No-pay (3 days)", amount: 6000 }]); // 60000 / 30 × 3
    expect(line.epfEmployee).toBe(4320); // 8% of 54000
    expect(line.epfEmployer).toBe(6480);
    expect(line.etf).toBe(1620);
    expect(line.totalDeductions).toBe(10320);
    expect(line.net).toBe(49680);
  });

  it("caps no-pay at the basic salary", () => {
    const line = calculatePay({ basic: 60000, allowances: [], deductions: [], overtimeHours: 0, nopayDays: 40 }, RATES);
    expect(line.deductions[0].amount).toBe(60000);
    expect(line.epfEmployee).toBe(0);
    expect(line.net).toBe(0);
  });

  it("percent items are a percentage of basic, rounded to cents", () => {
    const line = calculatePay(
      { basic: 33333.33, allowances: [{ name: "Cost of living", type: "percent", amount: 10 }], deductions: [], overtimeHours: 0, nopayDays: 0 },
      RATES,
    );
    expect(line.allowances[0].amount).toBe(3333.33);
    expect(line.gross).toBe(36666.66);
  });

  it("totals always equal the sum of the rounded parts", () => {
    const line = calculatePay(
      {
        basic: 45123.45,
        allowances: [{ name: "A", type: "percent", amount: 7.5 }, { name: "B", type: "fixed", amount: 1234.56 }],
        deductions: [{ name: "C", type: "percent", amount: 2.25 }],
        overtimeHours: 3.5,
        nopayDays: 1,
      },
      RATES,
    );
    const a = line.allowances.reduce((x, y) => x + y.amount, 0);
    const d = line.deductions.reduce((x, y) => x + y.amount, 0);
    expect(line.gross).toBe(round2(line.basic + a));
    expect(line.totalDeductions).toBe(round2(d + line.epfEmployee));
    expect(line.net).toBe(round2(line.gross - line.totalDeductions));
  });

  it("treats negative or missing inputs as zero", () => {
    const line = calculatePay({ basic: -5, allowances: [], deductions: [], overtimeHours: -2, nopayDays: -1 }, RATES);
    expect(line).toMatchObject({ basic: 0, gross: 0, net: 0, overtimeHours: 0, nopayDays: 0 });
  });

  it("resolveBasic prefers the employee override", () => {
    expect(resolveBasic(50000, 60000)).toBe(50000);
    expect(resolveBasic(undefined, 60000)).toBe(60000);
    expect(resolveBasic(null, undefined)).toBe(0);
  });
});

describe("periods and pay dates", () => {
  it("knows month lengths, including leap years", () => {
    expect(periodRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28", days: 28 });
    expect(periodRange("2028-02").days).toBe(29);
    expect(periodRange("2026-12").end).toBe("2026-12-31");
  });
  it("clamps the pay day to the month", () => {
    expect(paymentDate("2026-02", 31)).toBe("2026-02-28");
    expect(paymentDate("2028-02", 31)).toBe("2028-02-29");
    expect(paymentDate("2026-04", 31)).toBe("2026-04-30");
    expect(paymentDate("2026-11", 28)).toBe("2026-11-28");
    expect(paymentDate("2026-11", 0)).toBe("2026-11-01");
  });
  it("iterates dates across month and year boundaries", () => {
    expect(eachDate("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("payrollInputs (no-pay days and overtime)", () => {
  // 1 Nov 2026 is a Sunday.
  const P = "2026-11";

  it("counts only the part of unpaid leave inside the period, excluding Sundays", () => {
    const r = payrollInputs(P, { attendance: [], leave: [{ start: "2026-10-29", end: "2026-11-03", paid: false }], holidays: [] });
    expect(r.nopayDays).toBe(2); // Mon 2, Tue 3
  });

  it("excludes holidays", () => {
    const r = payrollInputs(P, { attendance: [], leave: [{ start: "2026-10-29", end: "2026-11-03", paid: false }], holidays: ["2026-11-02"] });
    expect(r.nopayDays).toBe(1);
  });

  it("adds absences, never double-counts, and ignores paid leave and Sundays", () => {
    const r = payrollInputs(P, {
      attendance: [
        { date: "2026-11-03", absent: true, overtimeHours: 0 }, // already unpaid leave
        { date: "2026-11-04", absent: true, overtimeHours: 0 },
        { date: "2026-11-08", absent: true, overtimeHours: 0 }, // Sunday
        { date: "2026-11-10", absent: true, overtimeHours: 0 }, // paid leave
        { date: "2026-11-12", absent: false, overtimeHours: 2.5 },
        { date: "2026-10-31", absent: false, overtimeHours: 5 }, // previous month
      ],
      leave: [
        { start: "2026-10-29", end: "2026-11-03", paid: false },
        { start: "2026-11-10", end: "2026-11-11", paid: true },
      ],
      holidays: [],
    });
    expect(r.nopayDays).toBe(3); // 2, 3, 4 Nov
    expect(r.overtimeHours).toBe(2.5);
  });

  it("pays mid-month joiners pro rata", () => {
    expect(payrollInputs(P, { joinDate: "2026-11-05", attendance: [], leave: [], holidays: [] }).nopayDays).toBe(3); // 2, 3, 4 Nov
    expect(payrollInputs(P, { joinDate: "2026-11-01", attendance: [], leave: [], holidays: [] }).nopayDays).toBe(0);
    expect(payrollInputs(P, { joinDate: "2025-01-01", attendance: [], leave: [], holidays: [] }).nopayDays).toBe(0);
  });
});

describe("leave working days and sums", () => {
  it("excludes Sundays and holidays", () => {
    expect(leaveWorkingDays("2026-11-01", "2026-11-07", ["2026-11-02"])).toBe(5);
    expect(leaveWorkingDays("2026-11-07", "2026-11-01", [])).toBe(0);
  });
  it("sums lines to cents", () => {
    const l = (net: number) => ({ net } as Parameters<typeof sum>[0][number]);
    expect(sum([l(0.1), l(0.2)], "net")).toBe(0.3);
  });
});
