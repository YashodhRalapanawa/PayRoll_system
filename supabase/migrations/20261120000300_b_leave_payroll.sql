-- =============================================================================
-- B2 · Leave, salary and payroll
-- Owner: Developer B
-- Tables: leave_types, holidays, leave_requests, salary_structures,
--         salary_items, payroll_settings, payroll_runs, payroll_lines
-- Also: employees.salary_structure_id FK, company defaults trigger,
--       leave_balances(), approved_leave_on(), payroll lock + approve RPC,
--       payroll_run_totals view, payslips storage bucket.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

create type public.leave_status as enum ('pending', 'approved', 'rejected');
create type public.payroll_status as enum ('draft', 'approved');
create type public.salary_item_kind as enum ('allowance', 'deduction');
create type public.amount_type as enum ('fixed', 'percent');

-- ---------- leave_types ----------------------------------------------------------
create table public.leave_types (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  days_per_year numeric(5, 1) not null default 0 check (days_per_year >= 0),
  paid          boolean not null default true,   -- false = no-pay deduction in payroll
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);
create trigger leave_types_updated_at before update on public.leave_types
  for each row execute function private.set_updated_at();

-- ---------- holidays -------------------------------------------------------------
create table public.holidays (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  date        date not null,
  created_at  timestamptz not null default now(),
  unique (company_id, date)
);

-- ---------- leave_requests -------------------------------------------------------
create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  employee_id   uuid not null,
  leave_type_id uuid not null,
  start_date    date not null,
  end_date      date not null,
  days          numeric(5, 1) not null check (days > 0),   -- working days (Sundays/holidays excluded)
  reason        text not null default '',
  status        public.leave_status not null default 'pending',
  requested_by  uuid default auth.uid(),
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (company_id, employee_id)   references public.employees (company_id, id) on delete cascade,
  foreign key (company_id, leave_type_id) references public.leave_types (company_id, id),
  -- Overlap check: one employee cannot hold two non-rejected requests on the same day.
  constraint leave_requests_no_overlap exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status <> 'rejected')
);
create index leave_requests_employee_idx   on public.leave_requests (company_id, employee_id);
create index leave_requests_leave_type_idx on public.leave_requests (company_id, leave_type_id);
create index leave_requests_status_idx     on public.leave_requests (company_id, status);
create trigger leave_requests_updated_at before update on public.leave_requests
  for each row execute function private.set_updated_at();

-- Stamp who decided and when, and keep decisions final.
create function private.stamp_leave_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'Leave request has already been %', old.status using errcode = '42501';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end;
$$;
create trigger leave_requests_decision before update on public.leave_requests
  for each row execute function private.stamp_leave_decision();

-- ---------- salary_structures / salary_items -------------------------------------
create table public.salary_structures (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  basic       numeric(12, 2) not null check (basic > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);
create trigger salary_structures_updated_at before update on public.salary_structures
  for each row execute function private.set_updated_at();

create table public.salary_items (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  structure_id uuid not null,
  kind         public.salary_item_kind not null,
  name         text not null check (length(trim(name)) > 0),
  amount_type  public.amount_type not null default 'fixed',
  amount       numeric(12, 2) not null default 0 check (amount >= 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  check (amount_type <> 'percent' or amount <= 100),
  foreign key (company_id, structure_id) references public.salary_structures (company_id, id) on delete cascade
);
create index salary_items_structure_idx on public.salary_items (company_id, structure_id, sort_order);

-- Assign structures to employees (column owned by A, FK added here with A's agreement).
alter table public.employees
  add constraint employees_salary_structure_fk
  foreign key (company_id, salary_structure_id) references public.salary_structures (company_id, id);
create index employees_salary_structure_idx on public.employees (company_id, salary_structure_id);

-- ---------- payroll_settings (one row per company) -------------------------------
create table public.payroll_settings (
  company_id         uuid primary key default private.current_company_id() references public.companies (id) on delete cascade,
  epf_employee       numeric(5, 2) not null default 8  check (epf_employee between 0 and 100),
  epf_employer       numeric(5, 2) not null default 12 check (epf_employer between 0 and 100),
  etf                numeric(5, 2) not null default 3  check (etf between 0 and 100),
  pay_day            smallint not null default 28 check (pay_day between 1 and 31),
  ot_rate            numeric(4, 2) not null default 1.5 check (ot_rate >= 0),
  ot_hours_divisor   numeric(6, 2) not null default 240 check (ot_hours_divisor > 0),   -- hourly = basic / 240
  nopay_days_divisor numeric(5, 2) not null default 30 check (nopay_days_divisor > 0),  -- daily = basic / 30
  updated_at         timestamptz not null default now()
);
create trigger payroll_settings_updated_at before update on public.payroll_settings
  for each row execute function private.set_updated_at();

-- ---------- payroll_runs / payroll_lines -----------------------------------------
create table public.payroll_runs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  period            text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- 'YYYY-MM'
  status            public.payroll_status not null default 'draft',
  payment_date      date,
  settings_snapshot jsonb not null default '{}'::jsonb,   -- payroll_settings used for this run
  calculated_by     uuid default auth.uid(),
  calculated_at     timestamptz not null default now(),
  approved_by       uuid,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, period),
  check ((status = 'approved') = (approved_at is not null))
);
create trigger payroll_runs_updated_at before update on public.payroll_runs
  for each row execute function private.set_updated_at();

create table public.payroll_lines (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  run_id            uuid not null,
  employee_id       uuid not null,
  employee_snapshot jsonb not null default '{}'::jsonb,   -- name, emp_no, designation, department, bank, epf_no at run time
  basic             numeric(12, 2) not null,
  allowances        jsonb not null default '[]'::jsonb,  -- [{ "name": "...", "amount": 0 }]
  deductions        jsonb not null default '[]'::jsonb,
  overtime_hours    numeric(6, 2) not null default 0,
  nopay_days        numeric(5, 1) not null default 0,
  gross             numeric(12, 2) not null,
  epf_employee      numeric(12, 2) not null,
  total_deductions  numeric(12, 2) not null,
  net               numeric(12, 2) not null,
  epf_employer      numeric(12, 2) not null,
  etf               numeric(12, 2) not null,
  payslip_path      text,                                -- payslips/{company_id}/{run_id}/{employee_id}.pdf
  created_at        timestamptz not null default now(),
  unique (run_id, employee_id),
  foreign key (company_id, run_id)      references public.payroll_runs (company_id, id) on delete cascade,
  foreign key (company_id, employee_id) references public.employees (company_id, id)   -- blocks deleting paid employees
);
create index payroll_lines_run_idx      on public.payroll_lines (company_id, run_id);
create index payroll_lines_employee_idx on public.payroll_lines (company_id, employee_id);

-- ---------- Lock: approved runs are read-only -------------------------------------
create function private.guard_payroll_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'Payroll for % is approved and locked', old.period using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger payroll_runs_lock before update or delete on public.payroll_runs
  for each row execute function private.guard_payroll_run();

-- Lines of an approved run cannot change, except recording the generated payslip PDF.
create function private.guard_payroll_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_status public.payroll_status;
begin
  if tg_op = 'DELETE' then v_run := old.run_id; else v_run := new.run_id; end if;
  select status into v_status from public.payroll_runs where id = v_run;

  if v_status = 'approved' then
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'payslip_path') = (to_jsonb(old) - 'payslip_path') then
      return new;
    end if;
    raise exception 'Payroll run is approved and locked' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_payroll_line() from public;
create trigger payroll_lines_lock before insert or update or delete on public.payroll_lines
  for each row execute function private.guard_payroll_line();

-- ---------- POST /api/payroll/[id]/approve calls this ----------------------------
create function public.approve_payroll_run(p_run_id uuid)
returns public.payroll_runs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.payroll_runs;
  v_lines integer;
begin
  if not private.is_admin() then
    raise exception 'Only administrators can approve payroll' using errcode = '42501';
  end if;

  select count(*) into v_lines from public.payroll_lines where run_id = p_run_id;
  if v_lines = 0 then
    raise exception 'Payroll run has no lines to approve' using errcode = 'P0001';
  end if;

  update public.payroll_runs
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_run_id
     and status = 'draft'
     and company_id = private.current_company_id()
  returning * into v_run;

  if v_run.id is null then
    raise exception 'Draft payroll run not found' using errcode = 'P0002';
  end if;

  perform public.log_activity(
    'payroll',
    'Payroll processed',
    format('%s payroll was approved for %s employees.',
           to_char(to_date(v_run.period || '-01', 'YYYY-MM-DD'), 'FMMonth YYYY'), v_lines)
  );
  return v_run;
end;
$$;
revoke all on function public.approve_payroll_run(uuid) from public, anon;
grant execute on function public.approve_payroll_run(uuid) to authenticated;

-- ---------- Read helpers ----------------------------------------------------------
create view public.payroll_run_totals
with (security_invoker = true)
as
select
  r.id                                  as run_id,
  r.company_id,
  r.period,
  r.status,
  count(l.id)::integer                  as employees,
  coalesce(sum(l.gross), 0)             as gross,
  coalesce(sum(l.total_deductions), 0)  as total_deductions,
  coalesce(sum(l.net), 0)               as net,
  coalesce(sum(l.epf_employee), 0)      as epf_employee,
  coalesce(sum(l.epf_employer), 0)      as epf_employer,
  coalesce(sum(l.etf), 0)               as etf
from public.payroll_runs r
left join public.payroll_lines l on l.run_id = r.id
group by r.id;

-- Balances per employee and leave type for a year. remaining is null for unpaid types.
create function public.leave_balances(
  p_year        integer default extract(year from current_date)::integer,
  p_employee_id uuid default null
)
returns table (
  employee_id   uuid,
  leave_type_id uuid,
  entitled      numeric,
  used          numeric,
  pending       numeric,
  remaining     numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    lt.id,
    lt.days_per_year,
    coalesce(sum(lr.days) filter (where lr.status = 'approved'), 0),
    coalesce(sum(lr.days) filter (where lr.status = 'pending'), 0),
    case when lt.paid
      then greatest(lt.days_per_year - coalesce(sum(lr.days) filter (where lr.status = 'approved'), 0), 0)
    end
  from public.employees e
  join public.leave_types lt on lt.company_id = e.company_id
  left join public.leave_requests lr
    on lr.employee_id = e.id
   and lr.leave_type_id = lt.id
   and extract(year from lr.start_date) = p_year
  where e.company_id = private.current_company_id()
    and (p_employee_id is null or e.id = p_employee_id)
  group by e.id, lt.id;
$$;
revoke all on function public.leave_balances(integer, uuid) from public, anon;
grant execute on function public.leave_balances(integer, uuid) to authenticated;

-- getApprovedLeave(date): who is on approved leave that day (attendance screen).
create function public.approved_leave_on(p_date date default current_date)
returns table (employee_id uuid, leave_request_id uuid, leave_type_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select lr.employee_id, lr.id, lr.leave_type_id
  from public.leave_requests lr
  where lr.company_id = private.current_company_id()
    and lr.status = 'approved'
    and p_date between lr.start_date and lr.end_date;
$$;
revoke all on function public.approved_leave_on(date) from public, anon;
grant execute on function public.approved_leave_on(date) to authenticated;

-- ---------- New company defaults --------------------------------------------------
create function private.seed_company_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payroll_settings (company_id) values (new.id);
  insert into public.leave_types (company_id, name, days_per_year, paid) values
    (new.id, 'Annual Leave', 14, true),
    (new.id, 'Casual Leave', 7, true),
    (new.id, 'Medical Leave', 7, true),
    (new.id, 'No-pay Leave', 0, false);
  return new;
end;
$$;
revoke all on function private.seed_company_defaults() from public;
create trigger companies_seed_defaults after insert on public.companies
  for each row execute function private.seed_company_defaults();

-- ---------- RLS --------------------------------------------------------------------
select private.apply_tenant_rls('leave_types', 'is_hr');
select private.apply_tenant_rls('holidays', 'is_hr');
select private.apply_tenant_rls('leave_requests', 'is_hr');
select private.apply_tenant_rls('salary_structures', 'is_admin');
select private.apply_tenant_rls('salary_items', 'is_admin');
select private.apply_tenant_rls('payroll_runs', 'is_admin');
select private.apply_tenant_rls('payroll_lines', 'is_admin');

alter table public.payroll_settings enable row level security;
create policy payroll_settings_select on public.payroll_settings for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy payroll_settings_update on public.payroll_settings for update to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_admin()))
  with check (company_id = (select private.current_company_id()));
-- Rows are created by seed_company_defaults(); no insert/delete from the API.

-- ---------- Storage: payslip PDFs ------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payslips', 'payslips', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "payslips: members read" on storage.objects for select to authenticated
  using (bucket_id = 'payslips'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text);
create policy "payslips: admins insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payslips'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and (select private.is_admin()));
create policy "payslips: admins update" on storage.objects for update to authenticated
  using (bucket_id = 'payslips'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and (select private.is_admin()));
create policy "payslips: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'payslips'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and (select private.is_admin()));
