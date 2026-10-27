-- Minimal stand-in for the pieces of Supabase the migrations rely on, so the
-- schema and permission tests can run against a plain Postgres without
-- Docker. Not used by a real Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
  instance_id         uuid,
  id                  uuid primary key,
  aud                 text,
  role                text,
  email               text,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb,
  raw_user_meta_data  jsonb,
  confirmation_token  text,
  recovery_token      text,
  email_change_token_new text,
  email_change        text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table auth.identities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete cascade,
  provider_id      text,
  identity_data    jsonb,
  provider         text,
  last_sign_in_at  timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz
);

create schema extensions;
create extension pgcrypto schema extensions;

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner_id text default (auth.uid())::text
);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to authenticated;

create publication supabase_realtime;
