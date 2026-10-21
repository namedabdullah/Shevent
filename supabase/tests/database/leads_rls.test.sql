-- RLS checks for profiles and leads. Run with `pnpm exec supabase test db` (needs `supabase start`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Two signed-up users; the trigger gives each a host profile.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'host@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b';

select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'host'::public.user_role,
  'new users get a host profile'
);

-- Anonymous visitors
set local role anon;

select lives_ok(
  $$ insert into public.leads (type, contact, utm_source, landing_path) values ('waitlist', 'visitor@example.com', 'whatsapp', '/') $$,
  'anon can join the waitlist'
);
select throws_ok(
  $$ insert into public.leads (type, contact) values ('vendor_join', 'vendor@example.com') $$,
  '23514', null,
  'a vendor-join lead needs a name and category'
);
select throws_ok(
  $$ insert into public.leads (type, contact, created_at) values ('waitlist', 'visitor@example.com', '2000-01-01') $$,
  '42501', null,
  'anon cannot set created_at'
);
select throws_ok($$ select * from public.leads $$, '42501', null, 'anon cannot read leads');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');

-- Signed-in host
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;

select is_empty($$ select * from public.leads $$, 'hosts cannot read leads');
select results_eq(
  $$ select id::text from public.profiles $$,
  array['00000000-0000-0000-0000-00000000000a'],
  'users only see their own profile'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null,
  'users cannot change their own role'
);

-- Signed-in admin
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
set local role authenticated;

select isnt_empty($$ select * from public.leads $$, 'admins can read leads');

select * from finish();
rollback;
