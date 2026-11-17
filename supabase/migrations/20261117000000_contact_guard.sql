-- Keep bookings on Shevent. A host and vendor who swap numbers can agree a lower price outside the
-- app, and the booking (and any future commission on it) is never recorded. So until a booking
-- exists, contact details, links, social and messaging apps, meetings, outside payments and talk of
-- skipping Shevent stay out of everything one side writes to the other or to the public:
--
--   * chat messages, through public.send_message() (direct inserts are revoked), which also records
--     each blocked attempt in private.blocked_messages (the reason, never the text);
--   * quotes (notes, inclusions, exclusions), vendor listings (name, type, description, inclusions)
--     and booking reviews, through triggers that reject the row with SQLSTATE SV001
--     (detail = the reason, hint = the field), which the web app turns into a field error.
--
-- After a booking the price is on record, so that chat may share phone numbers, emails, links, apps
-- and meeting plans to organise the day. Outside payments and skipping Shevent stay blocked.
--
-- private.contact_reason() is the one check. It's rules, not a model: every block is explainable and
-- the same on both sides. It reads English, Roman Urdu and basic Urdu, and numbers written as words
-- ("zero three zero zero"), with letter O for zero, or with spaces, dots and dashes in between.

-- scope says how much to check:
--   'all'     everything (chat before a booking, quotes, listings);
--   'booked'  only outside payment and skipping Shevent (chat after a booking);
--   'details' only things that are contact or account details themselves: phone numbers, emails,
--             links, IBANs (public reviews, where "he never called me back" is a fair complaint).
create function private.contact_reason(input text, scope text default 'all')
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Lower case, Urdu and full-width digits as 0-9.
  t text;
  -- t with number words as digits and the separators between digits removed, for phone numbers.
  d text;
  pair text[];
begin
  if input is null or btrim(input) = '' then
    return null;
  end if;
  t := translate(lower(input), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹０１２３４５６７８９', '012345678901234567890123456789');

  if scope not in ('all', 'booked', 'details') then
    raise exception 'unknown scope %', scope using errcode = '22023';
  end if;

  -- A Pakistani IBAN, in every scope.
  if regexp_replace(t, '[\s-]', '', 'g') ~ 'pk\d{2}[a-z]{4}\d{16}' then
    return 'payment';
  end if;

  -- Payment outside Shevent (blocked even after booking).
  if scope <> 'details' and t ~ any (array[
       '\m(jazz\s*cash|easy\s*paisa|sada\s*pay|naya\s*pay|raast|u\s*paisa|payoneer|western\s+union|money\s*gram)\M',
       '\m(bank|account|acc|acct)\s*(transfer|details?|number|num|no|title)\M',
       '\ma/c\s*(no|number|num)\M',
       '\miban\M',
       '\m(my|our|mera|mere|meri|hamara|hamare|your|ur|aapka|apka|apna|apne)\s+bank\M',
       '\m(in|into|to)\s+(my|our|mere|hamare)\s+(account|acc)\M',
       '\mcash\s+(deal|payment|pay|only|mein|main|de|dein|dena|dedo|on\s+hand|in\s+hand)\M',
       '\m(in|mein|main)\s+cash\M',
       'جاز\s?کیش|ایزی\s?پیسہ|بینک'
     ]) then
    return 'payment';
  end if;

  -- Dealing outside Shevent (blocked even after booking).
  if scope <> 'details' and t ~ any (array[
       '\m(outside|bahar|baahar|bahir|baher)\s+(of\s+)?(the\s+|this\s+)?(shevent|app|platform|website|portal)\M',
       '\m(shevent|app|platform|website)\s+(se|say|sy|ke|k|kay|ky)\s+(bahar|baahar|bahir|baher|hatt?\s*(kar|ke))\M',
       '\m(without|bina|bypass|bypassing|skip|skipping|avoid|avoiding)\s+(the\s+|using\s+)?(shevent|app|platform|commission|middle\s*m[ae]n)\M',
       '\mcommission\M',
       '\mmiddle\s*m[ae]n\M',
       '\m(book|deal|pay|contact|talk|reach|settle|finali[sz]e|baat)\w*\s+(\w+\s+){0,3}directly\M',
       '\mdirect(ly)?\s+(\w+\s+){0,2}(deal|booking|book|payment|pay|contact|baat|bat|rabta|rabita|mujh\s*se|mujhse|hum\s*se|humse|hamse|with\s+me|with\s+us)\M',
       '\m(seedha|seedhi|sidha|sidhi|seedhay|seedhe)\s+(\w+\s+){0,2}(deal|baat|bat|booking|book|mujh|hum|rabta|contact)\M',
       '\msave\s+(the\s+|on\s+)?(fee|fees|commission|charges)\M',
       'کمیشن|ایپ\s+سے\s+باہر'
     ]) then
    return 'outside';
  end if;

  if scope = 'booked' then
    return null;
  end if;

  -- Phone numbers, however they're written.
  d := t;
  foreach pair slice 1 in array array[
    ['zero', '0'], ['sifar', '0'], ['one', '1'], ['aik', '1'], ['ek', '1'], ['two', '2'], ['do', '2'],
    ['three', '3'], ['teen', '3'], ['four', '4'], ['char', '4'], ['chaar', '4'], ['five', '5'], ['panch', '5'],
    ['paanch', '5'], ['six', '6'], ['chay', '6'], ['chhay', '6'], ['chhe', '6'], ['seven', '7'], ['saat', '7'],
    ['eight', '8'], ['aath', '8'], ['ath', '8'], ['nine', '9'], ['nau', '9']
  ] loop
    d := regexp_replace(d, '\m' || pair[1] || '\M', pair[2], 'g');
  end loop;
  d := regexp_replace(d, '\mdouble\s*(\d)', '\1\1', 'g');
  d := regexp_replace(d, '\mtriple\s*(\d)', '\1\1\1', 'g');
  -- Letter O for zero, repeated because "3oo" needs two passes. Each pass replaces at least one o.
  while d ~ '\do|o\d' loop
    d := regexp_replace(d, '(?<=\d)o|o(?=\d)', '0', 'g');
  end loop;
  d := regexp_replace(d, '(?<=\d)[\s./()_*–—-]+(?=\d)', '', 'g');
  if d ~ any (array[
       '(^|\D)(\+?92|0092|0)?3[0-4]\d{8}(?!\d)',   -- mobile: 03xx xxxxxxx, +92 3xx, or without the 0
       '(^|\D)(\+?92|0092|0)[1-9]\d{8,10}(?!\d)',  -- landline with its code (042 ...)
       '\+\d{9,14}(?!\d)',                         -- any international number
       '(^|\D)111\d{6}(?!\d)'                      -- UAN 111-xxx-xxx
     ]) then
    return 'phone';
  end if;

  -- Email addresses, also written as "name at gmail dot com" or "name(at)domain".
  if t ~ any (array[
       '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}',
       '\mat\s*the\s*rate\M',
       '[a-z0-9._-]+\s*[(\[{<]\s*(at|@)\s*[)\]}>]',
       '\m(gmail|ymail|hotmail|icloud|proton\s*mail)\M',
       '\moutlook\.com\M'
     ]) then
    return 'email';
  end if;
  -- Asking for or offering email (not in reviews, where it's part of a story).
  if scope = 'all' and t ~ any (array[
       '\myahoo\M',
       '\m(e-?mail|mail)\s+(me|us|kar|karo|kr|krdo|kardo|kijiye|karein|karen|bhej|bhejo|bhejein|send|address|id|pe|par|per)\M',
       '\m(by|via|on|over|through|thru)\s+e-?mail\M',
       '\m(your|ur|my|our|apna|apni|apki|aapki|meri|mera|hamari)\s+e-?mail\M',
       'ای\s?میل'
     ]) then
    return 'email';
  end if;

  if t ~ any (array[
       'https?://',
       '\mwww\.',
       '\m[a-z0-9-]+\.(com|pk|net|org|io|co|info|biz|app|site|online|store|shop|ly|gl|page|link|xyz)\M',
       '\m(wa|t|m|fb)\.me\M',
       '\mlinktr\.ee\M',
       '\mdot\s*(com|pk|net|org)\M'
     ]) then
    return 'link';
  end if;

  if scope = 'details' then
    return null;
  end if;

  if t ~ any (array[
       '\mwh?at+''?s?\s?ap+\M',
       '\mwh?ts+\s?ap+\M',
       '\m(wtsp|wapp)\M',
       '\m(telegram|viber|skype|snap\s?chat|instagram|insta|face\s?book|fb|messenger|tik\s?tok|linked\s?in|twitter|botim|wechat)\M',
       '\m(on|pe|par|per|via|my|our|your|apna|mera|hamara)\s+(signal|imo|ig|snap)\M',
       '\m(signal|imo|ig|snap)\s+(pe|par|per|pr|id|account|handle|number|call|karo|kar)\M',
       '(^|[^a-z0-9._%+-])@[a-z_][a-z0-9_.]{2,}',
       '\m(dm|inbox|pm)\s+(me|us|kar|karo|krdo|kardo|kr|kijiye|karein|karen)\M',
       'واٹس|وٹس\s?ایپ|انسٹا|فیس\s?بک'
     ]) then
    return 'social';
  end if;

  if t ~ any (array[
       '\m(call|ring|phone|sms|buzz|missed\s*call|miss\s*call)\s+(me|us|kar|karo|krdo|kardo|kr|kijiye|kijye|karein|karen|krein|kren|kariye|kare|krna|karna|lo|lena|you|u|aap|ap|aapko|apko|tumhe|mujhe)\M',
       '\mtext\s+(me|us)\M',
       '\m(phone|cell|mobile|contact|personal|direct|office|landline|ptcl|helpline)\s+(number|num|nmbr|nbr|no)\M',
       '\m(your|ur|my|our|apna|apni|aapka|apka|tumhara|tera|mera|meri|hamara|humara|uska|unka)\s+(number|num|nmbr|cell|phone|mobile)\M(?!\s+of\M)',
       '\mnumber\s+(de|dein|dedo|bhej|bhejo|bhejein|bhejain|send|share|chahiye|chahye|chaiye|milega|likh|likho|note)\M',
       '\m(give|send|share|drop|leave|forward|text)\s+(me\s+|us\s+)?(your|ur|my|our)\s+(number|num|contact|cell|phone|mobile|email)\M',
       '\m(on|over|via|by|through|pe|par|per|pr)\s+(the\s+)?(call|phone|cell|mobile|landline)\M',
       '\m(call|phone)\s+(pe|par|per|pr)\M',
       '\mcontact\s+(details?|info|information)\M',
       '\m(reach|contact)\s+(me|us)\s+(at|on)\M',
       'نمبر|فون|کال\s+کر'
     ]) then
    return 'contact';
  end if;

  -- Meetings and visits. Common phrases that only look like meetings are taken out first.
  t := regexp_replace(t, '\m(nice|glad|pleasure|good|great|happy|lovely)\s+to\s+meet\s+(you|u)\M', 'hello', 'g');
  t := regexp_replace(t, '\mmeet(s|ing)?\s+(your|the|all|our|any|every|this|these|those|their|ur)\s+(\w+\s+)?(budget|requirements?|needs?|expectations?|demands?|criteria|standards?|deadlines?|guests?|numbers?|count|target|quality)\M', 'fit', 'g');
  if t ~ any (array[
       '\m(let''?s|lets|can\s+we|could\s+we|shall\s+we|should\s+we|we\s+can|we\s+could|we\s+should|we\s+will|we''ll|i\s+can|i\s+could|i\s+will|i''ll|come\s+and|want\s+to|like\s+to|need\s+to|please)\s+meet\M',
       '\mmeet\s+(me|you|u|us|up|in|in\s+person|personally|at|tomorrow|today|tonight|this|next|on|sometime|soon|there)\M',
       '\mmeet-?ups?\M',
       '\min[\s-]person\M',
       '\mface[\s-]to[\s-]face\M',
       '\mone[\s-]on[\s-]one\M',
       '\m(schedule|set\s*up|arrange|fix|book)\s+(a\s+|an\s+)?(quick\s+|short\s+)?(meeting|meet|visit|site\s+visit|call|video\s+call|appointment)\M',
       '\m(zoom|teams|skype|video)\s+(call|meeting|link|pe|par)\M',
       '\m(google\s+meet|gmeet)\M',
       '\m(visit|come\s+to|come\s+over\s+to|come\s+by|drop\s+by|stop\s+by|swing\s+by|pop\s+by)\s+(\w+\s+){0,2}(office|shop|showroom|store|place|home|house|ghar|dukan|dukaan|factory|warehouse|studio|outlet|branch|hall|venue|marquee|lawn|farmhouse|farm\s+house|site|kitchen|godown)\M',
       '\mvisit\s+(us|me)\M',
       '\mcome\s+(see|meet)\s+(us|me)\M',
       '\m(office|shop|dukan|dukaan|ghar|showroom|studio|hall|venue|marquee|godown)\s+(pe\s+|par\s+|per\s+|pr\s+|mein\s+|me\s+|main\s+)?aa?\s+(jao|jaen|jayen|jaein|jayein|jaiye|jaye|jana|sakte)\M',
       '\m(tashreef|tashrif)\s+(laen|layen|laiye|lain|layein)\M',
       '\mmil(te|tay|tey)\s+(hain|hein|hen|hai|he|hay)\M',
       '\mmil\s+(lete|letay|lein|len|lain|le|leta|lo)\M',
       '\mmil\s+(kar|ker|ke|k)\s+(baat|bat)\M',
       '\mmula(q|k)a+t\M',
       '\m(send|share|bhej|bhejo|bhejein|bhejain|de|dein|dedo|drop|give)\s+(me\s+|us\s+)?(your\s+|ur\s+|apna\s+|apni\s+|my\s+|mera\s+|meri\s+|the\s+|our\s+)?(exact\s+)?(address|location|pin|live\s+location)\M',
       '\m(my|our|mera|meri|hamara|hamari|your|ur|apka|aapka|apna|apni)\s+(office\s+|shop\s+|home\s+)?(address|location)\M',
       '\m(pin|live|google)\s+(location|maps?)\M',
       'ملاقات|ملتے\s+ہیں|ایڈریس|لوکیشن'
     ]) then
    return 'meeting';
  end if;

  return null;
end;
$$;

comment on function private.contact_reason(text, text) is
  'Why this text would take a booking off Shevent (phone, email, link, social, contact, payment, outside, meeting), or null.';

-- ---------------------------------------------------------------------------
-- Chat: messages are sent through send_message(), which records blocked attempts
-- ---------------------------------------------------------------------------

-- Who tried to share what, for spotting repeat attempts. Never the text: it would hold the number.
create table private.blocked_messages (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create index blocked_messages_sender_idx on private.blocked_messages (sender_id, created_at desc);
alter table private.blocked_messages enable row level security;
revoke all on private.blocked_messages from public, anon, authenticated;

-- A booking that hasn't been cancelled: from then on the chat may share contact details.
create function private.inquiry_is_booked(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bookings b where b.inquiry_id = target and b.status <> 'cancelled');
$$;

-- Sends a chat message as the caller, unless it would take the booking off Shevent. Then nothing is
-- sent, the attempt is recorded, and the caller gets the reason and how many of their messages in
-- this chat have been blocked.
create function public.send_message(target uuid, content text)
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

revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

-- send_message() is now the only way in, so nothing skips the check.
revoke insert on public.messages from authenticated;
drop policy "Participants write as themselves" on public.messages;

-- ---------------------------------------------------------------------------
-- Quotes, listings and reviews: rejected with SV001 (detail = reason, hint = field)
-- ---------------------------------------------------------------------------

create function private.reject_off_platform(field text, value text, scope text default 'all')
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  reason text := private.contact_reason(value, scope);
begin
  if reason is not null then
    raise exception 'off_platform' using errcode = 'SV001', detail = reason, hint = field;
  end if;
end;
$$;

-- Quotes only exist before a booking.
create function private.guard_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reject_off_platform('notes', new.notes);
  perform private.reject_off_platform('inclusions', array_to_string(new.inclusions, E'\n'));
  perform private.reject_off_platform('exclusions', array_to_string(new.exclusions, E'\n'));
  return new;
end;
$$;

create trigger quotes_guard_contact
  before insert or update on public.quotes
  for each row execute function private.guard_quote();

-- Public listing text a vendor writes. Seeded listings nobody has claimed (owner_id null) aren't
-- checked, and on an edit only the fields that changed are, so an old row never blocks other edits.
create function private.guard_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    perform private.reject_off_platform('name', new.name);
  end if;
  if tg_op = 'INSERT' or new.sub_type is distinct from old.sub_type then
    perform private.reject_off_platform('sub_type', new.sub_type);
  end if;
  if tg_op = 'INSERT' or new.description is distinct from old.description then
    perform private.reject_off_platform('description', new.description);
  end if;
  if tg_op = 'INSERT' or new.inclusions is distinct from old.inclusions then
    perform private.reject_off_platform('inclusions', array_to_string(new.inclusions, E'\n'));
  end if;
  return new;
end;
$$;

create trigger vendors_guard_contact
  before insert or update on public.vendors
  for each row execute function private.guard_listing();

-- Reviews are public, so no contact details in them, but a complaint like "he never called back"
-- or "found them on Instagram" is fine. Imported reviews (seed data) aren't checked.
create function private.guard_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'booking' then
    perform private.reject_off_platform('body', new.body, 'details');
  end if;
  return new;
end;
$$;

create trigger reviews_guard_contact
  before insert or update on public.reviews
  for each row execute function private.guard_review();
