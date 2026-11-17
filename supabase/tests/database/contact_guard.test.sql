-- Keeping bookings on Shevent (migration 20261117000000_contact_guard): what the check catches and
-- lets through, the chat's send_message(), and the quote, listing and review triggers. `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ---------------------------------------------------------------------------
-- The check itself
-- ---------------------------------------------------------------------------

select is_empty(
  $$ select input from (values
       ('Salam, is 19 Dec free?'),
       ('Can you do 300 guests on 12 March 2027 for 25 lakh?'),
       ('Our package is Rs 2,000,000 for 500 guests'),
       ('Per head 2500 3000 3500 depending on the menu'),
       ('Price is 20,00,000 including tax'),
       ('We can meet your budget'),
       ('Nice to meet you!'),
       ('Kya aap 15 lakh mein kar sakte hain?'),
       ('Discount mil sakta hai?'),
       ('Wa alaikum assalam, ji bilkul'),
       ('In my opinion the lawn is better'),
       ('Zoom lens and drone coverage included'),
       ('Can you lower it to 19 lakh? Then I will book here'),
       ('Your number of guests is fine'),
       ('Dates 12 13 14 Dec all work'),
       ('50% advance, rest on the event day')
     ) as c (input)
     where private.contact_reason(input) is not null $$,
  'ordinary event talk, prices and dates go through'
);

select is_empty(
  $$ select expected, input, private.contact_reason(input) from (values
       ('phone', 'Call me on 0300-1234567'),
       ('phone', '+92 321 1234567'),
       ('phone', 'zero three zero zero one two three four five six seven'),
       ('phone', 'O3OO 1234567'),
       ('phone', '۰۳۰۰۱۲۳۴۵۶۷'),
       ('phone', '042-35761234'),
       ('phone', 'sifar teen sifar sifar aik do teen char panch chay saat'),
       ('email', 'ali at gmail dot com'),
       ('email', 'email me the menu'),
       ('link', 'see www.alicaterers.com'),
       ('social', 'add me on whatsapp'),
       ('social', 'follow @ali.caterers'),
       ('contact', 'apna number dein'),
       ('contact', 'phone pe baat karte hain'),
       ('payment', 'IBAN PK36 SCBL 0000 0011 2345 6702'),
       ('payment', 'advance easypaisa pe bhej dein'),
       ('outside', 'without Shevent I can do 19 lakh'),
       ('outside', 'app se bahar deal kar lete hain'),
       ('outside', 'we both save the commission'),
       ('meeting', 'Let''s meet tomorrow'),
       ('meeting', 'milte hain kal'),
       ('meeting', 'can I visit the hall?')
     ) as c (expected, input)
     where private.contact_reason(input) is distinct from expected $$,
  'contact details, apps, outside payments and deals, and meetings are caught, with the right reason'
);

select is(private.contact_reason('Call me on 0300-1234567', 'booked'), null, 'after a booking, phone numbers are fine');
select is(private.contact_reason('pay in cash, cheaper without Shevent', 'booked'), 'payment', 'after a booking, outside payment is still blocked');
select is(private.contact_reason('He never called me back, found him on Instagram', 'details'), null, 'reviews can tell the story');
select is(private.contact_reason('Reach him on 0300 1234567', 'details'), 'phone', 'but not give the number');

-- ---------------------------------------------------------------------------
-- Setup: host H, vendor V with a listing, an inquiry between them, outsider O
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c0a1', 'guard-host@example.com'),
  ('00000000-0000-0000-0000-00000000c0b1', 'guard-outsider@example.com'),
  ('00000000-0000-0000-0000-00000000c0c1', 'guard-vendor@example.com');
insert into public.plans (id, owner_id, event_type, guest_count, area, event_date, total_budget_pkr) values
  ('00000000-0000-0000-0000-00000000c0f1', '00000000-0000-0000-0000-00000000c0a1', 'wedding_walima', 300, 'DHA', '2027-03-02', 4000000);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000c0c1", "role": "authenticated"}', true);
set local role authenticated;
select public.become_vendor();

select throws_ok(
  $$ insert into public.vendors (owner_id, slug, name, category, base_area, description)
     values ('00000000-0000-0000-0000-00000000c0c1', 'guard-caterers', 'Guard Caterers', 'catering', 'DHA', 'Bookings: 0300 1234567') $$,
  'SV001', 'off_platform', 'a new listing cannot carry a phone number'
);
select lives_ok(
  $$ insert into public.vendors (owner_id, slug, name, category, base_area, description)
     values ('00000000-0000-0000-0000-00000000c0c1', 'guard-caterers', 'Guard Caterers', 'catering', 'DHA', 'Desi and BBQ menus') $$,
  'a clean listing is created'
);
select throws_ok(
  $$ update public.vendors set inclusions = array['Waiters', 'Find us on Instagram'] where slug = 'guard-caterers' $$,
  'SV001', 'off_platform', 'listing inclusions cannot point to social media'
);
select lives_ok($$ update public.vendors set description = 'Desi, BBQ and Chinese menus' where slug = 'guard-caterers' $$, 'clean edits save');

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000c0a1", "role": "authenticated"}', true);
set local role authenticated;
insert into public.inquiries (plan_id, vendor_id)
  values ('00000000-0000-0000-0000-00000000c0f1', (select id from public.vendors where slug = 'guard-caterers'));

reset role;
select set_config('test.inquiry', (select id::text from public.inquiries where plan_id = '00000000-0000-0000-0000-00000000c0f1'), true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000c0a1", "role": "authenticated"}', true);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Chat before a booking
-- ---------------------------------------------------------------------------

select isnt(
  (select message_id from public.send_message(current_setting('test.inquiry')::uuid, 'Salam, is 2 March free?')),
  null,
  'a normal message is sent'
);
select results_eq(
  $$ select blocked_reason, blocked_count, message_id from public.send_message(current_setting('test.inquiry')::uuid, 'Call me on 0321 1234567') $$,
  $$ values ('phone', 1, null::bigint) $$,
  'a phone number is not sent, and the sender is told why'
);
select is(
  (select blocked_count from public.send_message(current_setting('test.inquiry')::uuid, 'whatsapp pe baat karte hain')),
  2,
  'blocked attempts are counted per sender and chat'
);
select is((select count(*)::int from public.messages), 1, 'only the clean message is in the chat');
select throws_ok(
  $$ insert into public.messages (inquiry_id, body) values (current_setting('test.inquiry')::uuid, '0300 1234567') $$,
  '42501', null, 'messages cannot skip send_message()'
);
select throws_ok(
  $$ select * from public.send_message(current_setting('test.inquiry')::uuid, '   ') $$,
  '23514', null, 'empty messages are refused'
);
select throws_ok($$ select * from private.blocked_messages $$, '42501', null, 'nobody reads the blocked-message log from the app');

reset role;
select hasnt_column('private', 'blocked_messages', 'body', 'the log keeps the reason, never the text');
select is(
  (select array_agg(reason order by id) from private.blocked_messages where inquiry_id = current_setting('test.inquiry')::uuid),
  array['phone', 'social'],
  'the log holds both attempts'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000c0b1", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.send_message(current_setting('test.inquiry')::uuid, 'hi') $$,
  '42501', null, 'outsiders cannot send'
);

-- ---------------------------------------------------------------------------
-- Quotes (vendor)
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000c0c1", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr, notes)
     values (current_setting('test.inquiry')::uuid, 3000, 'per_head', 900000, 'Pay the advance in cash to save the fee') $$,
  'SV001', 'off_platform', 'quote notes cannot move the payment off Shevent'
);
select throws_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr, exclusions)
     values (current_setting('test.inquiry')::uuid, 3000, 'per_head', 900000, array['Tasting: visit our kitchen in Johar Town']) $$,
  'SV001', 'off_platform', 'quote lists cannot arrange a meeting'
);
select lives_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr, inclusions, notes)
     values (current_setting('test.inquiry')::uuid, 3000, 'per_head', 900000, array['Serving staff'], 'Valid for two weeks') $$,
  'a clean quote is sent'
);
select is(
  (select blocked_reason from public.send_message(current_setting('test.inquiry')::uuid, 'Book directly with me for 19 lakh')),
  'outside',
  'the vendor cannot offer a cheaper deal outside Shevent'
);

-- ---------------------------------------------------------------------------
-- After the host books: contact details are fine, outside payment still isn't
-- ---------------------------------------------------------------------------

reset role;
select set_config('test.quote', (select id::text from public.quotes where inquiry_id = current_setting('test.inquiry')::uuid), true);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000c0a1", "role": "authenticated"}', true);
set local role authenticated;
select public.book_quote(current_setting('test.quote')::uuid);

select isnt(
  (select message_id from public.send_message(current_setting('test.inquiry')::uuid, 'Booked! My number for the day is 0300 1234567')),
  null,
  'after booking, the chat can share a phone number to plan the day'
);
select is(
  (select blocked_reason from public.send_message(current_setting('test.inquiry')::uuid, 'Can I pay the rest in cash?')),
  'payment',
  'after booking, paying outside Shevent is still blocked'
);

update public.bookings set status = 'cancelled' where inquiry_id = current_setting('test.inquiry')::uuid;
select is(
  (select blocked_reason from public.send_message(current_setting('test.inquiry')::uuid, 'Call me on 0300 1234567')),
  'phone',
  'a cancelled booking does not count'
);

-- ---------------------------------------------------------------------------
-- Reviews: no contact details, but complaints are fine
-- ---------------------------------------------------------------------------

reset role;
-- A fresh, completed booking to review (the cancelled one can't be).
update public.bookings set status = 'completed' where inquiry_id = current_setting('test.inquiry')::uuid;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000c0a1", "role": "authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.reviews (vendor_id, booking_id, rating, body)
     values ((select vendor_id from public.bookings where inquiry_id = current_setting('test.inquiry')::uuid),
             (select id from public.bookings where inquiry_id = current_setting('test.inquiry')::uuid), 5, 'Great food! Book them on 0300 1234567') $$,
  'SV001', 'off_platform', 'a review cannot carry a phone number'
);
select lives_ok(
  $$ insert into public.reviews (vendor_id, booking_id, rating, body)
     values ((select vendor_id from public.bookings where inquiry_id = current_setting('test.inquiry')::uuid),
             (select id from public.bookings where inquiry_id = current_setting('test.inquiry')::uuid), 2, 'Food was fine but he never called me back') $$,
  'a review can say they never called back'
);

select * from finish();
rollback;
