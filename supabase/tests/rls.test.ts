/**
 * A9 · Data isolation and permission tests against the real migrations.
 * Runs Postgres in-process (PGlite) with small stand-ins for Supabase's
 * auth/storage schemas and roles, then acts as different users.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, migratedDb } from "./harness";

const ADMIN_A = "00000000-0000-4000-8000-00000000000a";
const ADMIN_B = "00000000-0000-4000-8000-00000000000b";
const INVITED = "00000000-0000-4000-8000-00000000000c";

let db: PGlite;
let companyA: string;
let companyB: string;
let ids: { dep: string; des: string; br: string; emp: string };

const as = <T>(uid: string, fn: () => Promise<T>) => asUser(db, uid, fn);
const rows = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const onboard = (name: string) =>
  rows<{ id: string }>(
    `select create_company($1,'a@x.com','011','Addr','Sri Lanka','LKR','Rs.','Sri Lankan Rupee','Main Branch','ST001','Addr','011') id`,
    [name],
  );

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN_A}', 'Admin@A.com', '{"full_name":"Admin A"}'), ('${ADMIN_B}', 'admin@b.com', '{"full_name":"Admin B"}')`);
  companyA = (await as(ADMIN_A, () => onboard("Company A")))[0].id;
  companyB = (await as(ADMIN_B, () => onboard("Company B")))[0].id;

  ids = await as(ADMIN_A, async () => {
    const [dep] = await rows<{ id: string }>(`insert into departments (name) values ('Sales') returning id`);
    const [des] = await rows<{ id: string }>(`insert into designations (name, department_id) values ('Sales Executive', $1) returning id`, [dep.id]);
    const [br] = await rows<{ id: string }>(`select id from branches limit 1`);
    const [emp] = await rows<{ id: string }>(
      `insert into employees (emp_no, first_name, last_name, nic, department_id, designation_id, branch_id)
       values ('EMP001','Nimal','Perera','901234567V',$1,$2,$3) returning id`,
      [dep.id, des.id, br.id],
    );
    await rows(`insert into attendance (employee_id, date, in_time, out_time, status, overtime_hours) values
      ($1,'2026-11-02','08:30','19:30','present',2), ($1,'2026-11-03',null,null,'absent',0), ($1,'2026-11-04','08:30','12:30','half_day',0)`, [emp.id]);
    return { dep: dep.id, des: des.id, br: br.id, emp: emp.id };
  });
});

describe("onboarding and auth hook", () => {
  it("creates a profile for each new auth user", async () => {
    expect((await rows(`select id from profiles`)).length).toBeGreaterThanOrEqual(2);
  });
  it("makes the creator admin and seeds defaults", async () => {
    expect((await rows<{ role: string }>(`select role from profiles where id='${ADMIN_A}'`))[0].role).toBe("admin");
    expect((await rows<{ company_id: string }>(`select company_id from profiles where id='${ADMIN_B}'`))[0].company_id).toBe(companyB);
    expect(companyB).not.toBe(companyA);
    expect((await rows(`select * from leave_types where company_id='${companyA}'`)).length).toBe(4);
    expect((await rows(`select * from payroll_settings where company_id='${companyA}'`)).length).toBe(1);
  });
  it("blocks creating a second company", async () => {
    await expect(as(ADMIN_A, () => onboard("Again"))).rejects.toThrow(/already belong/);
  });
});

describe("data isolation between companies", () => {
  it("company B cannot read company A's data", async () => {
    await as(ADMIN_B, async () => {
      expect(await rows(`select * from employees`)).toHaveLength(0);
      expect(await rows(`select * from attendance`)).toHaveLength(0);
      expect(await rows(`select * from companies where id='${companyA}'`)).toHaveLength(0);
      expect(await rows(`select * from profiles where id='${ADMIN_A}'`)).toHaveLength(0);
    });
  });
  it("company B cannot write into company A", async () => {
    await expect(as(ADMIN_B, () => rows(`insert into departments (company_id, name) values ('${companyA}', 'Hack')`))).rejects.toThrow(/row-level security/);
    const upd = await as(ADMIN_B, () => db.query(`update employees set first_name='x' where id='${ids.emp}'`));
    expect(upd.affectedRows).toBe(0);
    const del = await as(ADMIN_B, () => db.query(`delete from employees where id='${ids.emp}'`));
    expect(del.affectedRows).toBe(0);
  });
  it("company B cannot reference company A's records by id", async () => {
    await expect(
      as(ADMIN_B, async () => {
        const [br] = await rows<{ id: string }>(`select id from branches limit 1`);
        await rows(`insert into employees (emp_no, first_name, last_name, nic, department_id, designation_id, branch_id) values ('X','a','b','c',$1,$2,$3)`, [ids.dep, ids.des, br.id]);
      }),
    ).rejects.toThrow(/foreign key/);
  });
  it("attendance_summary only covers the caller's company", async () => {
    const a = await as(ADMIN_A, () => rows<{ worked_days: string; overtime_hours: string; absent_days: number }>(`select * from attendance_summary('2026-11')`));
    expect(Number(a[0].worked_days)).toBe(1.5);
    expect(Number(a[0].overtime_hours)).toBe(2);
    expect(a[0].absent_days).toBe(1);
    expect(await as(ADMIN_B, () => rows(`select * from attendance_summary('2026-11')`))).toHaveLength(0);
  });
  it("storage paths are scoped to the company folder", async () => {
    await expect(as(ADMIN_B, () => rows(`insert into storage.objects (bucket_id, name) values ('company-logos', '${companyA}/logo.png')`))).rejects.toThrow(/row-level security/);
    await expect(as(ADMIN_B, () => rows(`insert into storage.objects (bucket_id, name) values ('employee-documents', '${companyA}/${ids.emp}/x.pdf')`))).rejects.toThrow(/row-level security/);
    await as(ADMIN_A, () => rows(`insert into storage.objects (bucket_id, name) values ('employee-documents', '${companyA}/${ids.emp}/x.pdf')`));
  });
});

describe("roles and invites", () => {
  beforeAll(async () => {
    await as(ADMIN_A, () => rows(`insert into company_invites (email, role) values ('viewer@a.com', 'viewer')`));
    await db.exec(`insert into auth.users (id, email) values ('${INVITED}', 'Viewer@A.com')`);
  });
  it("an invited user joins the inviting company with the invited role", async () => {
    const [p] = await rows<{ company_id: string; role: string }>(`select company_id, role from profiles where id='${INVITED}'`);
    expect(p).toEqual({ company_id: companyA, role: "viewer" });
  });
  it("viewers can read but not write", async () => {
    expect(await as(INVITED, () => rows(`select * from employees`))).toHaveLength(1);
    await expect(as(INVITED, () => rows(`insert into departments (name) values ('Ops')`))).rejects.toThrow(/row-level security/);
    expect((await as(INVITED, () => db.query(`update employees set first_name='x' where id='${ids.emp}'`))).affectedRows).toBe(0);
  });
  it("users cannot change their own role", async () => {
    await expect(as(INVITED, () => rows(`update profiles set role='admin' where id='${INVITED}'`))).rejects.toThrow(/own role/);
    await expect(as(ADMIN_A, () => rows(`update profiles set role='viewer' where id='${ADMIN_A}'`))).rejects.toThrow(/own role/);
  });
  it("only an admin of the same company can change roles", async () => {
    expect((await as(ADMIN_B, () => db.query(`update profiles set role='admin' where id='${INVITED}'`))).affectedRows).toBe(0);
    await as(ADMIN_A, () => rows(`update profiles set role='hr_manager' where id='${INVITED}'`));
    expect((await rows<{ role: string }>(`select role from profiles where id='${INVITED}'`))[0].role).toBe("hr_manager");
  });
  it("HR managers can manage employees but not salary or payroll", async () => {
    await as(INVITED, () => rows(`insert into departments (name) values ('Operations')`));
    await expect(as(INVITED, () => rows(`insert into salary_structures (name, basic) values ('X', 1)`))).rejects.toThrow(/row-level security/);
    await expect(as(INVITED, () => rows(`insert into payroll_runs (period) values ('2026-11')`))).rejects.toThrow(/row-level security/);
  });
  it("invites are visible to admins only", async () => {
    expect(await as(INVITED, () => rows(`select * from company_invites`))).toHaveLength(0);
    expect((await as(ADMIN_A, () => rows(`select * from company_invites`))).length).toBe(1);
  });
});

describe("integrity rules used by the API", () => {
  it("rejects duplicate employee numbers within a company", async () => {
    await expect(
      as(ADMIN_A, () => rows(`insert into employees (emp_no, first_name, last_name, nic, department_id, designation_id, branch_id) values ('EMP001','a','b','c',$1,$2,$3)`, [ids.dep, ids.des, ids.br])),
    ).rejects.toThrow(/employees_company_id_emp_no_key/);
  });
  it("blocks deleting a branch or department that has employees", async () => {
    await expect(as(ADMIN_A, () => rows(`delete from branches where id=$1`, [ids.br]))).rejects.toThrow(/foreign key/);
    await expect(as(ADMIN_A, () => rows(`delete from departments where id=$1`, [ids.dep]))).rejects.toThrow(/foreign key/);
  });
  it("one attendance record per employee per day", async () => {
    await expect(as(ADMIN_A, () => rows(`insert into attendance (employee_id, date, status) values ($1, '2026-11-02', 'present')`, [ids.emp]))).rejects.toThrow(/attendance_employee_id_date_key/);
  });
  it("activity log is append-only and stamped with the real actor", async () => {
    await expect(as(ADMIN_A, () => rows(`insert into activity_log (type, title, actor_id) values ('settings', 'spoof', '${ADMIN_B}')`))).rejects.toThrow(/row-level security/);
    await as(ADMIN_A, () => rows(`insert into activity_log (type, title) values ('settings', 'ok')`));
    expect((await as(ADMIN_A, () => db.query(`delete from activity_log`))).affectedRows).toBe(0);
  });
  it("the anon role sees nothing", async () => {
    await db.exec(`set role anon;`);
    try {
      expect((await db.query(`select * from employees`)).rows).toHaveLength(0);
    } finally {
      await db.exec(`reset role;`);
    }
  });
});

describe("leave and payroll rules (B2)", () => {
  let annual: string;
  beforeAll(async () => {
    annual = (await as(ADMIN_A, () => rows<{ id: string }>(`select id from leave_types where name='Annual Leave'`)))[0].id;
  });

  it("blocks overlapping leave for the same employee", async () => {
    await as(INVITED, () => rows(`insert into leave_requests (employee_id, leave_type_id, start_date, end_date, days) values ($1,$2,'2026-11-10','2026-11-12',3)`, [ids.emp, annual]));
    await expect(
      as(INVITED, () => rows(`insert into leave_requests (employee_id, leave_type_id, start_date, end_date, days) values ($1,$2,'2026-11-12','2026-11-13',2)`, [ids.emp, annual])),
    ).rejects.toThrow(/leave_requests_no_overlap/);
  });

  it("records who decided and keeps decisions final", async () => {
    const [lr] = await rows<{ id: string }>(`select id from leave_requests where start_date='2026-11-10'`);
    await as(INVITED, () => rows(`update leave_requests set status='approved' where id=$1`, [lr.id]));
    expect((await rows<{ decided_by: string }>(`select decided_by from leave_requests where id='${lr.id}'`))[0].decided_by).toBe(INVITED);
    await expect(as(INVITED, () => rows(`update leave_requests set status='rejected' where id=$1`, [lr.id]))).rejects.toThrow(/already been/);
  });

  it("leave_balances and approved_leave_on reflect approved leave", async () => {
    const bal = await as(ADMIN_A, () => rows<{ leave_type_id: string; remaining: string }>(`select * from leave_balances(2026, $1)`, [ids.emp]));
    expect(Number(bal.find((b) => b.leave_type_id === annual)!.remaining)).toBe(11);
    expect(await as(ADMIN_A, () => rows(`select * from approved_leave_on('2026-11-11')`))).toHaveLength(1);
    expect(await as(ADMIN_B, () => rows(`select * from approved_leave_on('2026-11-11')`))).toHaveLength(0);
  });

  it("only admins approve payroll, and approved runs are locked", async () => {
    const [run] = await as(ADMIN_A, () => rows<{ id: string }>(`insert into payroll_runs (period, payment_date) values ('2026-11','2026-11-28') returning id`));
    await as(ADMIN_A, () =>
      rows(`insert into payroll_lines (run_id, employee_id, basic, gross, epf_employee, total_deductions, net, epf_employer, etf) values ($1,$2,60000,65000,4800,4800,60200,7200,1800)`, [run.id, ids.emp]),
    );
    await expect(as(INVITED, () => rows(`select approve_payroll_run($1)`, [run.id]))).rejects.toThrow(/administrators/);
    // Another company's admin cannot see the run's lines, so the function refuses it.
    await expect(as(ADMIN_B, () => rows(`select approve_payroll_run($1)`, [run.id]))).rejects.toThrow(/no lines|not found/);
    await as(ADMIN_A, () => rows(`select approve_payroll_run($1)`, [run.id]));

    await expect(as(ADMIN_A, () => rows(`update payroll_lines set net=1 where run_id=$1`, [run.id]))).rejects.toThrow(/locked/);
    await expect(as(ADMIN_A, () => rows(`delete from payroll_runs where id=$1`, [run.id]))).rejects.toThrow(/locked/);
    await expect(as(ADMIN_A, () => rows(`insert into payroll_lines (run_id, employee_id, basic, gross, epf_employee, total_deductions, net, epf_employer, etf) values ($1,$2,1,1,0,0,1,0,0)`, [run.id, ids.emp]))).rejects.toThrow();
    // Recording the generated payslip PDF is the one allowed change.
    await as(ADMIN_A, () => rows(`update payroll_lines set payslip_path='x.pdf' where run_id=$1`, [run.id]));
    await expect(as(ADMIN_A, () => rows(`delete from employees where id=$1`, [ids.emp]))).rejects.toThrow(/foreign key/);
  });

  it("payroll data is invisible to other companies", async () => {
    expect(await as(ADMIN_B, () => rows(`select * from payroll_runs`))).toHaveLength(0);
    expect(await as(ADMIN_B, () => rows(`select * from payroll_lines`))).toHaveLength(0);
    expect(await as(ADMIN_B, () => rows(`select * from payroll_run_totals`))).toHaveLength(0);
    expect(await as(ADMIN_B, () => rows(`select * from leave_requests`))).toHaveLength(0);
  });

  it("HR managers cannot change payroll settings or salary items", async () => {
    expect((await as(INVITED, () => db.query(`update payroll_settings set epf_employee=1`))).affectedRows).toBe(0);
    await expect(as(INVITED, () => rows(`insert into storage.objects (bucket_id, name) values ('payslips', '${companyA}/x/y.pdf')`))).rejects.toThrow(/row-level security/);
  });
});
