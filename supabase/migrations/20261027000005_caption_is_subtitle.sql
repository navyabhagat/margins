-- A photo's caption is now what shows in yellow over the photo, so the
-- separate subtitle field goes away. Any subtitle already written is kept
-- as the caption when the photo didn't have one.

update public.photos
set caption = left(subtitle, 300)
where subtitle is not null and (caption is null or caption = '');

alter table public.photos drop column subtitle;

alter table public.photos drop constraint if exists photos_caption_check;
alter table public.photos add constraint photos_caption_check check (char_length(caption) <= 300);

comment on column public.photos.caption is 'Shown in yellow over the photo, like a film subtitle.';
