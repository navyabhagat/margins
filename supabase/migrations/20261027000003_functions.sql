-- Margins: actions the app calls, and read-friendly views.

-- ---------------------------------------------------------------------------
-- Clubs
-- ---------------------------------------------------------------------------

-- Start a club. The creator becomes its owner.
create or replace function public.create_club(p_name text, p_description text default null)
returns public.clubs
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_club public.clubs;
begin
  if v_user is null then
    raise exception 'Sign in to start a club' using errcode = '28000';
  end if;

  insert into public.clubs (name, description, created_by)
  values (trim(p_name), nullif(trim(p_description), ''), v_user)
  returning * into v_club;

  insert into public.club_members (club_id, user_id, role)
  values (v_club.id, v_user, 'owner');

  return v_club;
end;
$$;

-- Join a club with its invite code. Joining twice is harmless.
create or replace function public.join_club(p_code text)
returns public.clubs
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_club public.clubs;
begin
  if v_user is null then
    raise exception 'Sign in to join a club' using errcode = '28000';
  end if;

  select * into v_club
  from public.clubs
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if not found then
    raise exception 'That invite code doesn''t match a club. Check it with whoever invited you.'
      using errcode = 'P0002';
  end if;

  insert into public.club_members (club_id, user_id, role)
  values (v_club.id, v_user, 'member')
  on conflict (club_id, user_id) do nothing;

  return v_club;
end;
$$;

-- Issue a new invite code (the old one stops working).
create or replace function public.regenerate_invite_code(p_club uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.is_admin(p_club) then
    raise exception 'Only the club''s owner or admins can change the invite code' using errcode = '42501';
  end if;
  update public.clubs set invite_code = public.new_invite_code()
  where id = p_club
  returning invite_code into v_code;
  return v_code;
end;
$$;

-- Owners promote members to admin, demote admins, or hand over ownership.
create or replace function public.set_member_role(p_club uuid, p_user uuid, p_role public.member_role)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_current public.member_role;
begin
  if not private.is_owner(p_club) then
    raise exception 'Only the club''s owner can change roles' using errcode = '42501';
  end if;

  select role into v_current from public.club_members
  where club_id = p_club and user_id = p_user;
  if not found then
    raise exception 'That person isn''t in this club' using errcode = 'P0002';
  end if;

  if v_current = 'owner' and p_role <> 'owner' and
     (select count(*) from public.club_members where club_id = p_club and role = 'owner') = 1 then
    raise exception 'A club needs at least one owner. Make someone else an owner first.' using errcode = '23514';
  end if;

  update public.club_members set role = p_role
  where club_id = p_club and user_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Books
-- ---------------------------------------------------------------------------

-- Make a book this month's read. The previous current book is moved to the
-- shelf as finished, and everyone's personal bookmark resets.
create or replace function public.start_book(p_book uuid)
returns public.books
language plpgsql security definer
set search_path = ''
as $$
declare
  v_book public.books;
begin
  select * into v_book from public.books where id = p_book;
  if not found or not private.is_admin(v_book.club_id) then
    raise exception 'Only the club''s owner or admins can change the current book' using errcode = '42501';
  end if;

  update public.books set status = 'finished'
  where club_id = v_book.club_id and status = 'current' and id <> p_book;

  update public.books set status = 'current'
  where id = p_book
  returning * into v_book;

  update public.club_members set current_page = null
  where club_id = v_book.club_id;

  return v_book;
end;
$$;

-- Move the current book to the shelf.
create or replace function public.finish_book(p_book uuid)
returns public.books
language plpgsql security definer
set search_path = ''
as $$
declare
  v_book public.books;
begin
  select * into v_book from public.books where id = p_book;
  if not found or not private.is_admin(v_book.club_id) then
    raise exception 'Only the club''s owner or admins can finish a book' using errcode = '42501';
  end if;

  update public.books set status = 'finished'
  where id = p_book
  returning * into v_book;
  return v_book;
end;
$$;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

-- Any member can tick a topic off during the meeting (or reopen it).
create or replace function public.set_topic_status(p_topic uuid, p_status public.topic_status)
returns public.discussion_topics
language plpgsql security definer
set search_path = ''
as $$
declare
  v_topic public.discussion_topics;
begin
  select * into v_topic from public.discussion_topics where id = p_topic;
  if not found or not private.is_member(v_topic.club_id) then
    raise exception 'Topic not found' using errcode = 'P0002';
  end if;

  update public.discussion_topics set status = p_status
  where id = p_topic
  returning * into v_topic;
  return v_topic;
end;
$$;

-- Add or remove your "me too". Returns true if you now agree.
create or replace function public.toggle_topic_vote(p_topic uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_club uuid;
begin
  select club_id into v_club from public.discussion_topics where id = p_topic;
  if v_club is null or not private.is_member(v_club) then
    raise exception 'Topic not found' using errcode = 'P0002';
  end if;

  delete from public.topic_votes where topic_id = p_topic and user_id = v_user;
  if found then
    return false;
  end if;

  insert into public.topic_votes (topic_id, club_id, user_id) values (p_topic, v_club, v_user);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.create_club(text, text)                                   from public, anon;
revoke execute on function public.join_club(text)                                            from public, anon;
revoke execute on function public.regenerate_invite_code(uuid)                               from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, public.member_role)            from public, anon;
revoke execute on function public.start_book(uuid)                                           from public, anon;
revoke execute on function public.finish_book(uuid)                                          from public, anon;
revoke execute on function public.set_topic_status(uuid, public.topic_status)                from public, anon;
revoke execute on function public.toggle_topic_vote(uuid)                                    from public, anon;
revoke execute on function public.new_invite_code()                                          from public, anon, authenticated;

grant execute on function public.create_club(text, text)                                    to authenticated;
grant execute on function public.join_club(text)                                             to authenticated;
grant execute on function public.regenerate_invite_code(uuid)                                to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.member_role)             to authenticated;
grant execute on function public.start_book(uuid)                                            to authenticated;
grant execute on function public.finish_book(uuid)                                           to authenticated;
grant execute on function public.set_topic_status(uuid, public.topic_status)                 to authenticated;
grant execute on function public.toggle_topic_vote(uuid)                                     to authenticated;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: they only show what the reader may see)
-- ---------------------------------------------------------------------------

-- "Your clubs" on the join screen.
create view public.my_clubs
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.description,
  c.invite_code,
  m.role,
  m.current_page,
  (select count(*) from public.club_members cm where cm.club_id = c.id)::int as member_count,
  cur.id          as current_book_id,
  cur.title       as current_book_title,
  cur.meeting_at  as current_meeting_at
from public.clubs c
join public.club_members m on m.club_id = c.id and m.user_id = (select auth.uid())
left join public.books cur on cur.club_id = c.id and cur.status = 'current';

-- A book with everything the "this month", shelf and past-book screens show.
create view public.book_overview
with (security_invoker = true) as
select
  b.*,
  (select round(avg(r.stars), 1) from public.ratings r where r.book_id = b.id)                 as avg_rating,
  (select count(*) from public.ratings r where r.book_id = b.id)::int                         as rating_count,
  (select r.stars from public.ratings r where r.book_id = b.id and r.user_id = (select auth.uid())) as my_rating,
  (select count(*) from public.discussion_topics t where t.book_id = b.id and t.status = 'open')::int      as open_topic_count,
  (select count(*) from public.discussion_topics t where t.book_id = b.id and t.status = 'discussed')::int as discussed_topic_count,
  (select count(*) from public.photos p where p.book_id = b.id)::int                          as photo_count,
  (select count(*) from public.quotes q where q.book_id = b.id)::int                          as quote_count,
  (select count(*) from public.rsvps v where v.book_id = b.id and v.status = 'going')::int    as going_count,
  (select v.status from public.rsvps v where v.book_id = b.id and v.user_id = (select auth.uid())) as my_rsvp,
  (select p.storage_path from public.photos p where p.book_id = b.id and p.is_cover)          as cover_path
from public.books b;

-- The table, with vote counts and a spoiler flag for topics past your page.
create view public.topic_feed
with (security_invoker = true) as
select
  t.*,
  pr.display_name as author_name,
  (select count(*) from public.topic_votes v where v.topic_id = t.id)::int as vote_count,
  exists (select 1 from public.topic_votes v
          where v.topic_id = t.id and v.user_id = (select auth.uid()))     as voted_by_me,
  (t.page is not null and m.current_page is not null and t.page > m.current_page) as is_ahead_of_me
from public.discussion_topics t
left join public.profiles pr on pr.id = t.author_id
left join public.club_members m on m.club_id = t.club_id and m.user_id = (select auth.uid());

grant select on public.my_clubs, public.book_overview, public.topic_feed to authenticated;
revoke all on public.my_clubs, public.book_overview, public.topic_feed from anon;

-- Live updates for the table during a meeting.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.discussion_topics, public.topic_votes;
  end if;
end;
$$;
