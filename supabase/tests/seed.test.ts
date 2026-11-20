/** Checks that supabase/seed.sql applies cleanly, is correct, re-runnable and isolated. */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, migratedDb, SUPABASE_DIR } from "./harness";

const SEED = readFileSync(join(SUPABASE_DIR, "seed.sql"), "utf8");
const seedFor = (email: string) => SEED.replace("'admin@example.com'", `'${email}'`);

const ADMIN = "00000000-0000-4000-8000-0000000000d1";
const OTHER = "00000000-0000-4000-8000-0000000000d2";

let db: PGlite;
let otherCompany: string;
const rows = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const lastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'demo.admin@example.com'), ('${OTHER}', 'other@example.com')`);
  // An unrelated company that the seed must not touch.
  otherCompany = (await asUser(db, OTHER, () =>
    rows<{ id: string }>(`select create_company('Other Co','o@x.com','011','Addr','Sri Lanka','LKR','Rs.','Sri Lankan Rupee','Main','ST001','Addr','011') id`),
  ))[0].id;
  await db.exec(seedFor("demo.admin@example.com"));
});

describe("seed.sql", () => {
  it("creates the demo company with its organization and salary data", async () => {
    const [c] = await rows<{ id: string; employees: number; structures: number; branches: number; departments: number; designations: number; shifts: number; holidays: number; leave: number; types: number }>(`
      select c.id,
        (select count(*) from employees where company_id = c.id)::int employees,
        (select count(*) from salary_structures where company_id = c.id)::int structures,
        (select count(*) from branches where company_id = c.id)::int branches,
        (select count(*) from departments where company_id = c.id)::int departments,
        (select count(*) from designations where company_id = c.id)::int designations,
        (select count(*) from shifts where company_id = c.id)::int shifts,
        (select count(*) from holidays where company_id = c.id)::int holidays,
        (select count(*) from leave_requests where company_id = c.id)::int leave,
        (select count(*) from leave_types where company_id = c.id)::int types
      from companies c where c.name = 'Demo Trading (Pvt) Ltd'`);
    expect(c).toMatchObject({ employees: 10, structures: 3, branches: 2, departments: 4, designations: 6, shifts: 2, holidays: 1, leave: 4, types: 4 });
  });

  it("links an existing account without a company as Administrator", async () => {
    const [p] = await rows<{ role: string; name: string }>(`select p.role, c.name from profiles p join companies c on c.id = p.company_id where p.id = '${ADMIN}'`);
    expect(p).toEqual({ role: "admin", name: "Demo Trading (Pvt) Ltd" });
  });

  it("attendance covers working days only, from each join date", async () => {
    await asUser(db, ADMIN, async () => {
      const bad = await rows(`select a.* from attendance a join holidays h on h.date = a.date union all select * from attendance where extract(isodow from date) = 7`);
      expect(bad).toHaveLength(0);
      const early = await rows(`select a.* from attendance a join employees e on e.id = a.employee_id where a.date < e.join_date`);
      expect(early).toHaveLength(0);
      const [joiner] = await rows<{ n: number }>(`select count(*)::int n from attendance a join employees e on e.id = a.employee_id where e.emp_no = 'EMP010'`);
      const [full] = await rows<{ n: number }>(`select count(*)::int n from attendance a join employees e on e.id = a.employee_id where e.emp_no = 'EMP001'`);
      expect(joiner.n).toBeGreaterThan(0);
      expect(joiner.n).toBeLessThan(full.n);
    });
  });

  it("approved leave days match working days and show as On Leave", async () => {
    await asUser(db, ADMIN, async () => {
      const leave = await rows<{ employee_id: string; start_date: string; end_date: string; days: string }>(`select * from leave_requests where status = 'approved'`);
      expect(leave).toHaveLength(2);
      for (const l of leave) {
        const [w] = await rows<{ n: number }>(
          `select count(*)::int n from generate_series($1::date, $2::date, interval '1 day') d
           where extract(isodow from d) <> 7 and d::date not in (select date from holidays)`, [l.start_date, l.end_date]);
        expect(Number(l.days)).toBe(w.n);
        const [onLeave] = await rows<{ n: number }>(`select count(*)::int n from attendance where employee_id = $1 and status = 'on_leave'`, [l.employee_id]);
        expect(onLeave.n).toBe(w.n);
      }
    });
  });

  it("produces usable payroll inputs for the last full month", async () => {
    const summary = await asUser(db, ADMIN, () => rows<{ worked_days: string; absent_days: number; overtime_hours: string }>(`select * from attendance_summary($1)`, [lastMonth()]));
    expect(summary).toHaveLength(10);
    expect(summary.some((s) => s.absent_days > 0)).toBe(true);
    expect(summary.some((s) => Number(s.overtime_hours) > 0)).toBe(true);
    expect(summary.every((s) => Number(s.worked_days) > 0)).toBe(true);
  });

  it("does not touch other companies", async () => {
    const [o] = await rows<{ branches: number; employees: number }>(
      `select (select count(*) from branches where company_id = $1)::int branches, (select count(*) from employees where company_id = $1)::int employees`, [otherCompany]);
    expect(o).toEqual({ branches: 1, employees: 0 });
    expect(await asUser(db, OTHER, () => rows(`select * from employees`))).toHaveLength(0);
  });

  it("can be re-run: replaces the demo company instead of duplicating it", async () => {
    await db.exec(seedFor("demo.admin@example.com"));
    const [n] = await rows<{ companies: number; employees: number }>(`
      select (select count(*) from companies where name = 'Demo Trading (Pvt) Ltd')::int companies,
             (select count(*) from employees e join companies c on c.id = e.company_id where c.name = 'Demo Trading (Pvt) Ltd')::int employees`);
    expect(n).toEqual({ companies: 1, employees: 10 });
    const [p] = await rows<{ role: string; name: string }>(`select p.role, c.name from profiles p join companies c on c.id = p.company_id where p.id = '${ADMIN}'`);
    expect(p).toEqual({ role: "admin", name: "Demo Trading (Pvt) Ltd" });
  });

  it("creates an admin invite when the email has no account yet", async () => {
    await db.exec(seedFor("new.person@example.com"));
    const [i] = await rows<{ role: string }>(`select i.role from company_invites i join companies c on c.id = i.company_id where i.email = 'new.person@example.com' and c.name = 'Demo Trading (Pvt) Ltd'`);
    expect(i.role).toBe("admin");
  });
});
