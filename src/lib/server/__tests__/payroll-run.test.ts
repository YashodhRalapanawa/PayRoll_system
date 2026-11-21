/**
 * End-to-end check of the server payroll run (B5) against an in-memory fake of
 * the Supabase query builder: employee eligibility, leave/absence mapping,
 * snapshots, totals and the approved-run lock. Expected amounts are worked out
 * by hand in the comments.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { ActiveProfile } from "@/lib/auth/guard";
import { calculatePayrollRun } from "@/lib/server/payroll";

type Row = Record<string, unknown>;

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: ((r: Row) => boolean)[] = [];
  private action: "select" | "insert" | "update" | "delete" = "select";
  private values: Row | Row[] | null = null;
  private returnRows = false;
  private mode: "many" | "single" | "maybe" = "many";
  constructor(private db: FakeDb, private table: string) {}

  select() { if (this.action !== "select") this.returnRows = true; return this; }
  insert(v: Row | Row[]) { this.action = "insert"; this.values = Array.isArray(v) ? v : [v]; return this; }
  update(v: Row) { this.action = "update"; this.values = v; return this; }
  delete() { this.action = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  lte(c: string, v: string) { this.filters.push((r) => String(r[c]) <= v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, _op: string, list: string) { const vs = list.slice(1, -1).split(","); this.filters.push((r) => !vs.includes(String(r[c]))); return this; }
  order() { return this; }
  limit() { return this; }
  returns() { return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = { data: unknown; error: unknown }, B = never>(
    ok?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, fail);
  }

  private run(): { data: unknown; error: unknown } {
    const rows = (this.db.tables[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[];
    if (this.action === "insert") {
      out = (this.values as Row[]).map((v) => ({ id: `id-${++this.db.seq}`, created_at: "2026-11-30T00:00:00Z", ...(this.db.defaults[this.table] ?? {}), ...v }));
      rows.push(...out);
    } else if (this.action === "update") {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, this.values));
    } else if (this.action === "delete") {
      out = rows.filter(match);
      this.db.tables[this.table] = rows.filter((r) => !match(r));
    } else {
      out = rows.filter(match);
    }
    if (this.action !== "select" && !this.returnRows) return { data: null, error: null };
    const data = out.map((r) => structuredClone(r));
    if (this.mode === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }
}

class FakeDb {
  seq = 0;
  defaults: Record<string, Row> = { payroll_runs: { status: "draft", approved_at: null, payment_date: null, settings_snapshot: null } };
  constructor(public tables: Record<string, Row[]>) {}
  client() {
    return { from: (t: string) => new Query(this, t) } as unknown as SupabaseClient;
  }
}

const profile: ActiveProfile = { userId: "admin-1", email: "a@x.com", fullName: "Admin", companyId: "c1", role: "admin" };

const emp = (id: string, extra: Row) => ({
  id, emp_no: id.toUpperCase(), first_name: "First", last_name: id, nic: "N", dob: null, gender: null, phone: "", email: "", address: "",
  department_id: "dep1", designation_id: "des1", branch_id: "br1", shift_id: null, join_date: "2025-01-01", employment_type: "permanent",
  status: "active", salary_structure_id: null, basic_override: null, bank_name: "BOC", bank_account: "123", epf_no: "EPF-" + id, ...extra,
});

function seed() {
  return new FakeDb({
    payroll_settings: [{ epf_employee: 8, epf_employer: 12, etf: 3, pay_day: 31, ot_rate: 1.5, ot_hours_divisor: 240, nopay_days_divisor: 30 }],
    employees: [
      emp("e1", { salary_structure_id: "s1" }),
      emp("e2", { basic_override: "30000.00", join_date: "2026-11-05" }),
      emp("e3", {}), // no salary -> skipped
      emp("e4", { status: "inactive", basic_override: 50000 }), // inactive -> excluded
      emp("e5", { basic_override: 50000, join_date: "2026-12-01" }), // joins after the period -> excluded
    ],
    salary_structures: [{ id: "s1", name: "General", basic: "60000.00" }],
    salary_items: [{ id: "i1", structure_id: "s1", kind: "allowance", name: "Transport", amount_type: "fixed", amount: 5000, sort_order: 0 }],
    leave_types: [{ id: "lt-np", paid: false }, { id: "lt-an", paid: true }],
    leave_requests: [
      { id: "l1", employee_id: "e1", leave_type_id: "lt-np", start_date: "2026-11-02", end_date: "2026-11-03", days: 2, reason: "", status: "approved", created_at: "" },
      { id: "l2", employee_id: "e1", leave_type_id: "lt-np", start_date: "2026-11-20", end_date: "2026-11-20", days: 1, reason: "", status: "pending", created_at: "" },
    ],
    holidays: [],
    attendance: [
      { id: "a1", employee_id: "e1", date: "2026-11-04", in_time: null, out_time: null, status: "absent", overtime_hours: 0 },
      { id: "a2", employee_id: "e1", date: "2026-11-12", in_time: "08:30:00", out_time: "19:30:00", status: "present", overtime_hours: "2.00" },
    ],
    departments: [{ id: "dep1", name: "Sales" }],
    designations: [{ id: "des1", name: "Executive" }],
    branches: [{ id: "br1", name: "Main" }],
    payroll_runs: [],
    payroll_lines: [],
    activity_log: [],
  });
}

describe("calculatePayrollRun", () => {
  it("includes the right employees and calculates each line exactly", async () => {
    const db = seed();
    const { run, skipped } = await calculatePayrollRun(db.client(), profile, "2026-11");

    expect(skipped.map((s) => s.id)).toEqual(["e3"]);
    expect(run.lines.map((l) => l.employeeId).sort()).toEqual(["e1", "e2"]);
    expect(run.status).toBe("Draft");
    expect(run.paymentDate).toBe("2026-11-30"); // pay day 31 clamped to November

    // e1: basic 60000, transport 5000, OT 2h = 750; no-pay = 2 leave days + 1 absence = 3 days = 6000
    // EPF base 54000 -> EPF 4320; deductions 6000 + 4320 = 10320; net 65750 - 10320 = 55430
    const e1 = run.lines.find((l) => l.employeeId === "e1")!;
    expect(e1).toMatchObject({ basic: 60000, gross: 65750, nopayDays: 3, overtimeHours: 2, epfEmployee: 4320, epfEmployer: 6480, etf: 1620, totalDeductions: 10320, net: 55430 });
    expect(e1.employee).toMatchObject({ name: "First e1", empNo: "E1", department: "Sales", designation: "Executive", branch: "Main", epfNo: "EPF-e1" });

    // e2: override 30000, joined 5 Nov -> 2, 3, 4 Nov unpaid = 3000; EPF 8% of 27000 = 2160; net 30000 - 5160 = 24840
    const e2 = run.lines.find((l) => l.employeeId === "e2")!;
    expect(e2).toMatchObject({ basic: 30000, gross: 30000, nopayDays: 3, epfEmployee: 2160, totalDeductions: 5160, net: 24840 });

    expect(db.tables.activity_log).toHaveLength(1);
    expect((db.tables.payroll_runs[0] as Row).settings_snapshot).toMatchObject({ epfEmployee: 8, otHoursDivisor: 240 });
  });

  it("recalculating a draft replaces its lines instead of duplicating them", async () => {
    const db = seed();
    await calculatePayrollRun(db.client(), profile, "2026-11");
    (db.tables.employees[0] as Row).basic_override = 70000; // salary change before approval
    const { run } = await calculatePayrollRun(db.client(), profile, "2026-11");
    expect(db.tables.payroll_runs).toHaveLength(1);
    expect(db.tables.payroll_lines).toHaveLength(2);
    expect(run.lines.find((l) => l.employeeId === "e1")!.basic).toBe(70000);
  });

  it("refuses to recalculate an approved run", async () => {
    const db = seed();
    db.tables.payroll_runs.push({ id: "r1", period: "2026-11", status: "approved" });
    await expect(calculatePayrollRun(db.client(), profile, "2026-11")).rejects.toThrow(/approved and locked/);
  });

  it("fails clearly when nobody has salary data", async () => {
    const db = seed();
    db.tables.employees = [emp("e3", {})];
    await expect(calculatePayrollRun(db.client(), profile, "2026-11")).rejects.toThrow(/No active employees with salary data/);
  });
});
