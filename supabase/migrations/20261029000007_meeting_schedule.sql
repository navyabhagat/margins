-- Margins: a regular meeting schedule for each club.
-- "Every Tuesday at 7pm", "every other Tuesday", or "the first Tuesday of the
-- month". The app shows the next meeting from it, and RSVPs are for that date.

alter table public.clubs
  add column meet_frequency     text check (meet_frequency in ('weekly', 'biweekly', 'monthly')),
  add column meet_weekday       smallint check (meet_weekday between 0 and 6),          -- 0 = Sunday
  add column meet_week_of_month smallint check (meet_week_of_month in (1, 2, 3, 4, -1)), -- monthly; -1 = last
  add column meet_time          time,
  add column meet_timezone      text not null default 'America/New_York',
  add column meet_anchor        date,   -- every other week: one date the club meets
  add column meet_place         text check (char_length(meet_place) <= 200),
  add constraint clubs_schedule_complete check (
    meet_frequency is null
    or (meet_weekday is not null and meet_time is not null
        and (meet_frequency <> 'monthly' or meet_week_of_month is not null)
        and (meet_frequency <> 'biweekly' or meet_anchor is not null))
  );

grant update (meet_frequency, meet_weekday, meet_week_of_month, meet_time, meet_timezone, meet_anchor, meet_place)
  on public.clubs to authenticated;

-- The next scheduled meeting at or after p_from (default: now), or null when
-- the club has no regular schedule. Readers only see clubs they belong to.
create or replace function public.next_meeting(p_club uuid, p_from timestamptz default now())
returns timestamptz
language plpgsql stable
set search_path = ''
as $$
declare
  c          public.clubs;
  local_now  timestamp;
  today      date;
  candidate  date;
  month_start date;
  i          int;
begin
  select * into c from public.clubs where id = p_club;
  if not found or c.meet_frequency is null then
    return null;
  end if;

  local_now := p_from at time zone c.meet_timezone;
  today := local_now::date;

  if c.meet_frequency in ('weekly', 'biweekly') then
    candidate := today + ((c.meet_weekday - extract(dow from today)::int + 7) % 7);
    if candidate = today and c.meet_time <= local_now::time then
      candidate := candidate + 7;
    end if;
    if c.meet_frequency = 'biweekly' then
      -- Keep to the anchor's every-other-week rhythm (works before or after it).
      if (((candidate - c.meet_anchor) / 7) % 2 + 2) % 2 <> 0 then
        candidate := candidate + 7;
      end if;
    end if;
    return (candidate + c.meet_time) at time zone c.meet_timezone;
  end if;

  -- Monthly: the Nth (or last) weekday of this month, else next month's.
  for i in 0..2 loop
    month_start := (date_trunc('month', today) + make_interval(months => i))::date;
    if c.meet_week_of_month = -1 then
      candidate := (month_start + interval '1 month' - interval '1 day')::date;
      candidate := candidate - ((extract(dow from candidate)::int - c.meet_weekday + 7) % 7);
    else
      candidate := month_start + ((c.meet_weekday - extract(dow from month_start)::int + 7) % 7)
                   + (c.meet_week_of_month - 1) * 7;
    end if;
    if candidate > today or (candidate = today and c.meet_time > local_now::time) then
      return (candidate + c.meet_time) at time zone c.meet_timezone;
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.next_meeting(uuid, timestamptz) from public, anon;
grant execute on function public.next_meeting(uuid, timestamptz) to authenticated;

-- RSVPs for a particular meeting date (the club's local date).
create table public.meeting_rsvps (
  club_id     uuid not null references public.clubs (id) on delete cascade,
  meeting_on  date not null,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status      public.rsvp_status not null,
  updated_at  timestamptz not null default now(),
  primary key (club_id, meeting_on, user_id)
);
create trigger meeting_rsvps_touch before update on public.meeting_rsvps
  for each row execute function public.touch_updated_at();

alter table public.meeting_rsvps enable row level security;
revoke all on public.meeting_rsvps from anon;
revoke insert, update, truncate, references, trigger on public.meeting_rsvps from authenticated;
grant select, delete on public.meeting_rsvps to authenticated;
grant insert (club_id, meeting_on, status) on public.meeting_rsvps to authenticated;
grant update (status) on public.meeting_rsvps to authenticated;

create policy "meeting rsvps: members read" on public.meeting_rsvps
  for select to authenticated using (private.is_member(club_id));
create policy "meeting rsvps: answer as yourself" on public.meeting_rsvps
  for insert to authenticated
  with check (private.is_member(club_id) and user_id = (select auth.uid()));
create policy "meeting rsvps: change your answer" on public.meeting_rsvps
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meeting rsvps: remove your answer" on public.meeting_rsvps
  for delete to authenticated using (user_id = (select auth.uid()));

-- my_clubs gains the schedule and the next scheduled meeting.
create or replace view public.my_clubs
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
  cur.meeting_at  as current_meeting_at,
  c.meet_frequency,
  c.meet_weekday,
  c.meet_week_of_month,
  c.meet_time,
  c.meet_timezone,
  c.meet_anchor,
  c.meet_place,
  public.next_meeting(c.id) as next_meeting_at
from public.clubs c
join public.club_members m on m.club_id = c.id and m.user_id = (select auth.uid())
left join public.books cur on cur.club_id = c.id and cur.status = 'current';

grant select on public.my_clubs to authenticated;
