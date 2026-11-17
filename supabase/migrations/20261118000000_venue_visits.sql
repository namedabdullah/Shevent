-- Venue visits, on record. Before a booking the chat blocks meeting plans (20261117000000_contact_guard),
-- but a host reasonably wants to see a hall or marquee before booking it. Instead of arranging that in
-- the chat, the host requests a visit here and the venue confirms it with the address (or declines).
-- Shevent then knows the two met, when, and for which inquiry.
--
-- Visits are for venue listings, before a booking. All writes go through request_visit(),
-- answer_visit() and cancel_visit(); participants read them through RLS. Notes and the address get the
-- same contact check as the chat, except that talk of meeting is what a visit is for. Once a visit is
-- confirmed, the chat may talk about meeting too (send_message() below).

create type public.visit_status as enum ('requested', 'confirmed', 'declined', 'cancelled');

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  starts_at timestamptz not null,
  host_note text check (char_length(host_note) <= 300),
  status public.visit_status not null default 'requested',
  -- Set by the venue when it confirms: where to come and who to ask for.
  venue_address text check (char_length(venue_address) between 5 and 200),
  venue_note text check (char_length(venue_note) <= 300),
  cancelled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'confirmed' or venue_address is not null)
);

-- One visit in play per inquiry; a new time means cancelling first.
create unique index visits_one_active_idx on public.visits (inquiry_id) where status in ('requested', 'confirmed');
create index visits_inquiry_idx on public.visits (inquiry_id, created_at desc);

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function private.set_updated_at();

alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;
grant select on public.visits to authenticated;

create policy "Participants see visits"
  on public.visits for select to authenticated
  using ((select private.is_inquiry_participant(inquiry_id)));

alter publication supabase_realtime add table public.visits;

-- The chat's contact check, minus "meeting": arranging a meeting is what a visit is.
create function private.reject_visit_text(field text, value text, scope text default 'all')
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  reason text := private.contact_reason(value, scope);
begin
  if reason is not null and reason <> 'meeting' then
    raise exception 'off_platform' using errcode = 'SV001', detail = reason, hint = field;
  end if;
end;
$$;

-- The host asks to visit. Times are from an hour from now, up to 120 days ahead and not after the event.
create function public.request_visit(target uuid, starts_at timestamptz, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  i record;
  visit uuid;
  clean_note text := nullif(btrim(note), '');
begin
  select inq.id, inq.host_id, inq.status, v.category, p.event_date
    into i
    from public.inquiries inq
    join public.vendors v on v.id = inq.vendor_id
    join public.plans p on p.id = inq.plan_id
    where inq.id = target
    for update of inq;

  if i.id is null or i.host_id is distinct from me then
    raise exception 'inquiry not found' using errcode = 'P0002';
  end if;
  if i.category <> 'venue' then
    raise exception 'visits are for venues' using errcode = 'P0001';
  end if;
  if i.status not in ('open', 'quoted') then
    raise exception 'inquiry is %', i.status using errcode = 'P0001';
  end if;
  if starts_at is null or starts_at < now() + interval '1 hour' or starts_at > now() + interval '120 days'
     or (starts_at at time zone 'Asia/Karachi')::date > i.event_date then
    raise exception 'pick a time from an hour from now up to the event' using errcode = '22023', hint = 'date';
  end if;
  if char_length(clean_note) > 300 then
    raise exception 'note is too long' using errcode = '22023', hint = 'note';
  end if;
  perform private.reject_visit_text('note', clean_note);

  -- A request or visit whose time has passed no longer holds the slot.
  update public.visits set status = 'cancelled'
    where inquiry_id = target and status in ('requested', 'confirmed') and visits.starts_at < now();
  if exists (select 1 from public.visits where inquiry_id = target and status in ('requested', 'confirmed')) then
    raise exception 'a visit is already arranged' using errcode = '23505';
  end if;

  insert into public.visits (inquiry_id, starts_at, host_note) values (target, starts_at, clean_note)
    returning id into visit;
  -- Moves the inquiry to the top of the vendor's inbox.
  update public.inquiries set updated_at = now() where id = target;
  return visit;
end;
$$;

-- The venue confirms (with the address) or declines a requested visit.
create function public.answer_visit(target uuid, accept boolean, address text default null, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  clean_address text := nullif(btrim(address), '');
  clean_note text := nullif(btrim(note), '');
begin
  select vi.id, vi.status, vi.starts_at, inq.vendor_id
    into v
    from public.visits vi join public.inquiries inq on inq.id = vi.inquiry_id
    where vi.id = target
    for update of vi;

  if v.id is null or not private.owns_vendor(v.vendor_id) then
    raise exception 'visit not found' using errcode = 'P0002';
  end if;
  if v.status <> 'requested' or v.starts_at < now() then
    raise exception 'visit is %', v.status using errcode = 'P0001';
  end if;

  if accept then
    if clean_address is null or char_length(clean_address) not between 5 and 200 then
      raise exception 'an address is 5 to 200 characters' using errcode = '22023', hint = 'address';
    end if;
    if char_length(clean_note) > 300 then
      raise exception 'note is too long' using errcode = '22023', hint = 'note';
    end if;
    -- The address may say where, not how to reach anyone.
    perform private.reject_visit_text('address', clean_address, 'details');
    perform private.reject_visit_text('note', clean_note);
    update public.visits set status = 'confirmed', venue_address = clean_address, venue_note = clean_note where id = target;
  else
    update public.visits set status = 'declined' where id = target;
  end if;
end;
$$;

-- Either side calls off a requested or confirmed visit.
create function public.cancel_visit(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select vi.id, vi.status, vi.inquiry_id into v from public.visits vi where vi.id = target for update;
  if v.id is null or not private.is_inquiry_participant(v.inquiry_id) then
    raise exception 'visit not found' using errcode = 'P0002';
  end if;
  if v.status not in ('requested', 'confirmed') then
    raise exception 'visit is %', v.status using errcode = 'P0001';
  end if;
  update public.visits set status = 'cancelled', cancelled_by = (select auth.uid()) where id = target;
end;
$$;

revoke execute on function public.request_visit(uuid, timestamptz, text), public.answer_visit(uuid, boolean, text, text),
  public.cancel_visit(uuid) from public, anon;
grant execute on function public.request_visit(uuid, timestamptz, text), public.answer_visit(uuid, boolean, text, text),
  public.cancel_visit(uuid) to authenticated;

-- A confirmed visit that hasn't passed (with a day's grace, for "I'm at the gate" on the day).
create function private.inquiry_has_visit(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.visits v
    where v.inquiry_id = target and v.status = 'confirmed' and v.starts_at > now() - interval '1 day'
  );
$$;

-- send_message() as in 20261117000000_contact_guard, except that with a confirmed visit, talk of
-- meeting ("which gate?", "I'll be there at 5") is allowed. Contact details still aren't.
create or replace function public.send_message(target uuid, content text)
returns table (message_id bigint, sent_at timestamptz, blocked_reason text, blocked_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  message text := btrim(content);
  reason text;
begin
  if me is null or target is null or not private.is_inquiry_participant(target) then
    raise exception 'not a participant in this inquiry' using errcode = '42501';
  end if;
  if message is null or char_length(message) not between 1 and 2000 then
    raise exception 'a message is 1 to 2000 characters' using errcode = '23514';
  end if;

  reason := private.contact_reason(message, case when private.inquiry_is_booked(target) then 'booked' else 'all' end);
  if reason = 'meeting' and private.inquiry_has_visit(target) then
    reason := null;
  end if;
  if reason is not null then
    insert into private.blocked_messages (inquiry_id, sender_id, reason) values (target, me, reason);
    return query
      select null::bigint, null::timestamptz, reason,
             (select count(*)::int from private.blocked_messages b where b.inquiry_id = target and b.sender_id = me);
    return;
  end if;

  return query
    insert into public.messages as m (inquiry_id, sender_id, body)
    values (target, me, message)
    returning m.id, m.created_at, null::text, 0;
end;
$$;

-- The vendor inbox also says when a visit is waiting or arranged (it returns new columns, so it's
-- dropped and created again; the body is otherwise as in 20261026000000_vendor_inbox).
drop function public.vendor_inbox();

create function public.vendor_inbox()
returns table (
  inquiry_id uuid,
  status public.inquiry_status,
  created_at timestamptz,
  updated_at timestamptz,
  event_type public.event_type,
  guest_count int,
  area public.lahore_area,
  event_date date,
  -- Total of the latest quote, if one was sent.
  quote_total_pkr bigint,
  -- The visit in play (requested or confirmed), if any.
  visit_status public.visit_status,
  visit_starts_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.status, i.created_at, i.updated_at, p.event_type, p.guest_count, p.area, p.event_date,
         (select q.total_pkr from public.quotes q where q.inquiry_id = i.id order by q.created_at desc limit 1),
         vi.status, vi.starts_at
  from public.inquiries i
  join public.vendors v on v.id = i.vendor_id
  join public.plans p on p.id = i.plan_id
  left join public.visits vi on vi.inquiry_id = i.id and vi.status in ('requested', 'confirmed') and vi.starts_at > now()
  where v.owner_id = (select auth.uid())
  order by i.updated_at desc, i.id;
$$;

revoke execute on function public.vendor_inbox() from public, anon;
grant execute on function public.vendor_inbox() to authenticated;
