-- Permission tests for Margins. Run against a database that has the
-- migrations and seed.sql applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/permissions.sql
-- Everything runs inside a transaction and is rolled back, so it leaves no
-- trace. Each passing check prints "ok - ...". The first failure stops the run.

\set ON_ERROR_STOP 1
begin;

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.act_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
end;
$$;

create function tests.act_as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end;
$$;

create function tests.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create function tests.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAILED - %', p_name;
  end if;
  raise notice 'ok - %', p_name;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

-- Sample ids from seed.sql
create function tests.avery() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.kai()   returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000002'::uuid $$;
create function tests.maya()  returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000003'::uuid $$;
create function tests.club()  returns uuid language sql immutable as $$ select 'c0000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.unknown_book()   returns uuid language sql immutable as $$ select 'b0000000-0000-4000-8000-000000000001'::uuid $$;
create function tests.recursion_book() returns uuid language sql immutable as $$ select 'b0000000-0000-4000-8000-000000000002'::uuid $$;
grant execute on all functions in schema tests to authenticated, anon;

-- A reader who isn't in any club yet, and one with their own club.
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-4000-8000-000000000001', 'sam@example.com',  '{"display_name":"Sam"}'),
  ('e0000000-0000-4000-8000-000000000002', 'river@example.com', null);

do $$
begin
  perform tests.ok((select display_name from public.profiles where id = 'e0000000-0000-4000-8000-000000000001') = 'Sam',
                   'sign-up creates a profile with the chosen name');
  perform tests.ok((select display_name from public.profiles where id = 'e0000000-0000-4000-8000-000000000002') = 'river',
                   'sign-up without a name falls back to the email name');
end $$;

-- Outsiders ---------------------------------------------------------------------
do $$
declare
  v_sam uuid := 'e0000000-0000-4000-8000-000000000001';
  n int;
begin
  perform tests.act_as(v_sam);
  select count(*) into n from public.clubs;            perform tests.ok(n = 0, 'an outsider sees no clubs');
  select count(*) into n from public.books;            perform tests.ok(n = 0, 'an outsider sees no books');
  select count(*) into n from public.discussion_topics; perform tests.ok(n = 0, 'an outsider sees no topics');
  select count(*) into n from public.quotes;           perform tests.ok(n = 0, 'an outsider sees no quotes');
  select count(*) into n from public.profiles;         perform tests.ok(n = 1, 'an outsider sees only their own profile');

  begin
    perform public.join_club('NOPE1234');
    perform tests.ok(false, 'a wrong invite code is rejected');
  exception when no_data_found then
    perform tests.ok(true, 'a wrong invite code is rejected');
  end;

  perform public.join_club(' chapter-2 ');
  select count(*) into n from public.books;            perform tests.ok(n = 2, 'joining with a messy invite code works and shows the books');
  perform public.join_club('CHAPTER2');
  select count(*) into n from public.club_members where user_id = v_sam;
  perform tests.ok(n = 1, 'joining twice is harmless');
  perform tests.ok((select role from public.club_members where user_id = v_sam) = 'member', 'new joiners are members');
  perform tests.reset();
end $$;

-- Anonymous visitors --------------------------------------------------------------
do $$
begin
  perform tests.act_as_anon();
  begin
    perform count(*) from public.books;
    perform tests.ok(false, 'signed-out visitors cannot read books');
  exception when insufficient_privilege then
    perform tests.ok(true, 'signed-out visitors cannot read books');
  end;
  begin
    perform public.join_club('CHAPTER2');
    perform tests.ok(false, 'signed-out visitors cannot join a club');
  exception when insufficient_privilege then
    perform tests.ok(true, 'signed-out visitors cannot join a club');
  end;
  perform tests.reset();
end $$;

-- Members can't do admin things ------------------------------------------------------
do $$
declare
  n int;
begin
  perform tests.act_as(tests.kai());

  update public.books set title = 'Hacked' where id = tests.recursion_book();
  perform tests.ok((select title from public.books where id = tests.recursion_book()) = 'Recursion',
                   'a member cannot edit a book');

  begin
    update public.club_members set role = 'owner' where user_id = tests.kai();
    perform tests.ok(false, 'a member cannot promote themselves');
  exception when insufficient_privilege then
    perform tests.ok(true, 'a member cannot promote themselves');
  end;

  update public.club_members set current_page = 80 where user_id = tests.kai() and club_id = tests.club();
  update public.club_members set current_page = 1  where user_id = tests.avery();
  perform tests.ok((select current_page from public.club_members where user_id = tests.kai()) = 80,
                   'a member can move their own bookmark');
  perform tests.ok((select current_page from public.club_members where user_id = tests.avery()) = 60,
                   'a member cannot move someone else''s bookmark');
  update public.club_members set current_page = 45 where user_id = tests.kai() and club_id = tests.club();

  begin
    perform public.start_book(tests.unknown_book());
    perform tests.ok(false, 'a member cannot change the current book');
  exception when insufficient_privilege then
    perform tests.ok(true, 'a member cannot change the current book');
  end;

  begin
    perform public.regenerate_invite_code(tests.club());
    perform tests.ok(false, 'a member cannot change the invite code');
  exception when insufficient_privilege then
    perform tests.ok(true, 'a member cannot change the invite code');
  end;

  delete from public.club_members where user_id = tests.maya();
  select count(*) into n from public.club_members where club_id = tests.club();
  perform tests.ok(n = 4, 'a member cannot remove someone else');
  perform tests.reset();
end $$;

-- The table ---------------------------------------------------------------------------
do $$
declare
  v_topic uuid;
  v_voted boolean;
  n int;
begin
  perform tests.act_as(tests.kai());

  insert into public.discussion_topics (club_id, book_id, body, page)
  values (tests.club(), tests.recursion_book(), 'Who else cried at the café scene?', 21)
  returning id into v_topic;
  perform tests.ok((select author_id from public.discussion_topics where id = v_topic) = tests.kai(),
                   'a new topic is credited to whoever added it');

  begin
    insert into public.discussion_topics (club_id, book_id, body, author_id)
    values (tests.club(), tests.recursion_book(), 'Pretending to be Avery', tests.avery());
    perform tests.ok(false, 'a member cannot post as someone else');
  exception when insufficient_privilege then
    perform tests.ok(true, 'a member cannot post as someone else');
  end;

  begin
    insert into public.discussion_topics (club_id, book_id, body)
    values (tests.club(), tests.unknown_book(), 'x'), (gen_random_uuid(), tests.recursion_book(), 'wrong club');
    perform tests.ok(false, 'a topic cannot point at a book from another club');
  exception when foreign_key_violation or insufficient_privilege then
    perform tests.ok(true, 'a topic cannot point at a book from another club');
  end;

  v_voted := public.toggle_topic_vote(v_topic);
  perform tests.ok(v_voted, '"me too" adds a vote');
  perform tests.ok((select vote_count from public.topic_feed where id = v_topic) = 1 and
                   (select voted_by_me from public.topic_feed where id = v_topic),
                   'the feed shows the vote count and that I voted');
  v_voted := public.toggle_topic_vote(v_topic);
  perform tests.ok(not v_voted, 'tapping "me too" again takes the vote back');

  perform tests.ok((select is_ahead_of_me from public.topic_feed where id = 'd0000000-0000-4000-8000-000000000004'),
                   'a topic past my page (59 > 45) is flagged as a spoiler');
  perform tests.ok(not (select is_ahead_of_me from public.topic_feed where id = 'd0000000-0000-4000-8000-000000000001'),
                   'a topic before my page (12 < 45) is not flagged');

  delete from public.discussion_topics where id = 'd0000000-0000-4000-8000-000000000002';
  perform tests.ok(exists (select 1 from public.discussion_topics where id = 'd0000000-0000-4000-8000-000000000002'),
                   'a member cannot delete someone else''s topic');

  perform tests.act_as(tests.maya());
  perform public.set_topic_status(v_topic, 'discussed');
  perform tests.ok((select status = 'discussed' and discussed_at is not null
                    from public.discussion_topics where id = v_topic),
                   'any member can tick a topic off, and it records when');
  perform public.set_topic_status(v_topic, 'open');
  perform tests.ok((select discussed_at is null from public.discussion_topics where id = v_topic),
                   'reopening a topic clears when it was discussed');

  perform tests.act_as(tests.avery());
  delete from public.discussion_topics where id = v_topic;
  perform tests.ok(not exists (select 1 from public.discussion_topics where id = v_topic),
                   'an owner can remove any topic');
  perform tests.reset();
end $$;

-- Another club stays private -------------------------------------------------------------
do $$
declare
  v_other public.clubs;
  v_book uuid;
  n int;
begin
  perform tests.act_as('e0000000-0000-4000-8000-000000000002');
  v_other := public.create_club('Night Owls', 'Mysteries only');
  perform tests.ok((select role from public.club_members where club_id = v_other.id) = 'owner',
                   'whoever starts a club becomes its owner');
  insert into public.books (club_id, title, author, month, status)
  values (v_other.id, 'Rebecca', 'Daphne du Maurier', '2026-11-01', 'current')
  returning id into v_book;
  perform tests.ok(v_book is not null, 'an owner can add a book');

  perform tests.act_as(tests.kai());
  select count(*) into n from public.books where club_id = v_other.id;
  perform tests.ok(n = 0, 'members of one club cannot see another club''s books');
  select count(*) into n from public.profiles where id = 'e0000000-0000-4000-8000-000000000002';
  perform tests.ok(n = 0, 'you cannot see profiles of people you share no club with');
  select count(*) into n from public.profiles where id = tests.avery();
  perform tests.ok(n = 1, 'you can see your clubmates'' profiles');
  begin
    insert into public.discussion_topics (club_id, book_id, body) values (v_other.id, v_book, 'sneaky');
    perform tests.ok(false, 'you cannot post in a club you are not in');
  exception when insufficient_privilege then
    perform tests.ok(true, 'you cannot post in a club you are not in');
  end;
  perform tests.reset();
end $$;

-- Books moving through the year ---------------------------------------------------------
do $$
declare
  v_next uuid;
  n int;
begin
  perform tests.act_as(tests.avery());
  insert into public.books (club_id, title, author, month, mood_color)
  values (tests.club(), 'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', '2026-12-01', '#2f4a5a')
  returning id into v_next;

  insert into public.books (club_id, title, author, month)
  values (tests.club(), 'A second December book', 'Someone', '2026-12-01');
  perform tests.ok((select count(*) from public.books where club_id = tests.club() and month = '2026-12-01') = 2,
                   'a club can have more than one book in a month');

  perform public.start_book(v_next);
  select count(*) into n from public.books where club_id = tests.club() and status = 'current';
  perform tests.ok(n = 1, 'starting a new book leaves exactly one current book');
  perform tests.ok((select status from public.books where id = tests.recursion_book()) = 'finished',
                   'the previous book moves to the shelf');
  perform tests.ok((select count(*) from public.club_members where club_id = tests.club() and current_page is not null) = 0,
                   'everyone''s bookmark resets for the new book');

  delete from public.club_members where club_id = tests.club() and user_id = tests.avery();
  perform tests.ok(exists (select 1 from public.club_members where club_id = tests.club() and user_id = tests.avery()),
                   'the owner cannot accidentally leave their own club');

  begin
    perform public.set_member_role(tests.club(), tests.avery(), 'member');
    perform tests.ok(false, 'the last owner cannot step down');
  exception when check_violation then
    perform tests.ok(true, 'the last owner cannot step down');
  end;

  perform public.set_member_role(tests.club(), tests.maya(), 'admin');
  perform tests.act_as(tests.maya());
  update public.books set meeting_place = 'Maya''s porch' where id = v_next;
  perform tests.ok((select meeting_place from public.books where id = v_next) = 'Maya''s porch',
                   'an admin can edit book details');
  perform tests.reset();
end $$;

-- Ratings, RSVPs and the book overview --------------------------------------------------
do $$
begin
  perform tests.act_as(tests.kai());
  insert into public.ratings (club_id, book_id, stars) values (tests.club(), tests.unknown_book(), 4.5);
  perform tests.act_as(tests.maya());
  insert into public.ratings (club_id, book_id, stars) values (tests.club(), tests.unknown_book(), 4);
  begin
    insert into public.ratings (club_id, book_id, stars) values (tests.club(), tests.recursion_book(), 4.3);
    perform tests.ok(false, 'ratings are whole or half stars');
  exception when check_violation then
    perform tests.ok(true, 'ratings are whole or half stars');
  end;
  perform tests.ok((select avg_rating = 4.3 and rating_count = 2 and my_rating = 4
                    from public.book_overview where id = tests.unknown_book()),
                   'the overview averages ratings and shows mine');

  insert into public.rsvps (club_id, book_id, status) values (tests.club(), tests.recursion_book(), 'going')
  on conflict (book_id, user_id) do update set status = excluded.status;
  perform tests.ok((select going_count = 2 and my_rsvp = 'going'
                    from public.book_overview where id = tests.recursion_book()),
                   'RSVPs count toward who''s coming');
  perform tests.reset();
end $$;

-- Photos ---------------------------------------------------------------------------------
do $$
declare
  v_path text := 'c0000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/fog.jpg';
  n int;
begin
  perform tests.act_as(tests.kai());
  insert into storage.objects (bucket_id, name) values ('club-photos', v_path);
  insert into public.photos (club_id, book_id, storage_path, caption, is_cover)
  values (tests.club(), tests.unknown_book(), v_path, 'fog rolling over the lake', true);
  perform tests.ok((select cover_path from public.book_overview where id = tests.unknown_book()) = v_path,
                   'a member can upload a photo and set it as the cover');

  begin
    insert into public.photos (club_id, book_id, storage_path)
    values (tests.club(), tests.unknown_book(), 'some-other-club/fog.jpg');
    perform tests.ok(false, 'a photo row must point inside its own club''s folder');
  exception when check_violation then
    perform tests.ok(true, 'a photo row must point inside its own club''s folder');
  end;

  perform tests.act_as('e0000000-0000-4000-8000-000000000002');
  select count(*) into n from storage.objects where name = v_path;
  perform tests.ok(n = 0, 'people outside the club cannot see its photo files');
  begin
    insert into storage.objects (bucket_id, name)
    values ('club-photos', 'c0000000-0000-4000-8000-000000000001/b0000000-0000-4000-8000-000000000001/x.jpg');
    perform tests.ok(false, 'people outside the club cannot upload into it');
  exception when insufficient_privilege then
    perform tests.ok(true, 'people outside the club cannot upload into it');
  end;
  perform tests.reset();
end $$;

do $$ begin raise notice 'All permission checks passed.'; end $$;
rollback;
