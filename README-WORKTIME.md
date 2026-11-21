# WorkTime SaaS MVP

WorkTime (工时云) is a multi-tenant attendance and payroll SaaS MVP.

## Product principles
- Tenant data isolation is enforced in PostgreSQL with Row Level Security (RLS), not only in the UI.
- Raw clock punches are immutable evidence; payroll calculations are separate derived records.
- Payroll runs snapshot calculation inputs and outputs so later rule edits do not change settled periods.
- Mobile-first employee experience; responsive admin experience.
- The legacy single-user app in `main` is preserved. SaaS work is isolated on `saas-mvp`.

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
