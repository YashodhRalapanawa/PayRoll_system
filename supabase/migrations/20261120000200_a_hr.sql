-- =============================================================================
-- A6 / A7 · Employees, documents, shifts and attendance
-- Owner: Developer A
-- Tables: shifts, employees, employee_documents, attendance
-- Contract for B: employees.(id, basic_override, salary_structure_id,
--   bank_name, bank_account, epf_no) and public.attendance_summary().
-- =============================================================================

create type public.employment_type as enum ('permanent', 'contract', 'probation', 'intern');
create type public.attendance_status as enum ('present', 'absent', 'late', 'on_leave', 'half_day');

-- ---------- shifts ---------------------------------------------------------------
create table public.shifts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  start_time      time not null,
  end_time        time not null,              -- earlier than start_time = crosses midnight
  break_mins      integer not null default 60 check (break_mins between 0 and 720),
  late_grace_mins integer not null default 10 check (late_grace_mins between 0 and 240),
  status          public.record_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);
create trigger shifts_updated_at before update on public.shifts
  for each row execute function private.set_updated_at();

-- ---------- employees ------------------------------------------------------------
create table public.employees (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  emp_no              text not null check (length(trim(emp_no)) > 0),
  first_name          text not null check (length(trim(first_name)) > 0),
  last_name           text not null check (length(trim(last_name)) > 0),
  nic                 text not null check (length(trim(nic)) > 0),
  dob                 date,
  gender              text check (gender in ('Male', 'Female', 'Other')),
  phone               text not null default '',
  email               text not null default '' check (email = '' or email like '%_@_%'),
  address             text not null default '',
  department_id       uuid not null,
  designation_id      uuid not null,
  branch_id           uuid not null,
  shift_id            uuid,
  join_date           date not null default current_date,
  employment_type     public.employment_type not null default 'permanent',
  status              public.record_status not null default 'active',
  salary_structure_id uuid,                    -- FK added in the B migration
  basic_override      numeric(12, 2) check (basic_override is null or basic_override >= 0),
  bank_name           text,
  bank_account        text,
  epf_no              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, emp_no),
  foreign key (company_id, department_id)  references public.departments (company_id, id),
  foreign key (company_id, designation_id) references public.designations (company_id, id),
  foreign key (company_id, branch_id)      references public.branches (company_id, id),
  foreign key (company_id, shift_id)       references public.shifts (company_id, id) on delete set null (shift_id)
);
create index employees_department_idx  on public.employees (company_id, department_id);
create index employees_designation_idx on public.employees (company_id, designation_id);
create index employees_branch_idx      on public.employees (company_id, branch_id);
create index employees_shift_idx       on public.employees (company_id, shift_id);
create index employees_status_idx      on public.employees (company_id, status);
create trigger employees_updated_at before update on public.employees
  for each row execute function private.set_updated_at();

-- ---------- employee_documents ---------------------------------------------------
create table public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  employee_id  uuid not null,
  name         text not null check (length(trim(name)) > 0),
  reference    text not null default '',      -- free-text location, e.g. "HR file #12"
  storage_path text,                          -- employee-documents/{company_id}/{employee_id}/...
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index employee_documents_employee_idx on public.employee_documents (company_id, employee_id);

-- ---------- attendance -----------------------------------------------------------
create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  employee_id    uuid not null,
  date           date not null,
  in_time        time,
  out_time       time,
  status         public.attendance_status not null,
  overtime_hours numeric(5, 2) not null default 0 check (overtime_hours between 0 and 24),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, date),
  foreign key (company_id, employee_id) references public.employees (company_id, id) on delete cascade
);
create index attendance_company_date_idx     on public.attendance (company_id, date);
create index attendance_company_employee_idx on public.attendance (company_id, employee_id, date);
create trigger attendance_updated_at before update on public.attendance
  for each row execute function private.set_updated_at();

-- ---------- getAttendanceSummary(employeeId, period) -----------------------------
-- Per-employee totals for a 'YYYY-MM' period. Payroll (B5) reads this.
create function public.attendance_summary(p_period text, p_employee_id uuid default null)
returns table (
  employee_id    uuid,
  present_days   integer,
  late_days      integer,
  half_days      integer,
  absent_days    integer,
  leave_days     integer,
  worked_days    numeric,
  overtime_hours numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.employee_id,
    (count(*) filter (where a.status = 'present'))::integer,
    (count(*) filter (where a.status = 'late'))::integer,
    (count(*) filter (where a.status = 'half_day'))::integer,
    (count(*) filter (where a.status = 'absent'))::integer,
    (count(*) filter (where a.status = 'on_leave'))::integer,
    (count(*) filter (where a.status in ('present', 'late'))
      + 0.5 * count(*) filter (where a.status = 'half_day'))::numeric,
    coalesce(sum(a.overtime_hours), 0)::numeric
  from public.attendance a
  where a.company_id = private.current_company_id()
    and a.date >= to_date(p_period || '-01', 'YYYY-MM-DD')
    and a.date <  (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month')
    and (p_employee_id is null or a.employee_id = p_employee_id)
  group by a.employee_id;
$$;
revoke all on function public.attendance_summary(text, uuid) from public, anon;
grant execute on function public.attendance_summary(text, uuid) to authenticated;

-- ---------- RLS ------------------------------------------------------------------
select private.apply_tenant_rls('shifts', 'is_hr');
select private.apply_tenant_rls('employees', 'is_hr');
select private.apply_tenant_rls('employee_documents', 'is_hr');
select private.apply_tenant_rls('attendance', 'is_hr');
