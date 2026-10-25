-- RLS for the tables the first suites didn't cover (plan_feedback, portfolio_media,
-- sponsored_placements) and the "vendors can only quote on open inquiries sent to them" rule.
-- Required by testing/PHASE_TESTING.md S5. Run with `pnpm db:test`.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Host H, outsider O, vendor accounts V1 (catering listing) and V2 (lighting listing).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'host@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'outsider@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'vendor1@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'vendor2@example.com');
update public.profiles set role = 'vendor' where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
insert into public.vendors (id, owner_id, slug, name, category, base_area) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'rls-caterers', 'RLS Caterers', 'catering', 'Gulberg'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 'rls-lights', 'RLS Lights', 'lighting', 'DHA');
insert into public.plans (id, owner_id, event_type, guest_count, area, event_date, total_budget_pkr) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'birthday', 60, 'Johar Town', '2026-12-05', 600000);
insert into public.inquiries (id, plan_id, vendor_id, host_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1');

-- ---------------------------------------------------------------------------
-- plan_feedback
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.plan_feedback (plan_id, actual_spend_pkr, rating) values ('00000000-0000-0000-0000-0000000000f1', '{"catering": 400000}', 4) $$,
  'a host gives feedback on their own plan'
);
select throws_ok(
  $$ insert into public.plan_feedback (plan_id, actual_spend_pkr, rating) values ('00000000-0000-0000-0000-0000000000f1', '{}', 6) $$,
  '23514', null, 'a rating above 5 is rejected'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from public.plan_feedback $$, 'another host cannot read the feedback');
select throws_ok(
  $$ insert into public.plan_feedback (plan_id, actual_spend_pkr, rating) values ('00000000-0000-0000-0000-0000000000f1', '{}', 1) $$,
  '42501', null, 'another host cannot write feedback on this plan'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from public.plan_feedback $$, 'a vendor cannot read a host''s feedback');

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;
select throws_ok($$ select * from public.plan_feedback $$, '42501', null, 'anon cannot read feedback');

-- ---------------------------------------------------------------------------
-- portfolio_media: hidden until approved; status and phash are server-side only
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.portfolio_media (vendor_id, storage_path, tags) values ('00000000-0000-0000-0000-0000000000d1', 'd1/photo-1.jpg', array['buffet']) $$,
  'a vendor adds a photo to their own listing'
);
select throws_ok(
  $$ insert into public.portfolio_media (vendor_id, storage_path, status) values ('00000000-0000-0000-0000-0000000000d1', 'd1/photo-2.jpg', 'approved') $$,
  '42501', null, 'a vendor cannot approve their own photo at upload'
);
select throws_ok(
  $$ update public.portfolio_media set phash = 'forged' where vendor_id = '00000000-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'a vendor cannot write the duplicate-check fields'
);
select is((select count(*)::int from public.portfolio_media), 1, 'the owner sees their pending photo');

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.portfolio_media (vendor_id, storage_path) values ('00000000-0000-0000-0000-0000000000d1', 'd1/hijack.jpg') $$,
  '42501', null, 'another vendor cannot add photos to this listing'
);
select is_empty($$ select * from public.portfolio_media $$, 'another vendor cannot see pending photos');
delete from public.portfolio_media where vendor_id = '00000000-0000-0000-0000-0000000000d1';

reset role;
select is((select count(*)::int from public.portfolio_media), 1, 'another vendor cannot delete the photo');

set local role anon;
select is_empty($$ select * from public.portfolio_media $$, 'the public sees no unapproved photos');
reset role;

update public.portfolio_media set status = 'approved';
set local role anon;
select is((select count(*)::int from public.portfolio_media), 1, 'the public sees a photo once it is approved');
reset role;

-- ---------------------------------------------------------------------------
-- sponsored_placements: public read; owners feature only their own listing, in its own category
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.sponsored_placements (vendor_id, category, area, ends_at)
     values ('00000000-0000-0000-0000-0000000000d1', 'catering', 'Gulberg', now() + interval '30 days') $$,
  'a vendor features their own listing in its category'
);
select throws_ok(
  $$ insert into public.sponsored_placements (vendor_id, category, area, ends_at)
     values ('00000000-0000-0000-0000-0000000000d1', 'lighting', 'Gulberg', now() + interval '30 days') $$,
  '42501', null, 'a vendor cannot buy placement in another category'
);
select throws_ok(
  $$ insert into public.sponsored_placements (vendor_id, category, area, ends_at)
     values ('00000000-0000-0000-0000-0000000000d1', 'catering', 'DHA', now() + interval '200 days') $$,
  '23514', null, 'a placement longer than 90 days is rejected'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.sponsored_placements (vendor_id, category, area, ends_at)
     values ('00000000-0000-0000-0000-0000000000d1', 'catering', 'Gulberg', now() + interval '30 days') $$,
  '42501', null, 'a vendor cannot sponsor someone else''s listing'
);
delete from public.sponsored_placements;

reset role;
select is((select count(*)::int from public.sponsored_placements), 1, 'another vendor cannot end the placement');
set local role anon;
select is((select count(*)::int from public.sponsored_placements), 1, 'placements are public');
reset role;

-- ---------------------------------------------------------------------------
-- quotes: only on open inquiries that were sent to the vendor
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr) values ('00000000-0000-0000-0000-0000000000e1', 1000, 'per_head', 60000) $$,
  '42501', null, 'a vendor cannot quote on an inquiry sent to someone else'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr) values ('00000000-0000-0000-0000-0000000000e1', 1000, 'per_head', 60000) $$,
  'the vendor quotes on their open inquiry'
);

reset role;
update public.inquiries set status = 'declined';
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr) values ('00000000-0000-0000-0000-0000000000e1', 900, 'per_head', 54000) $$,
  '42501', null, 'no quotes once the inquiry is declined or closed'
);

select * from finish();
rollback;
