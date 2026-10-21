-- Phase 2 app schema (README §7.3, WEB_APP_PLAN §4 and §6): vendors, portfolios, plans, the
-- inquiry → quote → booking flow, reviews, feedback and sponsored placements. Shared by web and
-- mobile, so every rule lives here in RLS rather than in either client.
--
-- Conventions: clients get column-level grants only, so columns such as owner ids, `verified` and
-- `status` can't be forged. Multi-step changes (booking a quote, sharing a plan) go through
-- security-definer functions that check the caller themselves.

-- ---------------------------------------------------------------------------
-- Vocabularies (mirror data/reference/*.csv and packages/core/enums)
-- ---------------------------------------------------------------------------

create type public.lahore_area as enum (
  'Gulberg', 'DHA', 'Johar Town', 'Cantt', 'Model Town', 'Raiwind Road', 'Bahria Town', 'Wapda Town',
  'Garden Town', 'Faisal Town', 'Allama Iqbal Town', 'Township', 'Lake City', 'Valencia', 'Shadman', 'Other'
);
create type public.event_type as enum (
  'wedding_mehndi', 'wedding_baraat', 'wedding_walima', 'engagement', 'birthday', 'corporate_dinner',
  'corporate_other', 'university_gala', 'concert', 'private_party'
);
create type public.venue_type as enum ('marquee', 'banquet', 'farmhouse', 'rooftop', 'lawn', 'hotel', 'other');
create type public.price_tier as enum ('budget', 'mid', 'premium');
create type public.price_unit as enum ('per_head', 'per_event', 'per_hour', 'per_package', 'per_slot', 'per_setup');
create type public.inquiry_status as enum ('open', 'quoted', 'booked', 'declined', 'closed');
create type public.booking_status as enum ('confirmed', 'cancelled', 'completed');
create type public.media_status as enum ('pending', 'approved', 'flagged');
create type public.review_source as enum ('booking', 'imported');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  -- One listing per vendor account. Null for seeded vendors that haven't claimed their listing.
  owner_id uuid unique references auth.users (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 2 and 120),
  category public.service_category not null,
  sub_type text check (char_length(sub_type) <= 40),
  base_area public.lahore_area not null,
  areas_served public.lahore_area[] not null default '{}',
  capacity_min int check (capacity_min > 0),
  capacity_max int check (capacity_max > 0),
  price_tier public.price_tier,
  event_types public.event_type[] not null default '{}',
  description text check (char_length(description) <= 2000),
  inclusions text[] not null default '{}' check (cardinality(inclusions) <= 50),
  years_active int check (years_active between 0 and 100),
  verified boolean not null default false,
  -- The vendor agreed to an indexable public profile (consent gate, WEB_APP_PLAN §6).
  public_consent boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capacity_min is null or capacity_max is null or capacity_min <= capacity_max)
);

comment on table public.vendors is 'Public listing data only: never store phone numbers or personal names here.';

create index vendors_category_area_idx on public.vendors (category, base_area);

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function private.set_updated_at();

create function private.owns_vendor(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.vendors where id = target and owner_id = (select auth.uid()));
$$;

create function private.is_vendor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'vendor');
$$;

alter table public.vendors enable row level security;

revoke all on public.vendors from anon, authenticated;
grant select on public.vendors to anon, authenticated;
grant insert (owner_id, slug, name, category, sub_type, base_area, areas_served, capacity_min, capacity_max,
              price_tier, event_types, description, inclusions, years_active, public_consent)
  on public.vendors to authenticated;
grant update (slug, name, sub_type, base_area, areas_served, capacity_min, capacity_max, price_tier,
              event_types, description, inclusions, years_active, public_consent)
  on public.vendors to authenticated;

create policy "Vendors are public"
  on public.vendors for select to anon, authenticated
  using (true);

create policy "Vendor accounts create their own listing"
  on public.vendors for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_vendor()));

create policy "Owners edit their listing"
  on public.vendors for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- A signed-in host turns their account into a vendor account (vendor onboarding).
create function public.become_vendor()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set role = 'vendor' where id = (select auth.uid()) and role = 'host';
$$;

revoke execute on function public.become_vendor() from public, anon;
grant execute on function public.become_vendor() to authenticated;

-- ---------------------------------------------------------------------------
-- Portfolio media (#7). Photos stay hidden until the duplicate check approves them; status,
-- phash and duplicate fields are written server-side only.
-- ---------------------------------------------------------------------------

create table public.portfolio_media (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  phash text check (char_length(phash) <= 64),
  duplicate_status text check (duplicate_status in ('unique', 'possible_duplicate', 'duplicate')),
  status public.media_status not null default 'pending',
  model_version text,
  created_at timestamptz not null default now()
);

create index portfolio_media_vendor_idx on public.portfolio_media (vendor_id);

alter table public.portfolio_media enable row level security;

revoke all on public.portfolio_media from anon, authenticated;
grant select on public.portfolio_media to anon, authenticated;
grant insert (vendor_id, storage_path, tags) on public.portfolio_media to authenticated;
grant update (tags) on public.portfolio_media to authenticated;
grant delete on public.portfolio_media to authenticated;

create policy "Approved photos are public; owners see all of theirs"
  on public.portfolio_media for select to anon, authenticated
  using (status = 'approved' or (select private.owns_vendor(vendor_id)));

create policy "Owners add photos"
  on public.portfolio_media for insert to authenticated
  with check ((select private.owns_vendor(vendor_id)));

create policy "Owners edit tags"
  on public.portfolio_media for update to authenticated
  using ((select private.owns_vendor(vendor_id)))
  with check ((select private.owns_vendor(vendor_id)));

create policy "Owners remove photos"
  on public.portfolio_media for delete to authenticated
  using ((select private.owns_vendor(vendor_id)));

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_type public.event_type not null,
  guest_count int not null check (guest_count between 10 and 5000),
  area public.lahore_area not null,
  venue_type public.venue_type,
  event_date date not null,
  total_budget_pkr bigint not null check (total_budget_pkr between 10000 and 500000000),
  preferences text[] not null default '{}' check (cardinality(preferences) <= 10),
  -- Last /v1/estimate response, including its model_version.
  estimate jsonb check (estimate is null or jsonb_typeof(estimate) = 'object'),
  share_id text unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_public or share_id is not null)
);

create index plans_owner_idx on public.plans (owner_id, created_at desc);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function private.set_updated_at();

alter table public.plans enable row level security;

revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;
grant insert (event_type, guest_count, area, venue_type, event_date, total_budget_pkr, preferences, estimate)
  on public.plans to authenticated;
grant update (event_type, guest_count, area, venue_type, event_date, total_budget_pkr, preferences, estimate, is_public)
  on public.plans to authenticated;
grant delete on public.plans to authenticated;

create policy "Hosts manage their own plans"
  on public.plans for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Shared plans (/p/[shareId]) are read by token only, so public plans can't be listed.
create function public.share_plan(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  update public.plans
    set share_id = coalesce(share_id, replace(gen_random_uuid()::text, '-', '')),
        is_public = true
    where id = target and owner_id = (select auth.uid())
    returning share_id into token;
  if token is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  return token;
end;
$$;

create function public.get_shared_plan(token text)
returns table (
  event_type public.event_type,
  guest_count int,
  area public.lahore_area,
  venue_type public.venue_type,
  event_date date,
  total_budget_pkr bigint,
  estimate jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.event_type, p.guest_count, p.area, p.venue_type, p.event_date, p.total_budget_pkr, p.estimate
  from public.plans p
  where p.share_id = token and p.is_public;
$$;

revoke execute on function public.share_plan(uuid) from public, anon;
grant execute on function public.share_plan(uuid) to authenticated;
grant execute on function public.get_shared_plan(text) to anon, authenticated;

create table public.plan_feedback (
  plan_id uuid primary key references public.plans (id) on delete cascade,
  actual_spend_pkr jsonb not null check (jsonb_typeof(actual_spend_pkr) = 'object'),
  guest_count_actual int check (guest_count_actual between 1 and 10000),
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

alter table public.plan_feedback enable row level security;

revoke all on public.plan_feedback from anon, authenticated;
grant select, insert, update on public.plan_feedback to authenticated;

create policy "Hosts give feedback on their own plans"
  on public.plan_feedback for all to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Inquiries, messages, quotes and bookings
-- ---------------------------------------------------------------------------

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  host_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status public.inquiry_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, vendor_id)
);

create index inquiries_vendor_idx on public.inquiries (vendor_id, updated_at desc);
create index inquiries_host_idx on public.inquiries (host_id, updated_at desc);

create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function private.set_updated_at();

create function private.is_inquiry_participant(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.inquiries i join public.vendors v on v.id = i.vendor_id
    where i.id = target and (i.host_id = (select auth.uid()) or v.owner_id = (select auth.uid()))
  );
$$;

alter table public.inquiries enable row level security;

revoke all on public.inquiries from anon, authenticated;
grant select on public.inquiries to authenticated;
grant insert (plan_id, vendor_id) on public.inquiries to authenticated;
grant update (status) on public.inquiries to authenticated;

create policy "Participants see their inquiries"
  on public.inquiries for select to authenticated
  using (host_id = (select auth.uid()) or (select private.owns_vendor(vendor_id)));

create policy "Hosts send inquiries from their own plans"
  on public.inquiries for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and exists (select 1 from public.plans p where p.id = plan_id and p.owner_id = (select auth.uid()))
  );

-- Direct status changes are limited to the host closing or the vendor declining. "quoted" and
-- "booked" are set by the quote trigger and book_quote().
create policy "Hosts close, vendors decline"
  on public.inquiries for update to authenticated
  using (
    status in ('open', 'quoted')
    and (host_id = (select auth.uid()) or (select private.owns_vendor(vendor_id)))
  )
  with check (
    (status = 'closed' and host_id = (select auth.uid()))
    or (status = 'declined' and (select private.owns_vendor(vendor_id)))
  );

create table public.messages (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_inquiry_idx on public.messages (inquiry_id, created_at);

alter table public.messages enable row level security;

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (inquiry_id, body) on public.messages to authenticated;

create policy "Participants read the chat"
  on public.messages for select to authenticated
  using ((select private.is_inquiry_participant(inquiry_id)));

create policy "Participants write as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select private.is_inquiry_participant(inquiry_id)));

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  -- Price in `unit` (what #5 checks) and the total the host would pay.
  amount_pkr bigint not null check (amount_pkr between 1 and 500000000),
  unit public.price_unit not null,
  hours numeric(4, 1) check (hours > 0 and hours <= 24),
  total_pkr bigint not null check (total_pkr between 1 and 500000000),
  inclusions text[] not null default '{}' check (cardinality(inclusions) <= 50),
  exclusions text[] not null default '{}' check (cardinality(exclusions) <= 50),
  notes text check (char_length(notes) <= 2000),
  valid_until date,
  created_at timestamptz not null default now()
);

create index quotes_inquiry_idx on public.quotes (inquiry_id, created_at desc);

alter table public.quotes enable row level security;

revoke all on public.quotes from anon, authenticated;
grant select on public.quotes to authenticated;
grant insert (inquiry_id, amount_pkr, unit, hours, total_pkr, inclusions, exclusions, notes, valid_until)
  on public.quotes to authenticated;

create policy "Participants see quotes"
  on public.quotes for select to authenticated
  using ((select private.is_inquiry_participant(inquiry_id)));

create policy "Vendors quote on open inquiries"
  on public.quotes for insert to authenticated
  with check (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_id and i.status in ('open', 'quoted') and (select private.owns_vendor(i.vendor_id))
    )
  );

create function private.mark_inquiry_quoted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inquiries set status = 'quoted' where id = new.inquiry_id and status = 'open';
  return new;
end;
$$;

create trigger quotes_mark_inquiry_quoted
  after insert on public.quotes
  for each row execute function private.mark_inquiry_quoted();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes (id) on delete restrict,
  inquiry_id uuid not null unique references public.inquiries (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade,
  amount_pkr bigint not null,
  status public.booking_status not null default 'confirmed',
  -- Payments are simulated in the capstone (README §8.3).
  payment text not null default 'simulated' check (payment = 'simulated'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_host_idx on public.bookings (host_id);
create index bookings_vendor_idx on public.bookings (vendor_id);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function private.set_updated_at();

alter table public.bookings enable row level security;

revoke all on public.bookings from anon, authenticated;
grant select on public.bookings to authenticated;
grant update (status) on public.bookings to authenticated;

create policy "Participants see bookings"
  on public.bookings for select to authenticated
  using (host_id = (select auth.uid()) or (select private.owns_vendor(vendor_id)));

create policy "Hosts cancel or complete their bookings"
  on public.bookings for update to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()) and status in ('cancelled', 'completed'));

-- The host accepts a quote: the booking copies its price from the quote, never from the client.
create function public.book_quote(target uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  booking uuid;
begin
  select qt.id, qt.total_pkr, i.id as inquiry_id, i.plan_id, i.vendor_id, i.host_id, i.status
    into q
    from public.quotes qt join public.inquiries i on i.id = qt.inquiry_id
    where qt.id = target
    for update of i;

  if q.id is null or q.host_id <> (select auth.uid()) then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status <> 'quoted' then
    raise exception 'inquiry is %', q.status using errcode = 'P0001';
  end if;

  insert into public.bookings (quote_id, inquiry_id, plan_id, vendor_id, host_id, amount_pkr)
    values (q.id, q.inquiry_id, q.plan_id, q.vendor_id, q.host_id, q.total_pkr)
    returning id into booking;
  update public.inquiries set status = 'booked' where id = q.inquiry_id;
  return booking;
end;
$$;

revoke execute on function public.book_quote(uuid) from public, anon;
grant execute on function public.book_quote(uuid) to authenticated;

-- Live chat and quotes through Supabase Realtime (RLS applies to subscribers).
alter publication supabase_realtime add table public.messages, public.quotes;

-- ---------------------------------------------------------------------------
-- Reviews (#6): only from completed bookings, plus imported public reviews for seeding.
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  booking_id uuid unique references public.bookings (id) on delete set null,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  source public.review_source not null default 'booking',
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 2000),
  language text check (language in ('en', 'ur', 'roman_ur', 'mixed')),
  created_at timestamptz not null default now()
);

create index reviews_vendor_idx on public.reviews (vendor_id, created_at desc);

alter table public.reviews enable row level security;

-- author_id stays private: reviewers are never shown by name or id.
revoke all on public.reviews from anon, authenticated;
grant select (id, vendor_id, source, rating, body, language, created_at) on public.reviews to anon, authenticated;
grant insert (vendor_id, booking_id, rating, body, language) on public.reviews to authenticated;

create policy "Reviews are public"
  on public.reviews for select to anon, authenticated
  using (true);

create policy "Hosts review completed bookings"
  on public.reviews for insert to authenticated
  with check (
    source = 'booking'
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.host_id = (select auth.uid()) and b.vendor_id = reviews.vendor_id
        and b.status = 'completed'
    )
  );

create view public.vendor_stats
with (security_invoker = true)
as
  select vendor_id, round(avg(rating), 1) as rating, count(*)::int as review_count
  from public.reviews
  group by vendor_id;

grant select on public.vendor_stats to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sponsored placements (simulated featured listings). Shown only in the labelled sponsored
-- block; they never change match, quality or trust scores.
-- ---------------------------------------------------------------------------

create table public.sponsored_placements (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  category public.service_category not null,
  area public.lahore_area not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '90 days')
);

create index sponsored_placements_lookup_idx on public.sponsored_placements (category, area, ends_at);

alter table public.sponsored_placements enable row level security;

revoke all on public.sponsored_placements from anon, authenticated;
grant select on public.sponsored_placements to anon, authenticated;
grant insert (vendor_id, category, area, starts_at, ends_at) on public.sponsored_placements to authenticated;
grant delete on public.sponsored_placements to authenticated;

create policy "Placements are public"
  on public.sponsored_placements for select to anon, authenticated
  using (true);

create policy "Owners feature their own listing in its category"
  on public.sponsored_placements for insert to authenticated
  with check (
    exists (
      select 1 from public.vendors v
      where v.id = vendor_id and v.owner_id = (select auth.uid()) and v.category = sponsored_placements.category
    )
  );

create policy "Owners end their placements"
  on public.sponsored_placements for delete to authenticated
  using ((select private.owns_vendor(vendor_id)));
