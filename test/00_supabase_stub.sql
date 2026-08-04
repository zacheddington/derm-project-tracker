-- Local-only stub of the Supabase-managed objects the migrations depend
-- on. NOT part of the deployed migrations — Supabase provides all of
-- this. Used to prove the migrations run before they touch a real
-- project.

create schema if not exists auth;

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

grant anon, authenticated, service_role to postgres;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

-- Supabase reads the JWT from a request-local GUC. Same mechanism here,
-- so the RLS policies are exercised exactly as they will be in production.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to authenticated, anon;
