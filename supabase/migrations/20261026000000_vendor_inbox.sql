-- The vendor's inbox (WEB_APP_PLAN §4.3): their inquiries with the event details, in one call.
-- Like inquiry_brief(), it reads the host's private plan but returns the event only, never the
-- budget, and only for listings the caller owns.

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
  quote_total_pkr bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.status, i.created_at, i.updated_at, p.event_type, p.guest_count, p.area, p.event_date,
         (select q.total_pkr from public.quotes q where q.inquiry_id = i.id order by q.created_at desc limit 1)
  from public.inquiries i
  join public.vendors v on v.id = i.vendor_id
  join public.plans p on p.id = i.plan_id
  where v.owner_id = (select auth.uid())
  order by i.updated_at desc, i.id;
$$;

revoke execute on function public.vendor_inbox() from public, anon;
grant execute on function public.vendor_inbox() to authenticated;
