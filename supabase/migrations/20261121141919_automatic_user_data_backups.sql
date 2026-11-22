-- Automatic, per-account snapshots of cloud financial data.
-- One snapshot is kept per 24-hour window with data changes; at most 30 per account.

create table if not exists public.user_data_backups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  backup_type text not null default 'automatic'
    check (backup_type in ('automatic', 'before_restore')),
  created_at timestamptz not null default now()
);

create index if not exists user_data_backups_user_created_idx
  on public.user_data_backups (user_id, created_at desc);

alter table public.user_data_backups enable row level security;
revoke all on table public.user_data_backups from public, anon, authenticated;

create or replace function public.capture_user_data_backup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_data jsonb;
  v_now timestamptz := pg_catalog.now();
begin
  if tg_op = 'INSERT' then
    v_user_id := new.user_id;
    v_data := new.data;
  else
    if old.data is not distinct from new.data then
      return new;
    end if;
    v_user_id := old.user_id;
    v_data := old.data;
  end if;

  if auth.uid() is not null and auth.uid() is distinct from v_user_id then
    raise exception 'Backup owner mismatch';
  end if;

  if not exists (
    select 1 from public.user_data_backups b
    where b.user_id = v_user_id
      and b.created_at > v_now - interval '24 hours'
  ) then
    insert into public.user_data_backups (user_id, data, backup_type, created_at)
    values (v_user_id, v_data, 'automatic', v_now);
  end if;

  delete from public.user_data_backups
  where id in (
    select id from public.user_data_backups
    where user_id = v_user_id
    order by created_at desc, id desc
    offset 30
  );

  return new;
end;
$$;

revoke all on function public.capture_user_data_backup() from public, anon, authenticated;

drop trigger if exists user_data_auto_backup on public.user_data;
create trigger user_data_auto_backup
after insert or update on public.user_data
for each row execute function public.capture_user_data_backup();

-- Preserve the currently stored version for accounts that already exist.
insert into public.user_data_backups (user_id, data, backup_type)
select u.user_id, u.data, 'automatic'
from public.user_data u
where not exists (
  select 1 from public.user_data_backups b where b.user_id = u.user_id
);

create or replace function public.list_my_data_backups()
returns table (id bigint, created_at timestamptz, backup_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select b.id, b.created_at, b.backup_type
  from public.user_data_backups b
  where b.user_id = v_user_id
  order by b.created_at desc
  limit 30;
end;
$$;

revoke all on function public.list_my_data_backups() from public, anon;
grant execute on function public.list_my_data_backups() to authenticated;

create or replace function public.restore_my_data_backup(p_backup_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_restore_data jsonb;
  v_current_data jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select b.data into v_restore_data
  from public.user_data_backups b
  where b.id = p_backup_id and b.user_id = v_user_id;

  if not found then
    raise exception 'Backup not found';
  end if;

  select u.data into v_current_data
  from public.user_data u
  where u.user_id = v_user_id
  for update;

  if found then
    insert into public.user_data_backups (user_id, data, backup_type)
    values (v_user_id, v_current_data, 'before_restore');
  end if;

  insert into public.user_data (user_id, data, updated_at)
  values (v_user_id, v_restore_data, pg_catalog.now())
  on conflict (user_id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at;

  delete from public.user_data_backups
  where id in (
    select id from public.user_data_backups
    where user_id = v_user_id
    order by created_at desc, id desc
    offset 30
  );
end;
$$;

revoke all on function public.restore_my_data_backup(bigint) from public, anon;
grant execute on function public.restore_my_data_backup(bigint) to authenticated;
