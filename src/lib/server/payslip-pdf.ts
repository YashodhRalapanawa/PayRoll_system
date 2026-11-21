import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { fmtDate, fmtPeriod } from "@/lib/format";
import { periodRange } from "@/lib/payroll";
import type { Company, EmployeeSnapshot, PayrollLine, PayrollRun } from "@/lib/types";

/**
 * The built-in PDF fonts only cover Latin-1 (WinAnsi). Characters outside it
 * are replaced so a name in another script cannot break generation.
 * Embedding a Unicode font (e.g. Noto Sans Sinhala) would remove this limit.
 */
function winAnsi(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E -ÿ]/g, "?");
}

const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Input {
  company: Company;
  run: PayrollRun;
  line: PayrollLine;
  employee: EmployeeSnapshot;
  logo?: { bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null;
}

/** B6 · Renders one payslip as an A4 PDF. Draft runs carry a DRAFT watermark. */
export async function renderPayslipPdf({ company, run, line, employee, logo }: Input): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(`Payslip ${employee.empNo} ${run.period}`));
  pdf.setAuthor(winAnsi(company.name));
  pdf.setProducer("HR & Payroll");
  pdf.setCreator("HR & Payroll");

  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.2), muted = rgb(0.42, 0.45, 0.52), brand = rgb(0.35, 0.22, 0.9), line_ = rgb(0.88, 0.89, 0.92);
  const L = 48, R = 547;
  const code = company.currencyCode;
  const rates = run.rates;

  const text = (p: PDFPage, s: string, x: number, y: number, f: PDFFont = font, size = 10, color = ink) =>
    p.drawText(winAnsi(s), { x, y, size, font: f, color });
  const right = (p: PDFPage, s: string, xRight: number, y: number, f: PDFFont = font, size = 10, color = ink) =>
    p.drawText(winAnsi(s), { x: xRight - f.widthOfTextAtSize(winAnsi(s), size), y, size, font: f, color });

  // Header
  let y = 790;
  let image: PDFImage | null = null;
  if (logo) {
    try {
      image = logo.type === "image/png" ? await pdf.embedPng(logo.bytes) : await pdf.embedJpg(logo.bytes);
    } catch {
      image = null;
    }
  }
  let nameX = L;
  if (image) {
    const h = 44, w = Math.min(120, (image.width / image.height) * h);
    page.drawImage(image, { x: L, y: y - 30, width: w, height: h });
    nameX = L + w + 12;
  }
  text(page, company.name, nameX, y, bold, 15);
  text(page, company.address.replace(/\s+/g, " ").slice(0, 80), nameX, y - 16, font, 9, muted);
  right(page, "PAYSLIP", R, y, bold, 18, brand);
  right(page, fmtPeriod(run.period), R, y - 16, font, 10, muted);
  y -= 46;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: line_ });

  // Employee details
  const { start, end } = periodRange(run.period);
  const details: [string, string][] = [
    ["Employee", `${employee.name} (${employee.empNo})`],
    ["Pay period", `${fmtDate(start)} - ${fmtDate(end)}`],
    ["Designation", employee.designation || "-"],
    ["Payment date", run.paymentDate ? fmtDate(run.paymentDate) : "-"],
    ["Department", employee.department || "-"],
    ["EPF No.", employee.epfNo || "-"],
    ["Branch", employee.branch || "-"],
    ["Bank account", employee.bankAccount ? `${employee.bankName} ${employee.bankAccount}`.trim() : "-"],
  ];
  y -= 22;
  details.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? L : 310;
    const rowY = y - Math.floor(i / 2) * 16;
    text(page, k, x, rowY, font, 9, muted);
    text(page, v.slice(0, 42), x + 78, rowY, bold, 9);
  });
  y -= 4 * 16 + 14;

  // Earnings / deductions tables
  const earnings: [string, number][] = [["Basic salary", line.basic], ...line.allowances.map((a) => [a.name, a.amount] as [string, number])];
  const deductions: [string, number][] = [
    [`EPF employee${rates ? ` (${rates.epfEmployee}%)` : ""}`, line.epfEmployee],
    ...line.deductions.map((d) => [d.name, d.amount] as [string, number]),
  ];
  const table = (title: string, rows: [string, number][], totalLabel: string, totalValue: number, x: number, w: number) => {
    let ty = y;
    page.drawRectangle({ x, y: ty - 6, width: w, height: 20, color: rgb(0.95, 0.94, 1) });
    text(page, title, x + 8, ty, bold, 10, brand);
    right(page, code, x + w - 8, ty, bold, 9, brand);
    ty -= 20;
    for (const [k, v] of rows) {
      text(page, k.slice(0, 34), x + 8, ty, font, 9);
      right(page, amount(v), x + w - 8, ty, font, 9);
      ty -= 15;
    }
    page.drawLine({ start: { x, y: ty + 9 }, end: { x: x + w, y: ty + 9 }, thickness: 0.8, color: line_ });
    text(page, totalLabel, x + 8, ty - 4, bold, 9.5);
    right(page, amount(totalValue), x + w - 8, ty - 4, bold, 9.5);
    return ty - 4;
  };
  const endL = table("Earnings", earnings, "Total earnings", line.gross, L, 240);
  const endR = table("Deductions", deductions, "Total deductions", line.totalDeductions, 307, 240);
  y = Math.min(endL, endR) - 34;

  // Net pay
  page.drawRectangle({ x: 307, y: y - 10, width: 240, height: 30, color: rgb(1, 0.97, 0.88), borderColor: rgb(0.98, 0.85, 0.5), borderWidth: 1 });
  text(page, "Net payable", 317, y, bold, 11);
  right(page, `${code} ${amount(line.net)}`, 537, y, bold, 12, brand);
  if (rates) {
    text(page, `Employer contributions - EPF (${rates.epfEmployer}%): ${code} ${amount(line.epfEmployer)}`, L, y + 8, font, 8.5, muted);
    text(page, `ETF (${rates.etf}%): ${code} ${amount(line.etf)}`, L, y - 5, font, 8.5, muted);
  }

  text(page, "This is a system-generated payslip and does not require a signature.", L, 60, font, 8, muted);
  right(page, `Generated ${new Date().toISOString().slice(0, 10)}`, R, 60, font, 8, muted);

  if (run.status === "Draft") {
    page.drawText("DRAFT", { x: 150, y: 330, size: 110, font: bold, color: rgb(0.9, 0.3, 0.3), opacity: 0.12, rotate: degrees(35) });
  }
  return pdf.save();
}
