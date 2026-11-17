-- Venue visits on record (migration 20261118000000_venue_visits): the host requests, the venue confirms
-- with an address or declines, either side cancels; contact details stay out; a confirmed visit lets the
-- chat talk about meeting. `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Host H, outsider O, venue V (a marquee), caterer C. H has inquiries to both.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d0a1', 'visit-host@example.com'),
  ('00000000-0000-0000-0000-00000000d0b1', 'visit-outsider@example.com'),
  ('00000000-0000-0000-0000-00000000d0c1', 'visit-venue@example.com'),
  ('00000000-0000-0000-0000-00000000d0c2', 'visit-caterer@example.com');
update public.profiles set role = 'vendor'
  where id in ('00000000-0000-0000-0000-00000000d0c1', '00000000-0000-0000-0000-00000000d0c2');
insert into public.vendors (id, owner_id, slug, name, category, base_area) values
  ('00000000-0000-0000-0000-00000000d0e1', '00000000-0000-0000-0000-00000000d0c1', 'garden-marquee', 'Garden Marquee', 'venue', 'DHA'),
  ('00000000-0000-0000-0000-00000000d0e2', '00000000-0000-0000-0000-00000000d0c2', 'garden-caterers', 'Garden Caterers', 'catering', 'DHA');
insert into public.plans (id, owner_id, event_type, guest_count, area, event_date, total_budget_pkr) values
  ('00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0a1', 'wedding_walima', 300, 'DHA',
   (now() + interval '60 days')::date, 4000000);
insert into public.inquiries (id, plan_id, vendor_id, host_id) values
  ('00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0e1', '00000000-0000-0000-0000-00000000d0a1'),
  ('00000000-0000-0000-0000-00000000d012', '00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0e2', '00000000-0000-0000-0000-00000000d0a1');

-- ---------------------------------------------------------------------------
-- The host requests
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000d0a1", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d012', now() + interval '3 days') $$,
  'P0001', 'visits are for venues', 'only venues take visits'
);
select throws_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d011', now() - interval '1 day') $$,
  '22023', null, 'not in the past'
);
select throws_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d011', now() + interval '70 days') $$,
  '22023', null, 'not after the event'
);
select throws_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d011', now() + interval '3 days', 'Call me first on 0300 1234567') $$,
  'SV001', 'off_platform', 'the note cannot carry a phone number'
);
select throws_ok(
  $$ insert into public.visits (inquiry_id, starts_at) values ('00000000-0000-0000-0000-00000000d011', now() + interval '3 days') $$,
  '42501', null, 'visits are only made through request_visit()'
);
select lives_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d011', now() + interval '3 days', 'Can we see the lawn and the stage area?') $$,
  'the host requests a visit, and the note can talk about seeing the place'
);
select throws_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d011', now() + interval '4 days') $$,
  '23505', null, 'one visit at a time'
);
select is(
  (select blocked_reason from public.send_message('00000000-0000-0000-0000-00000000d011', 'I will come to the hall at 5')),
  'meeting',
  'until the venue confirms, the chat still keeps meeting plans out'
);

reset role;
select set_config('test.visit', (select id::text from public.visits where inquiry_id = '00000000-0000-0000-0000-00000000d011'), true);

-- ---------------------------------------------------------------------------
-- Outsiders and the wrong side
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000d0b1", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from public.visits $$, 'outsiders cannot see visits');
select throws_ok($$ select public.cancel_visit(current_setting('test.visit')::uuid) $$, 'P0002', null, 'outsiders cannot cancel');

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000d0a1", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.answer_visit(current_setting('test.visit')::uuid, true, 'Plot 5, Main Boulevard') $$,
  'P0002', null, 'the host cannot confirm their own visit'
);

-- ---------------------------------------------------------------------------
-- The venue answers
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000d0c1", "role": "authenticated"}', true);
set local role authenticated;

select is(
  (select visit_status::text from public.vendor_inbox() where inquiry_id = '00000000-0000-0000-0000-00000000d011'),
  'requested',
  'the venue''s inbox shows the request'
);
select throws_ok(
  $$ select public.answer_visit(current_setting('test.visit')::uuid, true) $$,
  '22023', null, 'confirming needs an address'
);
select throws_ok(
  $$ select public.answer_visit(current_setting('test.visit')::uuid, true, 'Plot 5, DHA. WhatsApp 0321 1234567 when here') $$,
  'SV001', 'off_platform', 'the address cannot carry a phone number'
);
select lives_ok(
  $$ select public.answer_visit(current_setting('test.visit')::uuid, true, 'Plot 5, Main Boulevard, DHA Phase 6', 'Come to the main hall and ask for the manager') $$,
  'the venue confirms with the address'
);
select is((select status::text from public.visits where id = current_setting('test.visit')::uuid), 'confirmed', 'the visit is confirmed');
select is(
  (select blocked_reason from public.send_message('00000000-0000-0000-0000-00000000d011', 'See you at the hall at 5, come to the main gate')),
  null,
  'with a confirmed visit, the chat can talk about meeting'
);
select is(
  (select blocked_reason from public.send_message('00000000-0000-0000-0000-00000000d011', 'If you get lost call me on 0300 1234567')),
  'phone',
  'but still not swap numbers'
);
select throws_ok(
  $$ select public.answer_visit(current_setting('test.visit')::uuid, false) $$,
  'P0001', null, 'a visit is answered once'
);

-- ---------------------------------------------------------------------------
-- Cancelling and asking again; declining
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000d0a1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.cancel_visit(current_setting('test.visit')::uuid) $$, 'the host cancels');
select lives_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d011', now() + interval '5 days') $$,
  'and asks for another time'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000d0c1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.answer_visit((select id from public.visits where status = 'requested'), false) $$,
  'the venue declines a time it can''t do'
);
select is(
  (select array_agg(status::text order by created_at) from public.visits),
  array['cancelled', 'declined'],
  'both visits stay on record'
);

-- No visits once the inquiry is closed.
reset role;
update public.inquiries set status = 'closed' where id = '00000000-0000-0000-0000-00000000d011';
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000d0a1", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.request_visit('00000000-0000-0000-0000-00000000d011', now() + interval '6 days') $$,
  'P0001', null, 'no visits on a closed inquiry'
);

select * from finish();
rollback;
