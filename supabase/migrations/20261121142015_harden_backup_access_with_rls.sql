-- Allow authenticated users to read only their own backup metadata/data
-- and create only their own pre-restore checkpoints. RPCs run as invokers.
drop policy if exists users_read_own_backups on public.user_data_backups;
create policy users_read_own_backups
  on public.user_data_backups
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists users_create_restore_checkpoint on public.user_data_backups;
create policy users_create_restore_checkpoint
  on public.user_data_backups
  for insert to authenticated
  with check ((select auth.uid()) = user_id and backup_type = 'before_restore');

grant select, insert on table public.user_data_backups to authenticated;
grant usage, select on sequence public.user_data_backups_id_seq to authenticated;

create or replace function public.list_my_data_backups()
returns table (id bigint, created_at timestamptz, backup_type text)
language plpgsql
security invoker
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

create or replace function public.restore_my_data_backup(p_backup_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_restore_data jsonb;
  v_current_data jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select b.data into v_restore_data
  from public.user_data_backups b
  where b.id = p_backup_id and b.user_id = v_user_id;
  if not found then raise exception 'Backup not found'; end if;
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
    set data = excluded.data, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.list_my_data_backups() from public, anon;
grant execute on function public.list_my_data_backups() to authenticated;
revoke all on function public.restore_my_data_backup(bigint) from public, anon;
grant execute on function public.restore_my_data_backup(bigint) to authenticated;
