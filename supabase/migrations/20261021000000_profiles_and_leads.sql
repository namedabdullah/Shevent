-- Phase 1 web schema (WEB_APP_PLAN §6): user roles and the leads table behind the waitlist and
-- vendor-join forms. The rest of the app schema (vendors, plans, inquiries…) comes in Phase 2.

-- Helpers used by RLS policies live in a schema that the Data API does not expose.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user. `role` decides which app area a user sees.
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('host', 'vendor', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'host',
  created_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'Never set from client input. Becoming a vendor or admin goes through a server-side path.';

alter table public.profiles enable row level security;

-- Users can read their own profile and nothing else. No insert/update/delete grants: rows are
-- created by the trigger below, and roles change only through the service role.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The role is not read from user metadata, which the user controls at sign-up.
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Leads: waitlist and vendor-join sign-ups with UTM attribution.
-- Contains personal data: anyone can insert, only admins can read.
-- ---------------------------------------------------------------------------

create type public.lead_type as enum ('waitlist', 'vendor_join');
create type public.service_category as enum ('venue', 'catering', 'decor', 'dj_sound', 'lighting');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  type public.lead_type not null,
  name text check (char_length(name) <= 100),
  contact text not null check (char_length(contact) between 5 and 200),
  category public.service_category,
  area text check (char_length(area) <= 50),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  referrer text check (char_length(referrer) <= 500),
  landing_path text check (char_length(landing_path) <= 300),
  created_at timestamptz not null default now(),
  constraint vendor_join_has_name_and_category
    check (type <> 'vendor_join' or (name is not null and category is not null))
);

create index leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

-- Column-level grants: clients can't set id or created_at, and anon can't read anything back.
revoke all on public.leads from anon, authenticated;
grant insert (type, name, contact, category, area, utm_source, utm_medium, utm_campaign, referrer, landing_path)
  on public.leads to anon, authenticated;
grant select on public.leads to authenticated;

create policy "Anyone can add a lead"
  on public.leads for insert to anon, authenticated
  with check (true);

create policy "Admins read leads"
  on public.leads for select to authenticated
  using ((select private.is_admin()));
