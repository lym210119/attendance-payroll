# WorkTime SaaS MVP

WorkTime (工时云) is a multi-tenant attendance and payroll SaaS MVP.

## Product principles
- Tenant data isolation is enforced in PostgreSQL with Row Level Security (RLS), not only in the UI.
- Raw clock punches are immutable evidence; payroll calculations are separate derived records.
- Payroll runs snapshot calculation inputs and outputs so later rule edits do not change settled periods.
- Mobile-first employee experience; responsive admin experience.
- WorkTime is an independent SaaS product. The legacy app is not a compatibility constraint; its branch and production site are left untouched unless explicitly authorized.

## MVP milestones
1. Database and tenant security foundation
2. Auth, organization onboarding, memberships and roles
3. Employee directory and shift templates
4. Clock-in/out and attendance summaries
5. Payroll calculation, review, locking and payslips
6. Approval workflow, exports, tests and deployment

## Stack
- React + TypeScript + Vite
- Supabase Auth + PostgreSQL + RLS
- Cloudflare Pages deployment
- PWA (planned)

## Initial schema
Apply `supabase/schema.sql` in a new Supabase project. Review the RLS policies and test cross-tenant isolation before storing real employee or payroll data.

This MVP is not a payroll compliance product. Local labor, tax, privacy, and retention rules must be validated before commercial release.


## Organization onboarding RPC

The initial onboarding step is implemented as an atomic PostgreSQL function:

- `public.create_organization(p_name, p_slug)` requires an authenticated Supabase user.
- The caller is assigned the `owner` role; callers cannot choose a role or subscription state.
- It creates the organization, owner membership, and a 14-day trial subscription in one transaction.
- A blank slug is replaced by a generated slug. A provided slug is validated and normalized to lowercase.
- The function is granted to `authenticated` only; direct organization/member creation remains unavailable through client RLS policies.

For an existing fresh project, apply `supabase/migrations/001_create_organization_rpc.sql`. For a fresh setup, the function is also included at the end of `supabase/schema.sql`.

Example client call (after Supabase Auth sign-in):

```ts
const { data: organizationId, error } = await supabase.rpc('create_organization', {
  p_name: 'My Company',
  p_slug: 'my-company', // optional; use null to generate
});
```


Before real usage, validate with two authenticated test users: ensure the first caller becomes owner, the second user's membership cannot be forged, unauthenticated calls fail, and duplicate slugs return a safe error. This RPC has not yet been executed against a live Supabase database.


## Tenant integrity migration

Apply `supabase/migrations/002_tenant_integrity_and_compensation_privacy.sql` after the base schema and migration 001. It adds composite foreign keys so employee, department, shift, attendance, compensation, approval, and payroll relationships cannot cross organization boundaries even if an application request supplies mismatched IDs. It also narrows compensation reads to the employee concerned and Owner/Admin roles; managers do not receive salary visibility by default.

The migration validates constraints immediately. If it fails, inspect existing rows in a disposable database and resolve tenant mismatches before retrying. It has been committed but not executed against a live or local PostgreSQL instance in this development run.


## Payroll calculation core (initial domain slice)

The pure function `worktime/src/domain/payroll-engine.ts` calculates gross/net pay from explicit employee, attendance, and policy inputs. Amounts use integer minor currency units (for CNY, fen) and minutes; intermediate multiplication uses `BigInt` and amounts are rounded half-up to a minor unit. The output records the rule version and separates regular pay, overtime premium, deductions, and unpaid requested overtime.

Current model assumptions (not a legal interpretation):
- Monthly pay is prorated from the configured standard-period minutes; hourly pay uses a per-hour rate; daily pay uses payable days.
- Overtime is paid at base rate plus a configurable premium. The default is not embedded; a policy must supply its multiplier in basis points (for example, 15000 means 1.5x total).
- When approval is required, only approved overtime minutes are paid. When disabled, submitted overtime minutes are paid. Approval must never exceed the submitted amount.
- Attendance minutes are inputs already net of unpaid breaks. The attendance engine must calculate these from scheduled shifts, punches, breaks, time zone, and correction approvals.
- Tax, statutory insurance, holiday rules, leave treatment, jurisdiction-specific rates, and complex allowances/deductions are intentionally outside this first calculation slice and must be implemented as separately versioned policies before production use.

Unit tests are in `worktime/src/domain/payroll-engine.test.ts`; run with `npm test` after installing dependencies. The package uses Vitest. This commit does not claim a local build/test run or legal payroll compliance.

## Attendance calculation core (initial domain slice)

The pure function `worktime/src/domain/attendance-engine.ts` converts a single scheduled shift and immutable punch evidence into payable-minute components. All timestamps must be ISO strings with an explicit UTC offset or `Z`; the engine compares absolute instants, so overnight shifts do not depend on the machine's local timezone.

- Early arrival before the scheduled start is not counted as regular paid time.
- Work after the scheduled end is reported separately as requested overtime; policy can require explicit approval before it becomes payable.
- A full shift deducts the configured fixed unpaid break duration. A partial shift deducts only the overlap of recorded break intervals with attended work inside the scheduled window; breaks during overtime cannot reduce regular payable minutes. Break records are merged to prevent double deductions. Shift-threshold and grace-minute policy values are validated as non-negative/positive integers.
- Missing punches are surfaced as explicit statuses; they are not silently fabricated.
- Grace periods affect late/early status only and do not add paid minutes.
- Punch evidence IDs are required. Corrections must be represented by separately approved evidence upstream; this pure function does not mutate original punches.

This is an initial single-shift engine, not yet a complete scheduling or legal-compliance system. It does not yet resolve local wall-clock times from an IANA timezone, model split shifts, holidays, leave, overnight DST transitions from local schedule definitions, or approved correction workflows. Those require explicit policy and persistence layers before production payroll use. Tests cover overnight shifts, early arrival exclusion, partial-shift break deduction, overtime approval, timezone-explicit timestamps, and missing clock-out.

