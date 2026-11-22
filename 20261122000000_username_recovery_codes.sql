create table if not exists public.username_recovery_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.username_recovery_codes enable row level security;
revoke all on table public.username_recovery_codes from public, anon, authenticated;
grant all on table public.username_recovery_codes to service_role;

comment on table public.username_recovery_codes is
  'Stores only SHA-256 hashes of one-time displayed account recovery codes. Access is restricted to service_role.';
