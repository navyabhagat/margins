-- Meeting schedule tests. Same setup as permissions.sql (migrations + seed).
\set ON_ERROR_STOP 1
begin;
create function pg_temp.ok(c boolean, n text) returns void language plpgsql as $$
begin if c is distinct from true then raise exception 'FAILED - %', n; end if; raise notice 'ok - %', n; end $$;

do $$
declare
  club uuid := 'c0000000-0000-4000-8000-000000000001';
  ny text := 'America/New_York';
  -- Thursday Oct 29 2026, 3pm in New York
  thu timestamptz := '2026-10-29 15:00' ::timestamp at time zone 'America/New_York';
  tue7 timestamptz := '2026-11-03 19:00' ::timestamp at time zone 'America/New_York';
begin
  perform pg_temp.ok(public.next_meeting(club, thu) is null, 'no schedule means no next meeting');

  update public.clubs set meet_frequency = 'weekly', meet_weekday = 2, meet_time = '19:00' where id = club;
  perform pg_temp.ok(public.next_meeting(club, thu) = tue7, 'weekly Tuesdays: next is Tuesday Nov 3, 7pm');
  perform pg_temp.ok(public.next_meeting(club, tue7 - interval '1 hour') = tue7, 'on the day, before the meeting: today');
  perform pg_temp.ok(public.next_meeting(club, tue7 + interval '1 minute') = tue7 + interval '7 days', 'on the day, after it starts: next week');

  update public.clubs set meet_frequency = 'biweekly', meet_anchor = '2026-10-27' where id = club;
  perform pg_temp.ok(public.next_meeting(club, thu) = tue7 + interval '7 days', 'every other Tuesday from Oct 27: next is Nov 10');
  update public.clubs set meet_anchor = '2026-11-03' where id = club;
  perform pg_temp.ok(public.next_meeting(club, thu) = tue7, 'every other Tuesday from Nov 3: next is Nov 3');
  update public.clubs set meet_anchor = '2027-01-19' where id = club;
  perform pg_temp.ok(public.next_meeting(club, thu) = tue7 + interval '7 days', 'an anchor in the future still keeps the rhythm');

  update public.clubs set meet_frequency = 'monthly', meet_week_of_month = 1, meet_anchor = null where id = club;
  perform pg_temp.ok(public.next_meeting(club, thu) = tue7, 'first Tuesday of the month: Nov 3');
  update public.clubs set meet_week_of_month = -1 where id = club;
  perform pg_temp.ok(public.next_meeting(club, thu) = '2026-11-24 19:00'::timestamp at time zone ny, 'last Tuesday of the month: Nov 24');
  update public.clubs set meet_week_of_month = 4 where id = club;
  perform pg_temp.ok(public.next_meeting(club, thu) = '2026-11-24 19:00'::timestamp at time zone ny, 'fourth Tuesday: Oct 27 has passed, so Nov 24');

  begin
    update public.clubs set meet_frequency = 'biweekly', meet_anchor = null where id = club;
    perform pg_temp.ok(false, 'every other week needs a start date');
  exception when check_violation then
    perform pg_temp.ok(true, 'every other week needs a start date');
  end;
end $$;

-- Members can set the schedule only as admins, and RSVP for a date.
do $$
declare club uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);  -- Kai, member
  execute 'set local role authenticated';
  update public.clubs set meet_place = 'my place' where id = club;
  execute 'reset role';
  perform pg_temp.ok((select meet_place from public.clubs where id = club) is null, 'members cannot change the schedule');

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);  -- Avery, owner
  execute 'set local role authenticated';
  update public.clubs set meet_frequency = 'weekly', meet_weekday = 2, meet_time = '19:00', meet_place = 'the long table' where id = club;
  execute 'reset role';
  perform pg_temp.ok((select meet_place from public.clubs where id = club) = 'the long table', 'owners can set the schedule');

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
  execute 'set local role authenticated';
  insert into public.meeting_rsvps (club_id, meeting_on, status) values (club, '2026-11-03', 'going');
  update public.meeting_rsvps set status = 'maybe' where club_id = club and meeting_on = '2026-11-03' and user_id = 'a0000000-0000-4000-8000-000000000002';
  perform pg_temp.ok((select status from public.meeting_rsvps where meeting_on = '2026-11-03') = 'maybe', 'a member can RSVP for a meeting date and change it');
  perform pg_temp.ok((select next_meeting_at is not null and meet_place = 'the long table' from public.my_clubs where id = club), 'my_clubs shows the schedule and next meeting');
  begin
    insert into public.meeting_rsvps (club_id, meeting_on, status, user_id) values (club, '2026-11-03', 'going', 'a0000000-0000-4000-8000-000000000003');
    perform pg_temp.ok(false, 'you cannot RSVP for someone else');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'you cannot RSVP for someone else');
  end;
  execute 'reset role';
end $$;
do $$ begin raise notice 'All schedule checks passed.'; end $$;
rollback;
