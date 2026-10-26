-- vendor_inbox(): a vendor sees their own inquiries with the event and the latest quote total,
-- never the host's budget; hosts, other vendors and anon see nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'inbox-host@example.com'),
  ('00000000-0000-0000-0000-0000000001c1', 'inbox-vendor@example.com'),
  ('00000000-0000-0000-0000-0000000001c2', 'inbox-other-vendor@example.com');
insert into public.vendors (id, owner_id, slug, name, category, base_area) values
  ('00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001c1', 'inbox-test-caterers', 'Inbox Test Caterers', 'catering', 'Gulberg'),
  ('00000000-0000-0000-0000-0000000001d2', '00000000-0000-0000-0000-0000000001c2', 'inbox-test-lights', 'Inbox Test Lights', 'lighting', 'DHA');
insert into public.plans (id, owner_id, event_type, guest_count, area, event_date, total_budget_pkr) values
  ('00000000-0000-0000-0000-0000000001f1', '00000000-0000-0000-0000-0000000001a1', 'wedding_mehndi', 300, 'Gulberg', '2026-12-19', 2500000);
insert into public.inquiries (id, plan_id, vendor_id, host_id) values
  ('00000000-0000-0000-0000-0000000001e1', '00000000-0000-0000-0000-0000000001f1', '00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001a1');

select ok(
  pg_get_function_result('public.vendor_inbox()'::regprocedure) !~ 'budget',
  'the inbox has no budget column'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001c1", "role": "authenticated"}', true);
set local role authenticated;
select results_eq(
  $$ select inquiry_id, status::text, guest_count, area::text, quote_total_pkr from public.vendor_inbox() $$,
  $$ values ('00000000-0000-0000-0000-0000000001e1'::uuid, 'open', 300, 'Gulberg', null::bigint) $$,
  'the vendor sees the new inquiry with its event details'
);

insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr) values
  ('00000000-0000-0000-0000-0000000001e1', 3000, 'per_head', 900000);
select results_eq(
  $$ select status::text, quote_total_pkr from public.vendor_inbox() $$,
  $$ values ('quoted', 900000::bigint) $$,
  'after quoting, the inbox shows the status and the quote total'
);

update public.inquiries set status = 'declined' where id = '00000000-0000-0000-0000-0000000001e1';
select is(
  (select status::text from public.vendor_inbox()),
  'declined',
  'the vendor can decline'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001c2", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from public.vendor_inbox() $$, 'another vendor sees nothing');
select throws_ok(
  $$ insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr) values ('00000000-0000-0000-0000-0000000001e1', 1, 'per_event', 1) $$,
  '42501', null, 'another vendor cannot quote on it'
);

reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001a1", "role": "authenticated"}', true);
set local role authenticated;
select is_empty($$ select * from public.vendor_inbox() $$, 'the host gets nothing from the vendor inbox');

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;
select throws_ok($$ select * from public.vendor_inbox() $$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
