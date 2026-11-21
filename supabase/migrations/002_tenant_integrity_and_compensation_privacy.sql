-- WorkTime migration 002: enforce tenant-consistent relationships and protect compensation privacy.
-- Apply after schema.sql and migration 001. Run against a disposable database first.

-- Composite unique keys let foreign keys prove that related rows belong to the same tenant.
alter table public.departments
  add constraint departments_id_org_uk unique (id, organization_id);
alter table public.employees
  add constraint employees_id_org_uk unique (id, organization_id);
alter table public.shift_templates
  add constraint shift_templates_id_org_uk unique (id, organization_id);
alter table public.payroll_runs
  add constraint payroll_runs_id_org_uk unique (id, organization_id);

-- Prevent an employee from being attached to another organization's department.
alter table public.employees
  add constraint employees_department_same_org_fk
  foreign key (department_id, organization_id)
  references public.departments (id, organization_id)
  on delete set null (department_id);

-- Every employee-related record must reference an employee in the same organization.
alter table public.employee_compensation
  add constraint compensation_employee_same_org_fk
  foreign key (employee_id, organization_id)
  references public.employees (id, organization_id)
  on delete cascade;

alter table public.punches
  add constraint punches_employee_same_org_fk
  foreign key (employee_id, organization_id)
  references public.employees (id, organization_id)
  on delete cascade;

alter table public.attendance_days
  add constraint attendance_employee_same_org_fk
  foreign key (employee_id, organization_id)
  references public.employees (id, organization_id)
  on delete cascade;

alter table public.attendance_days
  add constraint attendance_shift_same_org_fk
  foreign key (shift_template_id, organization_id)
  references public.shift_templates (id, organization_id)
  on delete set null (shift_template_id);

alter table public.approvals
  add constraint approvals_employee_same_org_fk
  foreign key (employee_id, organization_id)
  references public.employees (id, organization_id)
  on delete set null (employee_id);

alter table public.payroll_items
  add constraint payroll_item_employee_same_org_fk
  foreign key (employee_id, organization_id)
  references public.employees (id, organization_id)
  on delete cascade;

alter table public.payroll_items
  add constraint payroll_item_run_same_org_fk
  foreign key (payroll_run_id, organization_id)
  references public.payroll_runs (id, organization_id)
  on delete cascade;

-- Salary data is visible to the employee concerned and payroll-capable administrators,
-- not to managers by default. More granular delegated payroll access can be added explicitly.
drop policy if exists "compensation self or managers read" on public.employee_compensation;
create policy "compensation self or payroll admins read" on public.employee_compensation
for select to authenticated using (
  public.has_org_role(organization_id, array['owner','admin'])
  or exists (
    select 1
    from public.employees e
    where e.id = employee_compensation.employee_id
      and e.organization_id = employee_compensation.organization_id
      and e.user_id = auth.uid()
  )
);

-- The composite constraints above are intentionally validated immediately. If historical
-- rows violate tenant ownership, this migration must fail rather than silently accept them.
