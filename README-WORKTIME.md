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
