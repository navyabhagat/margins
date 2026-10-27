-- Margins: who can see and change what.
--
-- Rule of thumb: everything in a club is visible only to that club's
-- members. Members add their own topics, votes, quotes, notes, photos,
-- ratings and RSVPs, and can edit or delete their own. Owners and admins
-- manage the club and its books, and can tidy up anything in the club.

-- ---------------------------------------------------------------------------
-- Membership checks (security definer so policies don't recurse into
-- club_members' own policies). Kept out of the API-exposed schema.
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_member(p_club uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_admin(p_club uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

create or replace function private.is_owner(p_club uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

create or replace function private.shares_club(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.club_members mine
    join public.club_members theirs on theirs.club_id = mine.club_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

-- Turns text into a uuid, or null if it isn't one (for storage paths).
create or replace function private.try_uuid(p text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- New sign-ups get a profile automatically.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Reader'
    ), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Turn on row level security everywhere.
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.clubs             enable row level security;
alter table public.club_members      enable row level security;
alter table public.books             enable row level security;
alter table public.discussion_topics enable row level security;
alter table public.topic_votes       enable row level security;
alter table public.quotes            enable row level security;
alter table public.meeting_notes     enable row level security;
alter table public.photos            enable row level security;
alter table public.ratings           enable row level security;
alter table public.rsvps             enable row level security;

-- ---------------------------------------------------------------------------
-- Column-level grants: only the columns people are meant to change can be
-- changed, so nobody can move a topic to another club or promote
-- themselves to owner with a plain update.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, truncate, references, trigger on all tables in schema public from authenticated;

grant select on all tables in schema public to authenticated;

grant update (display_name, avatar_path)                     on public.profiles to authenticated;
grant update (name, description)                             on public.clubs to authenticated;
grant update (current_page)                                  on public.club_members to authenticated;
grant insert (club_id, title, author, published_year, page_count, month, status,
              meeting_at, meeting_place, note, mood_color, read_through_page, read_through_note)
                                                              on public.books to authenticated;
grant update (title, author, published_year, page_count, month, status,
              meeting_at, meeting_place, note, mood_color, read_through_page, read_through_note)
                                                              on public.books to authenticated;
grant insert (club_id, book_id, body, page)                  on public.discussion_topics to authenticated;
grant update (body, page, status)                            on public.discussion_topics to authenticated;
grant insert (topic_id, club_id)                             on public.topic_votes to authenticated;
grant insert (club_id, book_id, body, page, speaker)         on public.quotes to authenticated;
grant update (body, page, speaker)                           on public.quotes to authenticated;
grant insert (club_id, book_id, body)                        on public.meeting_notes to authenticated;
grant update (body)                                          on public.meeting_notes to authenticated;
grant insert (club_id, book_id, storage_path, caption, subtitle, is_cover)
                                                              on public.photos to authenticated;
grant update (caption, subtitle, is_cover)                   on public.photos to authenticated;
grant insert (club_id, book_id, stars)                       on public.ratings to authenticated;
grant update (stars)                                         on public.ratings to authenticated;
grant insert (club_id, book_id, status)                      on public.rsvps to authenticated;
grant update (status)                                        on public.rsvps to authenticated;

-- Who wrote something is always the signed-in person, never a value the
-- app sends.
alter table public.books             alter column created_by  set default auth.uid();
alter table public.discussion_topics alter column author_id   set default auth.uid();
alter table public.topic_votes       alter column user_id     set default auth.uid();
alter table public.quotes            alter column added_by    set default auth.uid();
alter table public.meeting_notes     alter column author_id   set default auth.uid();
alter table public.photos            alter column uploaded_by set default auth.uid();
alter table public.ratings           alter column user_id     set default auth.uid();
alter table public.rsvps             alter column user_id     set default auth.uid();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- Profiles: yourself, plus anyone you share a club with.
create policy "profiles: read self and clubmates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_club(id));
create policy "profiles: edit self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Clubs: created and joined through functions (see functions migration).
create policy "clubs: members read" on public.clubs
  for select to authenticated using (private.is_member(id));
create policy "clubs: admins edit" on public.clubs
  for update to authenticated using (private.is_admin(id)) with check (private.is_admin(id));
create policy "clubs: owners delete" on public.clubs
  for delete to authenticated using (private.is_owner(id));

-- Members: see your clubmates, move your own bookmark, leave a club.
create policy "members: members read" on public.club_members
  for select to authenticated using (private.is_member(club_id));
create policy "members: update own bookmark" on public.club_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "members: leave or be removed" on public.club_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (private.is_admin(club_id) and role = 'member')
  );

-- Books: everyone in the club reads; owners and admins manage.
create policy "books: members read" on public.books
  for select to authenticated using (private.is_member(club_id));
create policy "books: admins add" on public.books
  for insert to authenticated with check (private.is_admin(club_id));
create policy "books: admins edit" on public.books
  for update to authenticated using (private.is_admin(club_id)) with check (private.is_admin(club_id));
create policy "books: admins delete" on public.books
  for delete to authenticated using (private.is_admin(club_id));

-- A reusable shape for things members add themselves.
-- Topics
create policy "topics: members read" on public.discussion_topics
  for select to authenticated using (private.is_member(club_id));
create policy "topics: members add" on public.discussion_topics
  for insert to authenticated
  with check (private.is_member(club_id) and author_id = (select auth.uid()));
create policy "topics: author or admin edits" on public.discussion_topics
  for update to authenticated
  using (author_id = (select auth.uid()) or private.is_admin(club_id))
  with check (private.is_member(club_id));
create policy "topics: author or admin deletes" on public.discussion_topics
  for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_admin(club_id));

-- Votes
create policy "votes: members read" on public.topic_votes
  for select to authenticated using (private.is_member(club_id));
create policy "votes: vote as yourself" on public.topic_votes
  for insert to authenticated
  with check (private.is_member(club_id) and user_id = (select auth.uid()));
create policy "votes: take back your vote" on public.topic_votes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Quotes
create policy "quotes: members read" on public.quotes
  for select to authenticated using (private.is_member(club_id));
create policy "quotes: members add" on public.quotes
  for insert to authenticated
  with check (private.is_member(club_id) and added_by = (select auth.uid()));
create policy "quotes: owner or admin edits" on public.quotes
  for update to authenticated
  using (added_by = (select auth.uid()) or private.is_admin(club_id))
  with check (private.is_member(club_id));
create policy "quotes: owner or admin deletes" on public.quotes
  for delete to authenticated
  using (added_by = (select auth.uid()) or private.is_admin(club_id));

-- Meeting notes
create policy "notes: members read" on public.meeting_notes
  for select to authenticated using (private.is_member(club_id));
create policy "notes: members add" on public.meeting_notes
  for insert to authenticated
  with check (private.is_member(club_id) and author_id = (select auth.uid()));
create policy "notes: author or admin edits" on public.meeting_notes
  for update to authenticated
  using (author_id = (select auth.uid()) or private.is_admin(club_id))
  with check (private.is_member(club_id));
create policy "notes: author or admin deletes" on public.meeting_notes
  for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_admin(club_id));

-- Photos
create policy "photos: members read" on public.photos
  for select to authenticated using (private.is_member(club_id));
create policy "photos: members add" on public.photos
  for insert to authenticated
  with check (private.is_member(club_id) and uploaded_by = (select auth.uid()));
create policy "photos: uploader or admin edits" on public.photos
  for update to authenticated
  using (uploaded_by = (select auth.uid()) or private.is_admin(club_id))
  with check (private.is_member(club_id));
create policy "photos: uploader or admin deletes" on public.photos
  for delete to authenticated
  using (uploaded_by = (select auth.uid()) or private.is_admin(club_id));

-- Ratings and RSVPs: your own, visible to the club.
create policy "ratings: members read" on public.ratings
  for select to authenticated using (private.is_member(club_id));
create policy "ratings: rate as yourself" on public.ratings
  for insert to authenticated
  with check (private.is_member(club_id) and user_id = (select auth.uid()));
create policy "ratings: change your rating" on public.ratings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "ratings: remove your rating" on public.ratings
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "rsvps: members read" on public.rsvps
  for select to authenticated using (private.is_member(club_id));
create policy "rsvps: answer as yourself" on public.rsvps
  for insert to authenticated
  with check (private.is_member(club_id) and user_id = (select auth.uid()));
create policy "rsvps: change your answer" on public.rsvps
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "rsvps: remove your answer" on public.rsvps
  for delete to authenticated using (user_id = (select auth.uid()));

grant delete on public.clubs, public.club_members, public.books, public.discussion_topics,
                public.topic_votes, public.quotes, public.meeting_notes, public.photos,
                public.ratings, public.rsvps
  to authenticated;
