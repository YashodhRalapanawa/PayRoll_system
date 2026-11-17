export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => iso(new Date());
export const currentPeriod = () => today().slice(0, 7);
export function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function money(n: number, code = "LKR", withCode = true) {
  const v = (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withCode ? `${code} ${v}` : v;
}
export function moneyShort(n: number, code = "LKR") {
  return `${code} ${Math.round(n).toLocaleString("en-US")}`;
}
export function fmtDate(d?: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", opts);
}
export const fmtPeriod = (p: string) => fmtDate(p + "-01", { month: "long", year: "numeric" });
export function relTime(at: string) {
  const d = new Date(at);
  const diff = Date.now() - d.getTime();
  if (diff < 86400000 && new Date().getDate() === d.getDate()) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (diff < 2 * 86400000) return "Yesterday";
  return fmtDate(at, { month: "short", day: "numeric" });
}
export function daysBetween(from: string, to: string) {
  const a = new Date(from + "T00:00:00").getTime(), b = new Date(to + "T00:00:00").getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}
export function hoursBetween(inT?: string, outT?: string) {
  if (!inT || !outT) return 0;
  const [h1, m1] = inT.split(":").map(Number), [h2, m2] = outT.split(":").map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins < 0) mins += 1440;
  return mins / 60;
}
export const fmtHours = (h: number) => (h ? `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}` : "—");
export function fmtTime(t?: string) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "?";
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
