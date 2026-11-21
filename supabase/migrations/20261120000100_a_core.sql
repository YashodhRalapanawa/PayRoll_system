-- =============================================================================
-- A2 · Core platform: tenancy, profiles, roles, organization, activity log
-- Owner: Developer A
-- Tables: companies, profiles, company_invites, branches, departments,
--         designations, activity_log
-- Also: RLS helpers (private schema), auth sign-up hook, onboarding RPC,
--       storage buckets for logos and employee documents.
--
-- Tenancy rule: every tenant table has company_id, defaulting to the caller's
-- company, and every policy checks company_id = private.current_company_id().
-- Child rows reference parents through (company_id, id) composite keys, so a
-- row can never point at another company's data even with a guessed UUID.
-- =============================================================================

-- ---------- Private schema (not exposed through the Data API) ----------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------- Enums -------------------------------------------------------------
create type public.app_role as enum ('admin', 'hr_manager', 'viewer');
create type public.record_status as enum ('active', 'inactive');
create type public.activity_type as enum ('employee', 'leave', 'payroll', 'shift', 'attendance', 'settings');

-- ---------- Shared trigger: keep updated_at current ---------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- companies ---------------------------------------------------------
create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  email           text not null default '',
  phone           text not null default '',
  address         text not null default '',
  logo_path       text,                         -- storage: company-logos/{company_id}/...
  country         text not null default 'Sri Lanka',
  currency_code   text not null default 'LKR',
  currency_symbol text not null default 'Rs.',
  currency_name   text not null default 'Sri Lankan Rupee',
  setup_complete  boolean not null default false,
  created_by      uuid,                         -- auth.users.id (audit only, no FK)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger companies_updated_at before update on public.companies
  for each row execute function private.set_updated_at();

-- ---------- profiles (one per auth user) --------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  company_id  uuid references public.companies (id) on delete set null,  -- null until onboarding / invite
  full_name   text not null default '',
  email       text not null,
  role        public.app_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_company_id_idx on public.profiles (company_id);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------- RLS helpers --------------------------------------------------------
-- SECURITY DEFINER so they can read profiles without recursing into its RLS.
create function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and company_id is not null and role = 'admin'
  );
$$;

-- Admin or HR manager.
create function private.is_hr()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and company_id is not null and role in ('admin', 'hr_manager')
  );
$$;

revoke all on function private.current_company_id() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_hr() from public;
grant execute on function private.current_company_id() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.is_hr() to authenticated, service_role;

-- Standard tenant policy set, shared by A and B migrations:
--   select: any member of the company
--   insert/update/delete: members for whom private.<writer>() is true
create function private.apply_tenant_rls(p_table text, p_writer text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format(
    'create policy %I on public.%I for select to authenticated
       using (company_id = (select private.current_company_id()))',
    p_table || '_select', p_table);
  execute format(
    'create policy %I on public.%I for insert to authenticated
       with check (company_id = (select private.current_company_id()) and (select private.%I()))',
    p_table || '_insert', p_table, p_writer);
  execute format(
    'create policy %I on public.%I for update to authenticated
       using (company_id = (select private.current_company_id()) and (select private.%I()))
       with check (company_id = (select private.current_company_id()))',
    p_table || '_update', p_table, p_writer);
  execute format(
    'create policy %I on public.%I for delete to authenticated
       using (company_id = (select private.current_company_id()) and (select private.%I()))',
    p_table || '_delete', p_table, p_writer);
end;
$$;
revoke all on function private.apply_tenant_rls(text, text) from public;

-- ---------- company_invites (admin adds users to the company) -----------------
-- A user who signs up with an invited email joins that company with that role.
create table public.company_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  email       text not null check (email = lower(email) and email like '%@%'),
  role        public.app_role not null default 'viewer',
  invited_by  uuid default auth.uid(),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (company_id, email)
);
create index company_invites_email_idx on public.company_invites (email) where accepted_at is null;

-- ---------- Organization -------------------------------------------------------
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  code        text not null check (length(trim(code)) > 0),
  address     text not null default '',
  contact     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, code)
);
create trigger branches_updated_at before update on public.branches
  for each row execute function private.set_updated_at();

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);
create trigger departments_updated_at before update on public.departments
  for each row execute function private.set_updated_at();

create table public.designations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  department_id uuid,  -- null = usable in any department
  name          text not null check (length(trim(name)) > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name),
  foreign key (company_id, department_id)
    references public.departments (company_id, id) on delete set null (department_id)
);
create index designations_department_idx on public.designations (company_id, department_id);
create trigger designations_updated_at before update on public.designations
  for each row execute function private.set_updated_at();

-- ---------- activity_log -------------------------------------------------------
create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default private.current_company_id() references public.companies (id) on delete cascade,
  type        public.activity_type not null,
  title       text not null,
  detail      text not null default '',
  actor_id    uuid default auth.uid(),   -- auth.users.id (audit only, no FK)
  created_at  timestamptz not null default now()
);
create index activity_log_company_created_idx on public.activity_log (company_id, created_at desc);

-- logActivity() on the server can call this or insert directly.
create function public.log_activity(p_type public.activity_type, p_title text, p_detail text default '')
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.activity_log (type, title, detail) values (p_type, p_title, coalesce(p_detail, ''));
$$;
revoke all on function public.log_activity(public.activity_type, text, text) from public, anon;
grant execute on function public.log_activity(public.activity_type, text, text) to authenticated;

-- ---------- Auth hook: create a profile for every new user ---------------------
-- Keep "Confirm email" enabled in Supabase Auth so invites cannot be claimed by
-- someone signing up with another person's address.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.company_invites;
begin
  select * into inv
  from public.company_invites
  where email = lower(new.email) and accepted_at is null
  order by created_at desc
  limit 1;

  insert into public.profiles (id, email, full_name, company_id, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    inv.company_id,
    coalesce(inv.role, 'viewer')
  );

  if inv.id is not null then
    update public.company_invites set accepted_at = now() where id = inv.id;
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Profile guard: users cannot escalate their own role/company --------
-- SECURITY INVOKER on purpose: current_user is 'authenticated' for API calls and
-- the function owner inside trusted SECURITY DEFINER RPCs (e.g. create_company).
create function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id <> old.id or new.email <> old.email or new.created_at <> old.created_at then
    raise exception 'These profile fields cannot be changed' using errcode = '42501';
  end if;

  if new.role is distinct from old.role or new.company_id is distinct from old.company_id then
    if old.id = auth.uid() then
      raise exception 'You cannot change your own role or company' using errcode = '42501';
    end if;
    if not private.is_admin() or old.company_id is distinct from private.current_company_id() then
      raise exception 'Only an administrator of this company can change roles' using errcode = '42501';
    end if;
    if new.company_id is distinct from old.company_id and new.company_id is not null then
      raise exception 'Users can be removed from a company but not moved to another' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------- Onboarding RPC (POST /api/onboarding calls this) -------------------
-- Creates the company, makes the caller its admin and creates the first branch,
-- in one transaction. Upload the logo afterwards to company-logos/{id}/ and set
-- companies.logo_path. Payroll settings and leave types are seeded by a trigger
-- in the B migration.
create function public.create_company(
  p_name            text,
  p_email           text,
  p_phone           text,
  p_address         text,
  p_country         text,
  p_currency_code   text,
  p_currency_symbol text,
  p_currency_name   text,
  p_branch_name     text,
  p_branch_code     text,
  p_branch_address  text,
  p_branch_contact  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if (select company_id from public.profiles where id = v_uid) is not null then
    raise exception 'You already belong to a company' using errcode = 'P0001';
  end if;

  insert into public.companies (
    name, email, phone, address, country, currency_code, currency_symbol, currency_name,
    setup_complete, created_by
  ) values (
    trim(p_name), trim(p_email), trim(p_phone), trim(p_address), p_country,
    p_currency_code, p_currency_symbol, p_currency_name, true, v_uid
  )
  returning id into v_company;

  update public.profiles set company_id = v_company, role = 'admin' where id = v_uid;

  insert into public.branches (company_id, name, code, address, contact)
  values (v_company, trim(p_branch_name), trim(p_branch_code), trim(p_branch_address), trim(p_branch_contact));

  insert into public.activity_log (company_id, type, title, detail, actor_id)
  values (v_company, 'settings', 'Company setup completed', trim(p_name) || ' is ready to use.', v_uid);

  return v_company;
end;
$$;
revoke all on function public.create_company(text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------- RLS ----------------------------------------------------------------
alter table public.companies enable row level security;
create policy companies_select on public.companies for select to authenticated
  using (id = (select private.current_company_id()));
create policy companies_update on public.companies for update to authenticated
  using (id = (select private.current_company_id()) and (select private.is_admin()))
  with check (id = (select private.current_company_id()));
-- No insert/delete from the API: companies are created by create_company().

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or company_id = (select private.current_company_id()));
create policy profiles_update on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    or (company_id = (select private.current_company_id()) and (select private.is_admin()))
  );
-- No insert/delete from the API: profiles come from the auth hook.

alter table public.company_invites enable row level security;
create policy company_invites_admin on public.company_invites for all to authenticated
  using (company_id = (select private.current_company_id()) and (select private.is_admin()))
  with check (company_id = (select private.current_company_id()) and (select private.is_admin()));

select private.apply_tenant_rls('branches', 'is_hr');
select private.apply_tenant_rls('departments', 'is_hr');
select private.apply_tenant_rls('designations', 'is_hr');

alter table public.activity_log enable row level security;
create policy activity_log_select on public.activity_log for select to authenticated
  using (company_id = (select private.current_company_id()));
create policy activity_log_insert on public.activity_log for insert to authenticated
  with check (company_id = (select private.current_company_id()) and actor_id = (select auth.uid()));
-- Append-only: no update/delete policies.

-- ---------- Storage ------------------------------------------------------------
-- Object paths start with the company id: {company_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('company-logos', 'company-logos', true, 2097152, array['image/png', 'image/jpeg']),
  ('employee-documents', 'employee-documents', false, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "company-logos: members read" on storage.objects for select to authenticated
  using (bucket_id = 'company-logos'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text);
create policy "company-logos: admins insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and (select private.is_admin()));
create policy "company-logos: admins update" on storage.objects for update to authenticated
  using (bucket_id = 'company-logos'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and (select private.is_admin()));
create policy "company-logos: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and (select private.is_admin()));

create policy "employee-documents: members read" on storage.objects for select to authenticated
  using (bucket_id = 'employee-documents'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text);
create policy "employee-documents: hr insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-documents'
              and (storage.foldername(name))[1] = (select private.current_company_id())::text
              and (select private.is_hr()));
create policy "employee-documents: hr update" on storage.objects for update to authenticated
  using (bucket_id = 'employee-documents'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and (select private.is_hr()));
create policy "employee-documents: hr delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-documents'
         and (storage.foldername(name))[1] = (select private.current_company_id())::text
         and (select private.is_hr()));
