import { ApiError } from "@/lib/api/errors";
import { route } from "@/lib/api/route";
import { safeFileName, toCsv } from "@/lib/csv";
import { buildReport, REPORT_TYPES, type ReportType } from "@/lib/server/reports";
import { periodSchema, uuid } from "@/lib/validation";

/**
 * B7 · GET /api/reports/{type}?period=YYYY-MM&departmentId=…&fields=a,b&format=csv
 * Returns { headers, rows, footer } as JSON, or a CSV download.
 */
export const GET = route<{ type: string }>({}, async ({ req, params, supabase }) => {
  if (!(REPORT_TYPES as readonly string[]).includes(params.type)) throw new ApiError(404, "Report not found.");
  const type = params.type as ReportType;
  const sp = req.nextUrl.searchParams;
  const period = periodSchema.parse(sp.get("period") ?? new Date().toISOString().slice(0, 7));
  const departmentId = sp.get("departmentId") ? uuid.parse(sp.get("departmentId")) : null;
  const fields = (sp.get("fields") ?? "").split(",").map((f) => f.trim()).filter(Boolean).slice(0, 20);

  const report = await buildReport(supabase, type, { period, departmentId, fields });

  if (sp.get("format") === "csv") {
    const csv = toCsv([report.headers, ...report.rows.map((r) => report.headers.map((h) => r[h]))]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFileName(`${type}-report-${period}.csv`)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return { report };
});
