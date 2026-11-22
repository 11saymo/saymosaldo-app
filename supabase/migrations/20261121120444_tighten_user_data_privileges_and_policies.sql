revoke truncate, references, trigger on table public.user_data from authenticated;
grant select, insert, update on table public.user_data to authenticated;

alter policy "own data select" on public.user_data to authenticated
  using ((select auth.uid()) = user_id);

alter policy "own data insert" on public.user_data to authenticated
  with check ((select auth.uid()) = user_id);

alter policy "own data update" on public.user_data to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
