import { ApiError, dbError } from "@/lib/api/errors";
import { idParam, route } from "@/lib/api/route";
import { safeFileName } from "@/lib/csv";
import { toPayrollRun } from "@/lib/mappers";
import { COLS, loadCompany } from "@/lib/server/data";
import { renderPayslipPdf } from "@/lib/server/payslip-pdf";
import type { EmployeeSnapshot } from "@/lib/types";
import type { CompanyRow, PayrollLineRow, PayrollRunRow } from "@/types/database";

const BUCKET = "payslips";

/**
 * B6 · GET /api/payslips/{runId}/{employeeId}.pdf
 * Approved runs: the PDF is generated once, stored privately under
 * payslips/{company_id}/{run_id}/{employee_id}.pdf and served from storage
 * afterwards, so the document never changes. Draft runs get a watermarked
 * preview that is not stored.
 */
export const GET = route<{ runId: string; file: string }>({}, async ({ params, supabase, profile }) => {
  const runId = idParam(params.runId, "Payslip");
  const employeeId = idParam(params.file?.replace(/\.pdf$/i, ""), "Payslip");

  const [{ data: runRow, error: rErr }, { data: lineRow, error: lErr }] = await Promise.all([
    supabase.from("payroll_runs").select(COLS.payrollRun).eq("id", runId).maybeSingle<PayrollRunRow>(),
    supabase.from("payroll_lines").select(COLS.payrollLine).eq("run_id", runId).eq("employee_id", employeeId).maybeSingle<PayrollLineRow>(),
  ]);
  if (rErr || lErr) throw dbError((rErr ?? lErr)!);
  if (!runRow || !lineRow) throw new ApiError(404, "Payslip not found.");

  const run = toPayrollRun(runRow, [lineRow]);
  const line = run.lines[0];
  const fileName = safeFileName(`payslip-${run.period}-${line.employee?.empNo ?? employeeId.slice(0, 8)}.pdf`);
  const pdfResponse = (bytes: Uint8Array) =>
    new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });

  const storedPath = `${profile.companyId}/${runId}/${employeeId}.pdf`;
  if (run.status === "Approved" && lineRow.payslip_path === storedPath) {
    const { data } = await supabase.storage.from(BUCKET).download(storedPath);
    if (data) return pdfResponse(new Uint8Array(await data.arrayBuffer()));
  }

  let employee: EmployeeSnapshot | undefined = line.employee;
  if (!employee) {
    const { data: e } = await supabase
      .from("employees")
      .select("first_name, last_name, emp_no, epf_no, bank_name, bank_account")
      .eq("id", employeeId)
      .maybeSingle<{ first_name: string; last_name: string; emp_no: string; epf_no: string | null; bank_name: string | null; bank_account: string | null }>();
    employee = {
      name: e ? `${e.first_name} ${e.last_name}` : "Employee", empNo: e?.emp_no ?? "", designation: "", department: "", branch: "",
      epfNo: e?.epf_no ?? "", bankName: e?.bank_name ?? "", bankAccount: e?.bank_account ?? "",
    };
  }

  const company = await loadCompany(supabase);
  let logo: { bytes: Uint8Array; type: "image/png" | "image/jpeg" } | null = null;
  const { data: c } = await supabase.from("companies").select("logo_path").single<Pick<CompanyRow, "logo_path">>();
  if (c?.logo_path) {
    const { data: blob } = await supabase.storage.from("company-logos").download(c.logo_path);
    if (blob) logo = { bytes: new Uint8Array(await blob.arrayBuffer()), type: c.logo_path.endsWith(".png") ? "image/png" : "image/jpeg" };
  }

  const bytes = await renderPayslipPdf({ company, run, line, employee, logo });

  // Keep the approved PDF (admins only: storage and line updates are admin-only under RLS).
  if (run.status === "Approved" && profile.role === "admin") {
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(storedPath, bytes, { contentType: "application/pdf", upsert: true });
    if (!upErr) await supabase.from("payroll_lines").update({ payslip_path: storedPath }).eq("id", lineRow.id);
  }
  return pdfResponse(bytes);
});
