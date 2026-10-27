-- A club can read more than one book in a month. Only one book is the
-- current read at a time (books_one_current_per_club still applies).
alter table public.books drop constraint if exists books_club_id_month_key;
create index if not exists books_club_month_idx on public.books (club_id, month);
