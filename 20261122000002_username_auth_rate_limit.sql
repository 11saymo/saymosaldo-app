-- Server-side rate limiting for username-auth registration and password recovery.
-- The Edge Function passes a SHA-256 hash of the trusted Cloudflare client IP.
-- Production contract: at most 5 attempts per IP hash in any rolling 10-minute window.
-- The table and RPC are server-only; browser roles have no direct access.

create table if not exists public.username_auth_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists username_auth_rate_limits_created_at_idx
  on public.username_auth_rate_limits (created_at);

create index if not exists username_auth_rate_limits_ip_created_idx
  on public.username_auth_rate_limits (ip_hash, created_at desc);

alter table public.username_auth_rate_limits enable row level security;
revoke all on table public.username_auth_rate_limits from public, anon, authenticated;
grant all on table public.username_auth_rate_limits to service_role;

create or replace function public.consume_username_registration_attempt(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_ip_hash is null or length(p_ip_hash) <> 64
     or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid IP hash';
  end if;

  -- Serialize attempts from the same IP so concurrent requests cannot race
  -- past the limit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_ip_hash, 0)
  );

  -- Retain only a short rolling history of hashed IPs.
  delete from public.username_auth_rate_limits
  where created_at < pg_catalog.now() - interval '24 hours';

  insert into public.username_auth_rate_limits (ip_hash)
  values (p_ip_hash);

  select count(*)::integer
    into v_count
  from public.username_auth_rate_limits
  where ip_hash = p_ip_hash
    and created_at >= pg_catalog.now() - interval '10 minutes';

  return v_count <= 5;
end;
$$;

revoke all on function public.consume_username_registration_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_username_registration_attempt(text) to service_role;

comment on function public.consume_username_registration_attempt(text) is
  'Server-only rolling rate limiter for username-auth registration and password recovery: five attempts per IP hash per ten minutes.';
