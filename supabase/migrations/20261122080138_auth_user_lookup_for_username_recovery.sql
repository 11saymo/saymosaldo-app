create or replace function public.find_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, auth
as $function$
  select id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
$function$;

revoke all on function public.find_auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_id_by_email(text) to service_role;

comment on function public.find_auth_user_id_by_email(text) is
  'Server-only exact email lookup for the username recovery Edge Function. Returns only the auth user UUID.';
