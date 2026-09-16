create index if not exists study_sessions_config_idx on public.study_sessions(experiment_config_id);
create index if not exists audit_events_admin_idx on public.audit_events(admin_user_id);

drop policy if exists admin_profile_self_read on public.admin_profiles;
create policy admin_profile_self_read on public.admin_profiles
for select to authenticated
using (auth_user_id = (select auth.uid()) or public.is_ideon_admin());
