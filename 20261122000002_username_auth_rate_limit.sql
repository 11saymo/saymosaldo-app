-- Rate limiting for the username-auth Edge Function (register / reset_password).
-- The function calls consume_username_registration_attempt(p_ip_hash) with a SHA-256 hash of the client IP.
-- Limit: 20 attempts per IP hash per 10-minute window. Only service_role may call it.

create table if not exists public.username_auth_attempts (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (ip_hash, bucket_start)
);

alter table public.username_auth_attempts enable row level security;
revoke all on table public.username_auth_attempts from public, anon, authenticated;
grant all on table public.username_auth_attempts to service_role;

create or replace function public.consume_username_registration_attempt(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := pg_catalog.date_bin(interval '10 minutes', pg_catalog.now(), timestamptz '2000-01-01 00:00:00+00');
  v_count integer;
begin
  insert into public.username_auth_attempts as a (ip_hash, bucket_start, attempts)
  values (p_ip_hash, v_bucket, 1)
  on conflict (ip_hash, bucket_start)
  do update set attempts = a.attempts + 1
  returning a.attempts into v_count;

  delete from public.username_auth_attempts
  where bucket_start < pg_catalog.now() - interval '1 hour';

  return v_count <= 20;
end;
$$;

revoke all on function public.consume_username_registration_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_username_registration_attempt(text) to service_role;

comment on function public.consume_username_registration_attempt(text) is
  'Server-only rate limiter for the username-auth Edge Function. Returns false when the IP hash exceeds 20 attempts in a 10-minute window.';
