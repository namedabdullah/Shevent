-- RLS checks for the app schema: the two-sided demo journey (host plans → inquiry → vendor quotes
-- → host books → review) plus the attacks each rule exists for. Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Users: host A, outsider B (another host), vendor V. Demo vendors come from seed.sql.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'host@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'outsider@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'vendor@example.com');

insert into public.plans (id, owner_id, event_type, guest_count, area, event_date, total_budget_pkr) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'wedding_mehndi', 300, 'Gulberg', '2026-12-19', 2500000);

-- ---------------------------------------------------------------------------
-- Vendor onboarding (as V)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.vendors (owner_id, slug, name, category, base_area)
     values ('00000000-0000-0000-0000-0000000000c1', 'test-caterers', 'Test Caterers', 'catering', 'Gulberg') $$,
  '42501', null, 'a host account cannot create a listing'
);
select lives_ok($$ select public.become_vendor() $$, 'a signed-in user can become a vendor');
select lives_ok(
  $$ insert into public.vendors (owner_id, slug, name, category, base_area)
     values ('00000000-0000-0000-0000-0000000000c1', 'test-caterers', 'Test Caterers', 'catering', 'Gulberg') $$,
  'a vendor account creates its listing'
);
select throws_ok(
  $$ insert into public.vendors (owner_id, slug, name, category, base_area)
     values ('00000000-0000-0000-0000-0000000000c1', 'test-caterers-2', 'Second Listing', 'decor', 'DHA') $$,
  '23505', null, 'one listing per vendor account'
);
select throws_ok(
  $$ update public.vendors set verified = true where slug = 'test-caterers' $$,
  '42501', null, 'vendors cannot verify themselves'
);
select lives_ok(
  $$ update public.vendors set description = 'Mehndi and walima menus' where slug = 'test-caterers' $$,
  'vendors edit their own listing'
);
update public.vendors set name = 'Hijacked' where slug = 'demo-marquee-gulberg';

reset role;
select is((select name from public.vendors where slug = 'demo-marquee-gulberg'), 'Demo Marquee Gulberg', 'vendors cannot edit other listings');
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'vendor', 'become_vendor sets the role');

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', null, true);
set local role anon;

-- Counted by name, because E2E runs on a local database add listings of their own.
select is((select count(*)::int from public.vendors where is_demo or slug = 'test-caterers'), 16, 'anyone can browse vendors (15 demo + 1 new)');
select throws_ok($$ select * from public.plans $$, '42501', null, 'anon cannot read plans');
select throws_ok($$ select public.become_vendor() $$, '42501', null, 'anon cannot become a vendor');

-- ---------------------------------------------------------------------------
-- Host A sends an inquiry; outsider B cannot see or touch it
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.inquiries (plan_id, vendor_id)
     values ('00000000-0000-0000-0000-0000000000f1', (select id from public.vendors where slug = 'test-caterers')) $$,
  'hosts send inquiries from their plans'
);
select lives_ok(
  $$ insert into public.messages (inquiry_id, body)
     values ((select id from public.inquiries where plan_id = '00000000-0000-0000-0000-0000000000f1'), 'Salam, is 19 Dec free?') $$,
  'hosts message the vendor'
);
select throws_ok(
  $$ insert into public.messages (inquiry_id, sender_id, body)
     values ((select id from public.inquiries where plan_id = '00000000-0000-0000-0000-0000000000f1'),
             '00000000-0000-0000-0000-0000000000c1', 'spoofed') $$,
  '42501', null, 'nobody can send as someone else'
);
select throws_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr)
     values ((select id from public.inquiries where plan_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'per_head', 300) $$,
  '42501', null, 'hosts cannot write quotes'
);

reset role;
select set_config('test.inquiry_id', (select id::text from public.inquiries where plan_id = '00000000-0000-0000-0000-0000000000f1'), true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}', true);
set local role authenticated;

select is_empty($$ select * from public.plans $$, 'other hosts cannot see the plan');
select is_empty($$ select * from public.inquiries $$, 'other hosts cannot see the inquiry');
select is_empty($$ select * from public.messages $$, 'other hosts cannot read the chat');
select throws_ok(
  $$ insert into public.inquiries (plan_id, vendor_id)
     values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-4000-8000-000000000101') $$,
  '42501', null, 'nobody can send inquiries from another host''s plan'
);
select throws_ok(
  $$ insert into public.messages (inquiry_id, body) values (current_setting('test.inquiry_id')::uuid, 'hi') $$,
  '42501', null, 'outsiders cannot join the chat'
);
select throws_ok($$ select public.share_plan('00000000-0000-0000-0000-0000000000f1') $$, 'P0002', null, 'nobody can share another host''s plan');

-- ---------------------------------------------------------------------------
-- Vendor V reads the inquiry and quotes
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.messages), 1, 'the vendor reads the chat');
select lives_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr, inclusions)
     values (current_setting('test.inquiry_id')::uuid, 3000, 'per_head', 900000, array['Serving staff']) $$,
  'the vendor sends a quote'
);
select is((select status::text from public.inquiries), 'quoted', 'sending a quote marks the inquiry quoted');

-- ---------------------------------------------------------------------------
-- Booking (simulated payment)
-- ---------------------------------------------------------------------------
reset role;
-- Scoped to this test's inquiry: a local database also holds quotes from the E2E runs.
select set_config('test.quote_id', (select id::text from public.quotes where inquiry_id = current_setting('test.inquiry_id')::uuid), true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok($$ select public.book_quote(current_setting('test.quote_id')::uuid) $$, 'P0002', null, 'outsiders cannot book');

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
set local role authenticated;

select lives_ok($$ select public.book_quote(current_setting('test.quote_id')::uuid) $$, 'the host books the quote');
select is((select amount_pkr from public.bookings), 900000::bigint, 'the booking price comes from the quote');
select is((select status::text from public.inquiries), 'booked', 'booking marks the inquiry booked');
select throws_ok($$ select public.book_quote(current_setting('test.quote_id')::uuid) $$, 'P0001', null, 'a quote is booked once');

-- ---------------------------------------------------------------------------
-- Reviews only after a completed booking; reviewer ids stay private
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.reviews (vendor_id, booking_id, rating, body)
     values ((select vendor_id from public.bookings), (select id from public.bookings), 5, 'Khana bohat acha tha') $$,
  '42501', null, 'no review before the event is completed'
);
select lives_ok($$ update public.bookings set status = 'completed' $$, 'the host marks the booking completed');
select lives_ok(
  $$ insert into public.reviews (vendor_id, booking_id, rating, body, language)
     values ((select vendor_id from public.bookings), (select id from public.bookings), 5, 'Khana bohat acha tha', 'mixed') $$,
  'the host reviews a completed booking'
);
select lives_ok($$ select public.share_plan('00000000-0000-0000-0000-0000000000f1') $$, 'the host shares the plan');

reset role;
select set_config('test.share_id', (select share_id from public.plans where id = '00000000-0000-0000-0000-0000000000f1'), true);
select set_config('request.jwt.claims', null, true);
set local role anon;

select throws_ok($$ select author_id from public.reviews $$, '42501', null, 'reviewer ids are not public');
select is((select rating from public.vendor_stats where review_count = 1), 5::numeric, 'vendor ratings are public');
select is(
  (select guest_count from public.get_shared_plan(current_setting('test.share_id'))),
  300,
  'anyone with the link sees a shared plan'
);
select is_empty($$ select * from public.get_shared_plan('not-a-real-token') $$, 'shared plans cannot be guessed');

select * from finish();
rollback;
