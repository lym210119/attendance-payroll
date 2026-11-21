-- WorkTime SaaS MVP schema
-- Apply in a fresh Supabase project. Review and test RLS before production.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  timezone text not null default 'Asia/Shanghai',
  currency char(3) not null default 'CNY',
  status text not null default 'trial' check (status in ('trial','active','past_due','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','employee')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id, organization_id);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_code text,
  full_name text not null,
  department_id uuid references public.departments(id) on delete set null,
  pay_type text not null default 'monthly' check (pay_type in ('monthly','hourly','daily')),
  hire_date date,
  employment_status text not null default 'active' check (employment_status in ('active','inactive','terminated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_code)
);

create table if not exists public.employee_compensation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  pay_type text not null check (pay_type in ('monthly','hourly','daily')),
  base_pay numeric(12,2) not null default 0 check (base_pay >= 0),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  paid_hours numeric(6,2) not null default 8 check (paid_hours >= 0),
  overtime_requires_approval boolean not null default true,
  early_arrival_paid boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.punches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  punch_type text not null check (punch_type in ('in','out')),
  punched_at timestamptz not null,
  source text not null default 'mobile' check (source in ('mobile','web','admin','import')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists punches_org_employee_time_idx on public.punches(organization_id, employee_id, punched_at);

create table if not exists public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  raw_minutes integer not null default 0,
  break_minutes integer not null default 0,
  payable_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  status text not null default 'pending' check (status in ('pending','normal','late','early_leave','missing_punch','absent','leave','review')),
  calculation_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, work_date)
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  request_type text not null check (request_type in ('correction','leave','overtime','pay_adjustment')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  submitted_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','review','approved','settled','void')),
  currency char(3) not null default 'CNY',
  calculation_version text not null default 'v1',
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  input_snapshot jsonb not null default '{}'::jsonb,
  earnings jsonb not null default '{}'::jsonb,
  deductions jsonb not null default '{}'::jsonb,
  gross_pay numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  monthly_price numeric(12,2) not null default 0,
  max_employees integer not null default 5,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null default 'trial' check (status in ('trial','active','past_due','cancelled','expired')),
  trial_ends_at timestamptz,
  current_period_start date,
  current_period_end date,
  created_at timestamptz not null default now()
);

-- Tenant membership helpers. SECURITY DEFINER avoids RLS recursion on membership checks.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.employee_compensation enable row level security;
alter table public.shift_templates enable row level security;
alter table public.punches enable row level security;
alter table public.attendance_days enable row level security;
alter table public.approvals enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.audit_logs enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.organization_subscriptions enable row level security;

-- Membership is readable by the user themselves and organization admins.
create policy "members read own org memberships" on public.organization_members
for select to authenticated using (user_id = auth.uid() or public.has_org_role(organization_id, array['owner','admin']));

create policy "organizations read by members" on public.organizations
for select to authenticated using (public.is_org_member(id));

create policy "organizations update by admins" on public.organizations
for update to authenticated using (public.has_org_role(id, array['owner','admin'])) with check (public.has_org_role(id, array['owner','admin']));

create policy "departments org members read" on public.departments
for select to authenticated using (public.is_org_member(organization_id));
create policy "departments admins manage" on public.departments
for all to authenticated using (public.has_org_role(organization_id, array['owner','admin'])) with check (public.has_org_role(organization_id, array['owner','admin']));

create policy "employees self or managers read" on public.employees
for select to authenticated using (
  public.is_org_member(organization_id)
  and (user_id = auth.uid() or public.has_org_role(organization_id, array['owner','admin','manager']))
);
create policy "employees admins manage" on public.employees
for all to authenticated using (public.has_org_role(organization_id, array['owner','admin','manager'])) with check (public.has_org_role(organization_id, array['owner','admin','manager']));

create policy "compensation self or managers read" on public.employee_compensation
for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
  or exists (select 1 from public.employees e where e.id = employee_compensation.employee_id and e.user_id = auth.uid() and e.organization_id = employee_compensation.organization_id)
);
create policy "compensation admins manage" on public.employee_compensation
for all to authenticated using (public.has_org_role(organization_id, array['owner','admin'])) with check (public.has_org_role(organization_id, array['owner','admin']));

create policy "shift templates org members read" on public.shift_templates
for select to authenticated using (public.is_org_member(organization_id));
create policy "shift templates admins manage" on public.shift_templates
for all to authenticated using (public.has_org_role(organization_id, array['owner','admin','manager'])) with check (public.has_org_role(organization_id, array['owner','admin','manager']));

create policy "punches self or managers read" on public.punches
for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
  or exists (select 1 from public.employees e where e.id = punches.employee_id and e.user_id = auth.uid() and e.organization_id = punches.organization_id)
);
create policy "punches employees insert own" on public.punches
for insert to authenticated with check (
  public.is_org_member(organization_id)
  and exists (select 1 from public.employees e where e.id = employee_id and e.organization_id = organization_id and e.user_id = auth.uid())
);
create policy "punches admins insert" on public.punches
for insert to authenticated with check (public.has_org_role(organization_id, array['owner','admin','manager']));
-- No update/delete policy for punches: raw punches are append-only for authenticated users.

create policy "attendance self or managers read" on public.attendance_days
for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
  or exists (select 1 from public.employees e where e.id = attendance_days.employee_id and e.user_id = auth.uid() and e.organization_id = attendance_days.organization_id)
);
create policy "attendance admins manage" on public.attendance_days
for all to authenticated using (public.has_org_role(organization_id, array['owner','admin','manager'])) with check (public.has_org_role(organization_id, array['owner','admin','manager']));

create policy "approvals org members read" on public.approvals
for select to authenticated using (public.is_org_member(organization_id));
create policy "approvals members submit" on public.approvals
for insert to authenticated with check (public.is_org_member(organization_id) and submitted_by = auth.uid());
create policy "approvals admins review" on public.approvals
for update to authenticated using (public.has_org_role(organization_id, array['owner','admin','manager'])) with check (public.has_org_role(organization_id, array['owner','admin','manager']));

create policy "payroll runs admins or employees read" on public.payroll_runs
for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
  or exists (select 1 from public.payroll_items pi join public.employees e on e.id = pi.employee_id where pi.payroll_run_id = public.payroll_runs.id and e.user_id = auth.uid() and e.organization_id = public.payroll_runs.organization_id)
);
create policy "payroll runs admins manage" on public.payroll_runs
for all to authenticated using (public.has_org_role(organization_id, array['owner','admin'])) with check (public.has_org_role(organization_id, array['owner','admin']));
create policy "payroll items self or managers read" on public.payroll_items
for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
  or exists (select 1 from public.employees e where e.id = payroll_items.employee_id and e.user_id = auth.uid() and e.organization_id = payroll_items.organization_id));
create policy "payroll items admins manage" on public.payroll_items
for all to authenticated using (public.has_org_role(organization_id, array['owner','admin'])) with check (public.has_org_role(organization_id, array['owner','admin']));

create policy "audit logs admins read" on public.audit_logs
for select to authenticated using (public.has_org_role(organization_id, array['owner','admin']));
create policy "audit logs admins insert" on public.audit_logs
for insert to authenticated with check (public.has_org_role(organization_id, array['owner','admin']));

create policy "plans read active" on public.subscription_plans
for select to authenticated using (active);
create policy "subscriptions members read" on public.organization_subscriptions
for select to authenticated using (public.is_org_member(organization_id));

-- Do not grant broad writes on organization creation or membership. Implement onboarding
-- through a server-side transaction/function with explicit validation in a later milestone.
-- Atomic first-time organization onboarding. The caller cannot choose owner or status.
create or replace function public.create_organization(p_name text, p_slug text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slug text;
  v_org_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 80 then
    raise exception 'Organization name must be between 2 and 80 characters';
  end if;

  if p_slug is null or trim(p_slug) = '' then
    v_slug := 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  else
    v_slug := lower(trim(p_slug));
    if length(v_slug) < 3 or length(v_slug) > 40 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Slug must be 3-40 lowercase letters, numbers, or hyphen-separated segments';
    end if;
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_name), v_slug)
  returning id into v_org_id;


  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, v_user, 'owner', 'active');


  insert into public.organization_subscriptions (organization_id, status, trial_ends_at)
  values (v_org_id, 'trial', now() + interval '14 days');

  return v_org_id;
end;
$$;


revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;
