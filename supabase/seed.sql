-- =============================================================================
-- Demo data for development and testing. NEVER run this on production data.
--
-- Creates one company ("Demo Trading (Pvt) Ltd") with 10 employees, salary
-- structures, a holiday, leave requests and a full month of attendance for the
-- last complete calendar month, so payroll can be calculated straight away.
--
-- How to use (Supabase dashboard > SQL Editor, or `supabase db reset` locally):
--   1. Change v_admin_email below to YOUR login email.
--   2. Run the whole script.
--      - If you already registered and have no company yet, you become the
--        demo company's Administrator.
--      - If you have not registered, an admin invite is created: register with
--        that email (and confirm it) to join as Administrator.
--
-- Re-running replaces the previous demo company and all of its data.
-- No auth users or passwords are created by this script.
-- Attendance is deterministic (no randomness), so payroll results are repeatable.
-- =============================================================================

do $seed$
declare
  v_admin_email   text := 'admin@example.com';          -- <<< CHANGE ME
  v_company_name  constant text := 'Demo Trading (Pvt) Ltd';

  m        date := date_trunc('month', current_date - interval '1 month')::date;  -- first day of last full month
  m_end    date := (date_trunc('month', current_date) - interval '1 day')::date;  -- last day of last full month
  v_holiday date := (date_trunc('month', current_date - interval '1 month') + interval '13 days')::date;

  v_company uuid;
  b_main uuid; b_kandy uuid;
  d_sales uuid; d_fin uuid; d_hr uuid; d_ops uuid;
  g_sales_exec uuid; g_sales_mgr uuid; g_accountant uuid; g_hr_officer uuid; g_ops_assistant uuid; g_ops_lead uuid;
  sh_general uuid; sh_morning uuid;
  st_general uuid; st_exec uuid; st_mgmt uuid;
  lt_annual uuid; lt_casual uuid; lt_nopay uuid;
  e uuid[];
  v_start date; v_end date;
  v_profile record;
begin
  -- ---------- remove the previous demo company (cascades to all its data) ----------
  begin
    delete from public.companies where name = v_company_name;
  exception when others then
    raise exception 'Could not remove the previous demo company: %. Approved payroll runs are locked by design; delete the demo company''s data manually first.', sqlerrm;
  end;

  -- ---------- company (payroll settings and 4 leave types are added by trigger) ----------
  insert into public.companies (name, email, phone, address, country, currency_code, currency_symbol, currency_name, setup_complete)
  values (v_company_name, 'info@demo-trading.example', '011 234 5678', 'No. 25, Galle Road, Colombo 03', 'Sri Lanka', 'LKR', 'Rs.', 'Sri Lankan Rupee', true)
  returning id into v_company;

  select id into lt_annual from public.leave_types where company_id = v_company and name = 'Annual Leave';
  select id into lt_casual from public.leave_types where company_id = v_company and name = 'Casual Leave';
  select id into lt_nopay  from public.leave_types where company_id = v_company and name = 'No-pay Leave';

  -- ---------- organization ----------
  insert into public.branches (company_id, name, code, address, contact) values
    (v_company, 'Main Branch', 'ST001', 'No. 25, Galle Road, Colombo 03', '011 234 5678') returning id into b_main;
  insert into public.branches (company_id, name, code, address, contact) values
    (v_company, 'Kandy Branch', 'ST002', 'No. 8, Dalada Veediya, Kandy', '081 222 3344') returning id into b_kandy;

  insert into public.departments (company_id, name) values (v_company, 'Sales') returning id into d_sales;
  insert into public.departments (company_id, name) values (v_company, 'Finance') returning id into d_fin;
  insert into public.departments (company_id, name) values (v_company, 'Human Resources') returning id into d_hr;
  insert into public.departments (company_id, name) values (v_company, 'Operations') returning id into d_ops;

  insert into public.designations (company_id, name, department_id) values (v_company, 'Sales Executive', d_sales) returning id into g_sales_exec;
  insert into public.designations (company_id, name, department_id) values (v_company, 'Sales Manager', d_sales) returning id into g_sales_mgr;
  insert into public.designations (company_id, name, department_id) values (v_company, 'Accountant', d_fin) returning id into g_accountant;
  insert into public.designations (company_id, name, department_id) values (v_company, 'HR Officer', d_hr) returning id into g_hr_officer;
  insert into public.designations (company_id, name, department_id) values (v_company, 'Operations Assistant', d_ops) returning id into g_ops_assistant;
  insert into public.designations (company_id, name, department_id) values (v_company, 'Operations Lead', d_ops) returning id into g_ops_lead;

  insert into public.shifts (company_id, name, start_time, end_time, break_mins) values (v_company, 'General Shift', '08:30', '17:30', 60) returning id into sh_general;
  insert into public.shifts (company_id, name, start_time, end_time, break_mins) values (v_company, 'Morning Shift', '06:00', '14:00', 30) returning id into sh_morning;

  -- ---------- salary structures ----------
  insert into public.salary_structures (company_id, name, basic) values (v_company, 'General Staff', 55000) returning id into st_general;
  insert into public.salary_structures (company_id, name, basic) values (v_company, 'Executive', 90000) returning id into st_exec;
  insert into public.salary_structures (company_id, name, basic) values (v_company, 'Management', 150000) returning id into st_mgmt;

  insert into public.salary_items (company_id, structure_id, kind, name, amount_type, amount, sort_order) values
    (v_company, st_general, 'allowance', 'Transport',      'fixed',    5000, 0),
    (v_company, st_general, 'allowance', 'Meal',           'fixed',    3000, 1),
    (v_company, st_general, 'deduction', 'Welfare Society','fixed',     500, 0),
    (v_company, st_exec,    'allowance', 'Transport',      'fixed',   10000, 0),
    (v_company, st_exec,    'allowance', 'Cost of Living', 'percent',     5, 1),
    (v_company, st_exec,    'deduction', 'Welfare Society','fixed',    1000, 0),
    (v_company, st_mgmt,    'allowance', 'Vehicle',        'fixed',   25000, 0),
    (v_company, st_mgmt,    'allowance', 'Phone',          'fixed',    3000, 1),
    (v_company, st_mgmt,    'deduction', 'Welfare Society','fixed',    1500, 0);

  -- ---------- holiday ----------
  insert into public.holidays (company_id, name, date) values (v_company, 'Full Moon Poya Day (demo)', v_holiday);

  -- ---------- employees (sample people; emails use the reserved example.com domain) ----------
  insert into public.employees (
    company_id, emp_no, first_name, last_name, nic, dob, gender, phone, email, address,
    department_id, designation_id, branch_id, shift_id, join_date, employment_type, status,
    salary_structure_id, basic_override, bank_name, bank_account, epf_no
  )
  select v_company, x.emp_no, x.first_name, x.last_name, x.nic, x.dob, x.gender, x.phone, x.email, x.address,
         x.dep, x.des, x.branch, x.shift, x.join_date, x.etype::public.employment_type, 'active',
         x.structure, x.basic_override, 'Bank of Ceylon', x.account, x.epf
  from (values
    ('EMP001', 'Nimal',    'Perera',          '198812345601', date '1988-03-14', 'Male',   '077 123 4501', 'nimal.perera@example.com',     'Colombo 05',  d_sales, g_sales_exec,    b_main,  sh_general, date '2022-01-10', 'permanent', st_general, null::numeric, '0001234501', 'EPF-1001'),
    ('EMP002', 'Kumari',   'Silva',           '199123456702', date '1991-07-22', 'Female', '077 123 4502', 'kumari.silva@example.com',     'Dehiwala',    d_sales, g_sales_exec,    b_main,  sh_general, date '2023-04-03', 'permanent', st_general, null,          '0001234502', 'EPF-1002'),
    ('EMP003', 'Sunil',    'Fernando',        '198534567803', date '1985-11-02', 'Male',   '077 123 4503', 'sunil.fernando@example.com',   'Moratuwa',    d_ops,   g_ops_assistant, b_main,  sh_morning, date '2021-08-16', 'permanent', st_general, null,          '0001234503', 'EPF-1003'),
    ('EMP004', 'Dilani',   'Jayasinghe',      '199545678904', date '1995-01-30', 'Female', '077 123 4504', 'dilani.j@example.com',         'Kandy',       d_ops,   g_ops_assistant, b_kandy, sh_morning, date '2024-02-12', 'contract',  st_general, null,          '0001234504', 'EPF-1004'),
    ('EMP005', 'Kasun',    'Bandara',         '199656789005', date '1996-05-18', 'Male',   '077 123 4505', 'kasun.bandara@example.com',    'Peradeniya',  d_sales, g_sales_exec,    b_kandy, sh_general, date '2024-06-01', 'probation', st_general, null,          '0001234505', 'EPF-1005'),
    ('EMP006', 'Tharushi', 'Wickramasinghe',  '199067890106', date '1990-09-09', 'Female', '077 123 4506', 'tharushi.w@example.com',       'Nugegoda',    d_fin,   g_accountant,    b_main,  sh_general, date '2020-03-02', 'permanent', st_exec,    null,          '0001234506', 'EPF-1006'),
    ('EMP007', 'Ruwan',    'Gunawardena',     '198778901207', date '1987-12-25', 'Male',   '077 123 4507', 'ruwan.g@example.com',          'Kotte',       d_hr,    g_hr_officer,    b_main,  sh_general, date '2019-10-21', 'permanent', st_exec,    null,          '0001234507', 'EPF-1007'),
    ('EMP008', 'Ishara',   'Dissanayake',     '199389012308', date '1993-04-11', 'Female', '077 123 4508', 'ishara.d@example.com',         'Kandy',       d_ops,   g_ops_lead,      b_kandy, sh_general, date '2022-11-07', 'permanent', st_exec,    null,          '0001234508', 'EPF-1008'),
    ('EMP009', 'Pradeep',  'Herath',          '198090123409', date '1980-02-03', 'Male',   '077 123 4509', 'pradeep.herath@example.com',   'Battaramulla',d_sales, g_sales_mgr,     b_main,  sh_general, date '2018-05-14', 'permanent', st_mgmt,    null,          '0001234509', 'EPF-1009'),
    -- Joins mid-month: payroll pays them pro rata for the days before joining.
    ('EMP010', 'Sanduni',  'Ekanayake',       '199801234510', date '1998-08-27', 'Female', '077 123 4510', 'sanduni.e@example.com',        'Rajagiriya',  d_fin,   g_accountant,    b_main,  sh_general, m + 9,             'probation', null,       45000,         '0001234510', 'EPF-1010')
  ) as x(emp_no, first_name, last_name, nic, dob, gender, phone, email, address, dep, des, branch, shift, join_date, etype, structure, basic_override, account, epf);

  select array_agg(id order by emp_no) into e from public.employees where company_id = v_company;

  -- ---------- leave requests (days = working days: Sundays and holidays excluded) ----------
  -- EMP003: approved annual (paid) leave, two days around the 20th.
  select min(d)::date into v_start from generate_series(m + 19, m + 26, interval '1 day') d where extract(isodow from d) <> 7 and d::date <> v_holiday;
  v_end := v_start + 1;
  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days, reason, status, decided_at)
  select v_company, e[3], lt_annual, v_start, v_end, count(*), 'Family function', 'approved', now()
  from generate_series(v_start, v_end, interval '1 day') d where extract(isodow from d) <> 7 and d::date <> v_holiday;

  -- EMP007: approved no-pay leave, one day in the first week (deducted in payroll).
  select min(d)::date into v_start from generate_series(m + 5, m + 12, interval '1 day') d where extract(isodow from d) <> 7 and d::date <> v_holiday;
  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days, reason, status, decided_at)
  values (v_company, e[7], lt_nopay, v_start, v_start, 1, 'Personal matter', 'approved', now());

  -- EMP002: rejected casual leave (does not block other requests).
  select min(d)::date into v_start from generate_series(m + 2, m + 9, interval '1 day') d where extract(isodow from d) <> 7 and d::date <> v_holiday;
  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days, reason, status, decided_at)
  values (v_company, e[2], lt_casual, v_start, v_start, 1, 'Short notice', 'rejected', now());

  -- EMP005: pending casual leave next month (shows on the dashboard and leave screen).
  select min(d)::date into v_start from generate_series(m_end + 8, m_end + 15, interval '1 day') d where extract(isodow from d) <> 7;
  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days, reason, status)
  values (v_company, e[5], lt_casual, v_start, v_start, 1, 'Medical appointment', 'pending');

  -- ---------- attendance for every working day of the month ----------
  -- Pattern per employee/day (deterministic): mostly present, some late, some
  -- absent (no-pay), some half days, some overtime; approved leave = On Leave.
  with emps as (
    select id, (row_number() over (order by emp_no))::int as i, join_date, shift_id
    from public.employees where company_id = v_company
  ), days as (
    select d::date as day from generate_series(m, m_end, interval '1 day') d
    where extract(isodow from d) <> 7 and d::date <> v_holiday
  ), grid as (
    select emps.id, emps.shift_id, days.day,
           exists (select 1 from public.leave_requests l
                   where l.employee_id = emps.id and l.status = 'approved' and days.day between l.start_date and l.end_date) as on_leave,
           (emps.i * 7 + extract(day from days.day)::int * 3) % 23 as k
    from emps cross join days
    where days.day >= emps.join_date
  )
  insert into public.attendance (company_id, employee_id, date, in_time, out_time, status, overtime_hours)
  select v_company, g.id, g.day,
         case when x.st in ('absent', 'on_leave') then null
              when x.st = 'late' then sh.start_time + interval '25 minutes'
              else sh.start_time end,
         case when x.st in ('absent', 'on_leave') then null
              when x.st = 'half_day' then sh.start_time + interval '4 hours'
              else sh.end_time + make_interval(hours => x.ot) end,
         x.st::public.attendance_status,
         x.ot
  from grid g
  join public.shifts sh on sh.id = g.shift_id
  cross join lateral (
    select case when g.on_leave then 'on_leave'
                when g.k = 0 then 'absent'
                when g.k = 1 then 'late'
                when g.k = 2 then 'half_day'
                else 'present' end as st,
           case when not g.on_leave and g.k > 2 and g.k % 5 = 0 then 2 else 0 end as ot
  ) x;

  insert into public.activity_log (company_id, type, title, detail) values
    (v_company, 'settings', 'Demo data loaded', format('10 employees and attendance for %s.', to_char(m, 'FMMonth YYYY')));

  -- ---------- give the chosen user access ----------
  select id, company_id into v_profile from public.profiles where email = lower(v_admin_email);
  if found then
    if v_profile.company_id is null then
      update public.profiles set company_id = v_company, role = 'admin' where id = v_profile.id;
      raise notice 'Linked % as Administrator of %.', v_admin_email, v_company_name;
    else
      raise notice '% already belongs to another company and was not linked. Use an account without a company.', v_admin_email;
    end if;
  else
    insert into public.company_invites (company_id, email, role) values (v_company, lower(v_admin_email), 'admin');
    raise notice 'No account for % yet. Register with that email to join % as Administrator.', v_admin_email, v_company_name;
  end if;

  raise notice 'Demo data ready: 10 employees, attendance for % to %. Run payroll for period %.', m, m_end, to_char(m, 'YYYY-MM');
end
$seed$;
