/**
 * A9 · Data isolation and permission tests against the real migrations.
 * Runs Postgres in-process (PGlite) with small stand-ins for Supabase's
 * auth/storage schemas and roles, then acts as different users.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = join(__dirname, "..", "migrations");

const SUPABASE_STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema storage;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const ADMIN_A = "00000000-0000-4000-8000-00000000000a";
const ADMIN_B = "00000000-0000-4000-8000-00000000000b";
const INVITED = "00000000-0000-4000-8000-00000000000c";

let db: PGlite;
let companyA: string;
let companyB: string;
let ids: { dep: string; des: string; br: string; emp: string };

async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const rows = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const onboard = (name: string) =>
  rows<{ id: string }>(
    `select create_company($1,'a@x.com','011','Addr','Sri Lanka','LKR','Rs.','Sri Lankan Rupee','Main Branch','ST001','Addr','011') id`,
    [name],
  );

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
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
