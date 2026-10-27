-- Margins: core schema
-- A club reads one book a month. Members keep a running list of things to
-- discuss ("the table"), and every finished book keeps its notes, quotes,
-- photos and ratings on the club's shelf.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role  as enum ('owner', 'admin', 'member');
create type public.book_status  as enum ('upcoming', 'current', 'finished');
create type public.topic_status as enum ('open', 'discussed');
create type public.rsvp_status  as enum ('going', 'maybe', 'not_going');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Eight characters, no look-alikes (no 0/O, 1/I/L), e.g. "K7QM3XPA".
create or replace function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                  (get_byte(b, i) % 31) + 1, 1), '')
  from (select uuid_send(gen_random_uuid()) as b) as r,
       generate_series(0, 7) as i;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- People and clubs
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  avatar_path   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.clubs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 80),
  description   text check (char_length(description) <= 500),
  invite_code   text not null unique default public.new_invite_code(),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.club_members (
  club_id       uuid not null references public.clubs (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          public.member_role not null default 'member',
  -- Each member's own bookmark in the current book. Used to hide
  -- discussion topics from pages they haven't reached yet.
  current_page  integer check (current_page >= 0),
  joined_at     timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

-- ---------------------------------------------------------------------------
-- Books
-- ---------------------------------------------------------------------------
create table public.books (
  id                 uuid primary key default gen_random_uuid(),
  club_id            uuid not null references public.clubs (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  author             text not null check (char_length(author) between 1 and 200),
  published_year     integer check (published_year between 0 and 3000),
  page_count         integer check (page_count > 0),
  -- The month the club reads it, stored as the first day of that month.
  month              date not null check (extract(day from month) = 1),
  status             public.book_status not null default 'upcoming',
  meeting_at         timestamptz,
  meeting_place      text check (char_length(meeting_place) <= 200),
  note               text check (char_length(note) <= 1000),
  -- The book's color mood on the site and app, e.g. #a8566d.
  mood_color         text check (mood_color ~ '^#[0-9a-fA-F]{6}$'),
  -- The group bookmark: "read through p. 60 before we meet".
  read_through_page  integer check (read_through_page >= 0),
  read_through_note  text check (char_length(read_through_note) <= 300),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, club_id),
  unique (club_id, month),
  check (read_through_page is null or page_count is null or read_through_page <= page_count)
);
-- Only one book per club can be the current read.
create unique index books_one_current_per_club
  on public.books (club_id) where status = 'current';

-- ---------------------------------------------------------------------------
-- The table: things to discuss
-- ---------------------------------------------------------------------------
create table public.discussion_topics (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null,
  book_id       uuid not null,
  author_id     uuid references public.profiles (id) on delete set null,
  body          text not null check (char_length(body) between 1 and 1000),
  page          integer check (page >= 0),
  status        public.topic_status not null default 'open',
  discussed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, club_id),
  foreign key (book_id, club_id) references public.books (id, club_id) on delete cascade
);
create index discussion_topics_book_idx on public.discussion_topics (book_id, status);

-- "Me too": members agreeing a topic is worth bringing up.
create table public.topic_votes (
  topic_id    uuid not null,
  club_id     uuid not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (topic_id, user_id),
  foreign key (topic_id, club_id) references public.discussion_topics (id, club_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- What a finished book keeps
-- ---------------------------------------------------------------------------
create table public.quotes (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null,
  book_id     uuid not null,
  added_by    uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 600),
  page        integer check (page >= 0),
  speaker     text check (char_length(speaker) <= 100),
  created_at  timestamptz not null default now(),
  foreign key (book_id, club_id) references public.books (id, club_id) on delete cascade
);

create table public.meeting_notes (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null,
  book_id     uuid not null,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (book_id, club_id) references public.books (id, club_id) on delete cascade
);

create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null,
  book_id       uuid not null,
  uploaded_by   uuid references public.profiles (id) on delete set null,
  -- Path inside the "club-photos" bucket: <club_id>/<book_id>/<file>
  storage_path  text not null unique,
  caption       text check (char_length(caption) <= 200),
  -- Yellow subtitle text shown over the photo.
  subtitle      text check (char_length(subtitle) <= 300),
  is_cover      boolean not null default false,
  created_at    timestamptz not null default now(),
  foreign key (book_id, club_id) references public.books (id, club_id) on delete cascade,
  check (storage_path like club_id::text || '/' || book_id::text || '/%')
);
create unique index photos_one_cover_per_book on public.photos (book_id) where is_cover;

create table public.ratings (
  club_id     uuid not null,
  book_id     uuid not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- Half stars allowed: 0.5 to 5.0
  stars       numeric(2,1) not null check (stars between 0.5 and 5 and stars * 2 = floor(stars * 2)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (book_id, user_id),
  foreign key (book_id, club_id) references public.books (id, club_id) on delete cascade
);

create table public.rsvps (
  club_id     uuid not null,
  book_id     uuid not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      public.rsvp_status not null,
  updated_at  timestamptz not null default now(),
  primary key (book_id, user_id),
  foreign key (book_id, club_id) references public.books (id, club_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------
create trigger profiles_touch          before update on public.profiles          for each row execute function public.touch_updated_at();
create trigger clubs_touch             before update on public.clubs             for each row execute function public.touch_updated_at();
create trigger books_touch             before update on public.books             for each row execute function public.touch_updated_at();
create trigger discussion_topics_touch before update on public.discussion_topics for each row execute function public.touch_updated_at();
create trigger meeting_notes_touch     before update on public.meeting_notes     for each row execute function public.touch_updated_at();
create trigger ratings_touch           before update on public.ratings           for each row execute function public.touch_updated_at();
create trigger rsvps_touch             before update on public.rsvps             for each row execute function public.touch_updated_at();

-- Stamp when a topic gets talked about (and clear it if reopened).
create or replace function public.stamp_discussed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'discussed' and (tg_op = 'INSERT' or old.status <> 'discussed') then
    new.discussed_at := now();
  elsif new.status = 'open' then
    new.discussed_at := null;
  end if;
  return new;
end;
$$;

create trigger discussion_topics_discussed_at
  before insert or update of status on public.discussion_topics
  for each row execute function public.stamp_discussed_at();
