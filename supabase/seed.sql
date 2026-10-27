-- Sample data for local development: the Second Chapter book club.
-- Three sample readers, all with the password "margins-demo":
--   avery@example.com (club owner), kai@example.com, maya@example.com
-- Runs automatically with `supabase db reset`. Don't run this on production.

-- Readers ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('margins-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name),
  '', '', '', '',
  now(), now()
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'avery@example.com', 'Avery'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'kai@example.com',   'Kai'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'maya@example.com',  'Maya')
) as u (id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@example.com';

-- The club --------------------------------------------------------------------
insert into public.clubs (id, name, description, invite_code, created_by)
values ('c0000000-0000-4000-8000-000000000001', 'Second Chapter Book Club',
        'One book a month, around a long table.', 'CHAPTER2',
        'a0000000-0000-4000-8000-000000000001');

insert into public.club_members (club_id, user_id, role, current_page) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner',  60),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'member', 45),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'member', 72);

-- Books -----------------------------------------------------------------------
insert into public.books (id, club_id, title, author, published_year, month, status,
                          meeting_at, meeting_place, note, mood_color, created_by)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'The Unknown', 'Riley Sager', 2026, '2026-10-01', 'finished',
        '2026-10-29 19:00-04', null,
        'Our spooky fall pick. Five women vanished from a Vermont island in 1926, and a century later a film crew comes to tell their story.',
        '#8a4a2e', 'a0000000-0000-4000-8000-000000000001');

insert into public.books (id, club_id, title, author, published_year, page_count, month, status,
                          meeting_at, meeting_place, note, mood_color,
                          read_through_page, read_through_note, created_by)
values ('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
        'Recursion', 'Blake Crouch', 2019, 325, '2026-11-01', 'current',
        '2026-11-19 19:00-05', null,
        'A New York detective and a neuroscientist, and a memory that might not be real.',
        '#a8566d', 60, 'Read up to Helena wondering if she''s safe on the rig.',
        'a0000000-0000-4000-8000-000000000001');

-- The table for Recursion -------------------------------------------------------
insert into public.discussion_topics (id, club_id, book_id, author_id, body, page) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000002',
   'Ann''s false memories come back in black and white. Why gray? What small detail would convince you a memory was real?', 12),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001',
   'Barry and Julia remember the camping trip differently. Is a prettier false memory harmless? Do we all edit ours?', 22),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000003',
   'Helena says everything we experience is already a memory, about half a second late. Did that change how you think about "now"?', 43),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000003',
   'How does Slade know about the patent and the processors before Helena does? Theories welcome.', 59),
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001',
   'If you could save one memory in the chair, which would it be?', null);

insert into public.topic_votes (topic_id, club_id, user_id) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');

-- The lines the club picked -------------------------------------------------------
insert into public.quotes (club_id, book_id, added_by, body, speaker) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'This low point isn’t the book of your life. It’s just a chapter.', 'Barry'),
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'balance is for people who don’t know why they’re here.', 'Slade');

-- RSVPs for the November meeting ----------------------------------------------------
insert into public.rsvps (club_id, book_id, user_id, status) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'going'),
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'maybe');
