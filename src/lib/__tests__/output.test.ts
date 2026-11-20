import { describe, expect, it } from "vitest";
import { csvCell, safeFileName, toCsv } from "@/lib/csv";
import { renderPayslipPdf } from "@/lib/server/payslip-pdf";
import { calculatePay } from "@/lib/payroll";
import type { PayrollRun } from "@/lib/types";

describe("CSV export", () => {
  it("neutralises spreadsheet formulas in text cells", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1+1")).toBe(`"'+1+1"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });
  it("keeps numbers, including negative amounts, as numbers", () => {
    expect(csvCell(-1234.5)).toBe(`"-1234.5"`);
    expect(csvCell("-1,234.50")).toBe(`"-1,234.50"`);
    expect(csvCell("Nimal")).toBe(`"Nimal"`);
  });
  it("adds a UTF-8 BOM and CRLF rows", () => {
    expect(toCsv([["a", "b"], [1, 2]])).toBe('\uFEFF"a","b"\r\n"1","2"');
  });
  it("makes safe file names", () => {
    expect(safeFileName('../../etc/passwd"; x')).not.toMatch(/[/"; ]/);
  });
});

describe("payslip PDF", () => {
  const line = { employeeId: "e1", ...calculatePay({ basic: 60000, allowances: [{ name: "Transport", type: "fixed", amount: 5000 }], deductions: [], overtimeHours: 2, nopayDays: 1 }, { epfEmployee: 8, epfEmployer: 12, etf: 3, otRate: 1.5, otHoursDivisor: 240, nopayDaysDivisor: 30 }) };
  const run: PayrollRun = { id: "r1", period: "2026-02", status: "Draft", createdAt: "", paymentDate: "2026-02-28", lines: [line], rates: { epfEmployee: 8, epfEmployer: 12, etf: 3 } };
  const company = { name: "ABC (Pvt) Ltd", email: "", phone: "", address: "No. 1, Colombo", country: "Sri Lanka", currencyCode: "LKR", currencySymbol: "Rs.", currencyName: "" };

  it("renders a valid PDF, even with names outside Latin-1", async () => {
    const bytes = await renderPayslipPdf({
      company, run, line,
      employee: { name: "නිමල් Perera – “Test”", empNo: "EMP001", designation: "Exec", department: "Sales", branch: "Main", epfNo: "1", bankName: "BOC", bankAccount: "123" },
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
