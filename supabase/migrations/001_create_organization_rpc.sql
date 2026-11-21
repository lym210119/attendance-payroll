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
