-- Minimal Supabase identity contract for isolated PostgreSQL policy tests.
-- This fixture does not test JWT signatures or the Auth service.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated;
