-- The backup trigger performs retention cleanup after an upsert.
-- The invoker RPC does not need DELETE permission on the backup table.
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
revoke all on function public.restore_my_data_backup(bigint) from public, anon;
grant execute on function public.restore_my_data_backup(bigint) to authenticated;
