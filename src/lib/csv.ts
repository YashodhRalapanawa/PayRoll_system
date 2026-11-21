/**
 * CSV encoding with formula-injection protection: a text cell starting with
 * = + - @ tab or CR is prefixed with ' so spreadsheet apps show it as text
 * instead of running it (e.g. an employee named "=HYPERLINK(...)").
 * Plain numbers, including negatives such as -1,234.50, are left as numbers.
 */
const NUMERIC = /^-?[\d,]*\.?\d+$/;

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 names (Sinhala, Tamil, etc.) correctly.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Safe file name for Content-Disposition / downloads. */
export const safeFileName = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(0, 100) || "export";
