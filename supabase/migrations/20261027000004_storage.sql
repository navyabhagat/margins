-- Margins: private photo storage.
-- Files live at club-photos/<club_id>/<book_id>/<file>. Only members of that
-- club can see or upload them; the uploader or a club admin can remove them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-photos', 'club-photos', false, 15 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "club photos: members view"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'club-photos'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
  );

create policy "club photos: members upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'club-photos'
    and private.is_member(private.try_uuid((storage.foldername(name))[1]))
    and private.try_uuid((storage.foldername(name))[2]) is not null
  );

create policy "club photos: uploader or admin removes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'club-photos'
    and (
      owner_id = (select auth.uid())::text
      or private.is_admin(private.try_uuid((storage.foldername(name))[1]))
    )
  );
