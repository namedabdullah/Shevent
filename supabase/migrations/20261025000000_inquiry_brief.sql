-- Vendors need the event details to quote, but plans are private to the host and hold the budget,
-- which a vendor must never see (it would anchor every quote). This gives both inquiry
-- participants the event itself and nothing else.

create function public.inquiry_brief(target uuid)
returns table (
  event_type public.event_type,
  guest_count int,
  area public.lahore_area,
  venue_type public.venue_type,
  event_date date,
  preferences text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.event_type, p.guest_count, p.area, p.venue_type, p.event_date, p.preferences
  from public.inquiries i
  join public.plans p on p.id = i.plan_id
  where i.id = target and (select private.is_inquiry_participant(target));
$$;

revoke execute on function public.inquiry_brief(uuid) from public, anon;
grant execute on function public.inquiry_brief(uuid) to authenticated;
