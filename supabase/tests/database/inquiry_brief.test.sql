-- inquiry_brief(): both participants get the event details, nobody gets the budget, outsiders get nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'host@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'outsider@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'vendor@example.com');
insert into public.vendors (id, owner_id, slug, name, category, base_area) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'brief-test-caterers', 'Brief Test Caterers', 'catering', 'Gulberg');
insert into public.plans (id, owner_id, event_type, guest_count, area, event_date, total_budget_pkr) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'wedding_walima', 250, 'DHA', '2026-12-26', 3000000);
insert into public.inquiries (id, plan_id, vendor_id, host_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select event_type::text from public.inquiry_brief('00000000-0000-0000-0000-0000000000e1')),
  'wedding_walima',
  'the host sees the brief'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;
select is(
  (select guest_count from public.inquiry_brief('00000000-0000-0000-0000-0000000000e1')),
  250,
  'the vendor sees the event details'
);
select is_empty($$ select * from public.plans $$, 'the vendor still cannot read the plan (or its budget)');

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from public.inquiry_brief('00000000-0000-0000-0000-0000000000e1') $$, 'outsiders get nothing');

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;
select throws_ok($$ select * from public.inquiry_brief('00000000-0000-0000-0000-0000000000e1') $$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
