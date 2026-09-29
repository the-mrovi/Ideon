create or replace function public.is_researcher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles
    where auth_user_id = auth.uid() and role in ('researcher', 'admin')
  );
$$;

create or replace function public.is_ideon_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_profiles
    where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_researcher() from public, anon;
revoke all on function public.is_ideon_admin() from public, anon;

alter table public.participants enable row level security;
alter table public.study_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.strategy_events enable row level security;
alter table public.idea_events enable row level security;
alter table public.final_ideas enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.questionnaire_answers enable row level security;
alter table public.experiment_configs enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.audit_events enable row level security;

create policy researcher_read_participants on public.participants for select to authenticated using (public.is_researcher());
create policy researcher_read_sessions on public.study_sessions for select to authenticated using (public.is_researcher());
create policy researcher_read_messages on public.messages for select to authenticated using (public.is_researcher());
create policy researcher_read_strategy_events on public.strategy_events for select to authenticated using (public.is_researcher());
create policy researcher_read_idea_events on public.idea_events for select to authenticated using (public.is_researcher());
create policy researcher_read_final_ideas on public.final_ideas for select to authenticated using (public.is_researcher());
create policy researcher_read_questionnaire_responses on public.questionnaire_responses for select to authenticated using (public.is_researcher());
create policy researcher_read_questionnaire_answers on public.questionnaire_answers for select to authenticated using (public.is_researcher());
create policy researcher_read_experiment_configs on public.experiment_configs for select to authenticated using (public.is_researcher());
create policy researcher_read_audit_events on public.audit_events for select to authenticated using (public.is_researcher());
create policy admin_profile_self_read on public.admin_profiles for select to authenticated using (auth_user_id = auth.uid() or public.is_ideon_admin());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.participants, public.study_sessions, public.messages, public.strategy_events, public.idea_events,
  public.final_ideas, public.questionnaire_responses, public.questionnaire_answers, public.experiment_configs,
  public.admin_profiles, public.audit_events to authenticated;

create or replace function public.create_study_session(
  p_study_phase text default 'development',
  p_manual_condition text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'extensions'
as $$
declare
  v_config public.experiment_configs%rowtype;
  v_participant public.participants%rowtype;
  v_session public.study_sessions%rowtype;
  v_condition text;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if p_study_phase not in ('development', 'pilot', 'main') then
    raise exception 'invalid_study_phase';
  end if;

  perform pg_advisory_xact_lock(hashtext('ideon_condition_assignment_' || p_study_phase));

  select * into v_config from public.experiment_configs
  where study_phase = p_study_phase and is_active
  order by created_at desc limit 1;

  if v_config.id is null then raise exception 'study_not_configured'; end if;
  if p_study_phase = 'main' and v_config.frozen_at is null then raise exception 'main_config_not_frozen'; end if;

  if v_config.assignment_method = 'manual' then
    if p_manual_condition not in ('fixed', 'random', 'adaptive') then raise exception 'manual_condition_required'; end if;
    v_condition := p_manual_condition;
  elsif v_config.assignment_method = 'simple_random' then
    v_condition := (array['fixed', 'random', 'adaptive'])[1 + floor(random() * 3)::integer];
  else
    select candidate into v_condition
    from unnest(array['fixed', 'random', 'adaptive']) as candidate
    left join lateral (
      select count(*) as n from public.study_sessions s
      where s.study_phase = p_study_phase
        and s.experiment_config_id = v_config.id
        and s.experiment_condition = candidate
    ) totals on true
    order by totals.n asc, random()
    limit 1;
  end if;

  insert into public.participants (participant_code, study_version)
  values ('IDN-P-' || lpad(nextval('public.ideon_participant_code_seq')::text, 4, '0'), v_config.config_version)
  returning * into v_participant;

  insert into public.study_sessions (
    session_code, session_token_hash, participant_id, experiment_config_id, experiment_condition,
    experiment_config_version, study_phase, model_provider, model_name, model_version,
    state_prompt_version, explore_prompt_version, deepen_prompt_version, task_version, assigned_task,
    original_topic
  ) values (
    'IDN-S-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8)),
    encode(extensions.digest(v_token, 'sha256'), 'hex'), v_participant.id, v_config.id, v_condition,
    v_config.config_version, p_study_phase, v_config.model_provider, v_config.model_name, v_config.model_version,
    v_config.state_prompt_version, v_config.explore_prompt_version, v_config.deepen_prompt_version,
    v_config.task_version, v_config.assigned_task, 'Generative AI in University Education'
  ) returning * into v_session;

  return jsonb_build_object(
    'participantId', v_participant.id,
    'participantCode', v_participant.participant_code,
    'sessionId', v_session.id,
    'sessionCode', v_session.session_code,
    'sessionToken', v_token,
    'status', v_session.status
  );
end;
$$;

create or replace function public.record_ideon_turn(p_event jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.study_sessions%rowtype;
  v_session_id uuid := (p_event->>'sessionId')::uuid;
  v_turn_event_id uuid := (p_event->>'turnEventId')::uuid;
  v_turn integer := (p_event->>'turnNumber')::integer;
  v_context jsonb := coalesce(p_event->'ideationContext', '{}'::jsonb);
begin
  select * into v_session from public.study_sessions where id = v_session_id for update;
  if v_session.id is null then raise exception 'session_not_found'; end if;
  if not v_session.consent_given or v_session.status not in ('consented', 'in_progress') then raise exception 'session_not_active'; end if;
  if exists (select 1 from public.strategy_events where session_id = v_session_id and turn_event_id = v_turn_event_id) then return false; end if;
  if v_turn <> v_session.turn_count + 1 then raise exception 'invalid_turn_number'; end if;
  if p_event->>'condition' <> v_session.experiment_condition then raise exception 'condition_mismatch'; end if;
  if p_event->>'configVersion' <> v_session.experiment_config_version then raise exception 'config_version_mismatch'; end if;

  insert into public.messages (session_id, turn_event_id, turn_number, role, content, message_status, latency_ms)
  values (v_session_id, v_turn_event_id, v_turn, 'user', p_event->>'userMessage', 'completed', null);

  insert into public.strategy_events (
    session_id, turn_event_id, turn_number, experiment_condition, explicit_intent, user_override,
    override_source, detected_state, state_confidence, state_evidence, previous_strategy, selected_strategy,
    strategy_changed, decision_source, decision_reason, model_provider, model_name, model_version,
    experiment_config_version, state_prompt_version, explore_prompt_version, deepen_prompt_version,
    state_analysis_latency_ms, llm_response_latency_ms, total_turn_latency_ms, created_at
  ) values (
    v_session_id, v_turn_event_id, v_turn, p_event->>'condition', nullif(p_event->>'explicitIntent', ''),
    coalesce((p_event->>'userOverride')::boolean, false), case when coalesce((p_event->>'userOverride')::boolean, false) then 'participant_message' else null end,
    nullif(p_event->>'detectedState', ''), nullif(p_event->>'stateConfidence', '')::numeric,
    coalesce(p_event->'stateEvidence', '[]'::jsonb), nullif(p_event->>'previousStrategy', ''),
    p_event->>'selectedStrategy', (p_event->>'strategyChanged')::boolean, p_event->>'decisionSource',
    p_event->>'decisionReason', p_event->>'modelProvider', p_event->>'modelName', p_event->>'modelVersion',
    p_event->>'configVersion', p_event->>'statePromptVersion', p_event->>'explorePromptVersion',
    p_event->>'deepenPromptVersion', nullif(p_event->>'stateAnalysisLatencyMs', '')::integer,
    nullif(p_event->>'llmResponseLatencyMs', '')::integer, nullif(p_event->>'totalTurnLatencyMs', '')::integer,
    coalesce((p_event->>'createdAt')::timestamptz, now())
  );

  insert into public.messages (session_id, turn_event_id, turn_number, role, content, message_status, latency_ms, created_at)
  values (v_session_id, v_turn_event_id, v_turn, 'assistant', p_event->>'aiResponse', 'completed',
    nullif(p_event->>'llmResponseLatencyMs', '')::integer, coalesce((p_event->>'createdAt')::timestamptz, now()));

  insert into public.idea_events (session_id, turn_number, event_type, idea_text, source)
  select v_session_id, v_turn, 'selected', item.value, 'user'
  from jsonb_array_elements_text(coalesce(v_context->'selectedIdeas', '[]'::jsonb)) as item(value)
  where not exists (
    select 1
    from jsonb_array_elements_text(v_session.selected_ideas) as prior(value)
    where prior.value = item.value
  );

  insert into public.idea_events (session_id, turn_number, event_type, idea_text, source)
  select v_session_id, v_turn, 'rejected', item.value, 'user'
  from jsonb_array_elements_text(coalesce(v_context->'rejectedIdeas', '[]'::jsonb)) as item(value)
  where not exists (
    select 1
    from jsonb_array_elements_text(v_session.rejected_ideas) as prior(value)
    where prior.value = item.value
  );

  update public.study_sessions set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    current_direction = nullif(v_context->>'currentDirection', ''),
    selected_ideas = coalesce(v_context->'selectedIdeas', '[]'::jsonb),
    rejected_ideas = coalesce(v_context->'rejectedIdeas', '[]'::jsonb),
    current_strategy = p_event->>'selectedStrategy',
    turn_count = v_turn,
    last_activity_at = now()
  where id = v_session_id;

  return true;
end;
$$;

create or replace function public.record_failed_ideon_turn(
  p_session_id uuid,
  p_turn_event_id uuid,
  p_turn_number integer,
  p_user_message text,
  p_error_category text,
  p_total_latency_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.study_sessions%rowtype;
begin
  select * into v_session from public.study_sessions where id = p_session_id for update;
  if v_session.id is null then raise exception 'session_not_found'; end if;
  if not v_session.consent_given or v_session.status not in ('consented', 'in_progress') then raise exception 'session_not_active'; end if;
  if exists (select 1 from public.messages where session_id = p_session_id and turn_event_id = p_turn_event_id) then return false; end if;
  if p_turn_number <> v_session.turn_count + 1 then raise exception 'invalid_turn_number'; end if;

  insert into public.messages (session_id, turn_event_id, turn_number, role, content, message_status)
  values (p_session_id, p_turn_event_id, p_turn_number, 'user', p_user_message, 'completed');
  insert into public.messages (session_id, turn_event_id, turn_number, role, content, message_status, error_category, latency_ms)
  values (p_session_id, p_turn_event_id, p_turn_number, 'assistant', '', 'failed', left(p_error_category, 80), greatest(p_total_latency_ms, 0));
  update public.study_sessions set turn_count = p_turn_number, status = 'in_progress', started_at = coalesce(started_at, now()), last_activity_at = now() where id = p_session_id;
  return true;
end;
$$;

create or replace function public.save_final_idea(p_session_id uuid, p_idea jsonb, p_submit boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.study_sessions where id = p_session_id and consent_given and status in ('consented', 'in_progress', 'final_submitted')) then
    raise exception 'session_not_eligible';
  end if;
  if p_submit and (
    nullif(trim(p_idea->>'topic'), '') is null or nullif(trim(p_idea->>'problem'), '') is null
    or nullif(trim(p_idea->>'question'), '') is null or nullif(trim(p_idea->>'explanation'), '') is null
  ) then raise exception 'incomplete_final_idea'; end if;

  insert into public.final_ideas (session_id, research_topic, research_problem, research_question, short_explanation, status, submitted_at)
  values (p_session_id, coalesce(p_idea->>'topic', ''), coalesce(p_idea->>'problem', ''), coalesce(p_idea->>'question', ''),
    coalesce(p_idea->>'explanation', ''), case when p_submit then 'submitted' else 'draft' end, case when p_submit then now() else null end)
  on conflict (session_id) do update set
    research_topic = excluded.research_topic, research_problem = excluded.research_problem,
    research_question = excluded.research_question, short_explanation = excluded.short_explanation,
    status = case when public.final_ideas.status = 'submitted' then 'submitted' else excluded.status end,
    submitted_at = coalesce(public.final_ideas.submitted_at, excluded.submitted_at);

  if p_submit then
    update public.study_sessions set final_submission_completed = true, status = 'final_submitted', last_activity_at = now() where id = p_session_id;
  end if;
end;
$$;

create or replace function public.submit_questionnaire(p_session_id uuid, p_questionnaire_version text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_response_id uuid; v_answer jsonb; v_started timestamptz;
begin
  select started_at into v_started from public.study_sessions
  where id = p_session_id and consent_given and final_submission_completed for update;
  if not found then raise exception 'session_not_eligible'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> 8 then raise exception 'invalid_questionnaire'; end if;

  insert into public.questionnaire_responses (session_id, questionnaire_version, submitted_at, completed)
  values (p_session_id, p_questionnaire_version, now(), true)
  on conflict (session_id) do update set questionnaire_version = excluded.questionnaire_version, submitted_at = now(), completed = true
  returning id into v_response_id;

  delete from public.questionnaire_answers where questionnaire_response_id = v_response_id;
  for v_answer in select * from jsonb_array_elements(p_answers) loop
    insert into public.questionnaire_answers (questionnaire_response_id, question_key, construct, numeric_value, text_value)
    values (v_response_id, v_answer->>'questionKey', v_answer->>'construct', nullif(v_answer->>'numericValue', '')::integer, nullif(v_answer->>'textValue', ''));
  end loop;

  update public.study_sessions set questionnaire_completed = true, status = 'completed', ended_at = now(),
    duration_seconds = greatest(0, extract(epoch from (now() - coalesce(v_started, created_at)))::integer), last_activity_at = now()
  where id = p_session_id;
end;
$$;

create or replace function public.admin_delete_session(p_session_id uuid, p_delete_participant boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_participant_id uuid; v_phase text;
begin
  if not public.is_ideon_admin() then raise exception 'admin_required'; end if;
  select participant_id, study_phase into v_participant_id, v_phase from public.study_sessions where id = p_session_id;
  if not found then raise exception 'session_not_found'; end if;
  if v_phase = 'main' then raise exception 'main_study_deletion_requires_protocol_review'; end if;
  insert into public.audit_events (admin_user_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_delete_participant then 'delete_participant' else 'delete_test_session' end,
    case when p_delete_participant then 'participant' else 'study_session' end,
    case when p_delete_participant then v_participant_id else p_session_id end,
    jsonb_build_object('study_phase', v_phase));
  if p_delete_participant then delete from public.participants where id = v_participant_id;
  else delete from public.study_sessions where id = p_session_id; end if;
end;
$$;

create or replace function public.admin_freeze_experiment_config(p_config_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_ideon_admin() then raise exception 'admin_required'; end if;
  update public.experiment_configs set frozen_at = now() where id = p_config_id and frozen_at is null;
  if not found then raise exception 'config_not_found_or_already_frozen'; end if;
  insert into public.audit_events (admin_user_id, action, target_type, target_id)
  values (auth.uid(), 'freeze_experiment_config', 'experiment_config', p_config_id);
end;
$$;

create or replace function public.admin_activate_experiment_config(p_config_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_phase text;
begin
  if not public.is_ideon_admin() then raise exception 'admin_required'; end if;
  select study_phase into v_phase from public.experiment_configs where id = p_config_id;
  if not found then raise exception 'config_not_found'; end if;
  update public.experiment_configs set is_active = false where study_phase = v_phase and is_active and id <> p_config_id;
  update public.experiment_configs set is_active = true where id = p_config_id;
  insert into public.audit_events (admin_user_id, action, target_type, target_id)
  values (auth.uid(), 'activate_experiment_config', 'experiment_config', p_config_id);
end;
$$;

revoke all on function public.create_study_session(text, text) from public, anon, authenticated;
revoke all on function public.record_ideon_turn(jsonb) from public, anon, authenticated;
revoke all on function public.record_failed_ideon_turn(uuid, uuid, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.save_final_idea(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.submit_questionnaire(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_study_session(text, text) to service_role;
grant execute on function public.record_ideon_turn(jsonb) to service_role;
grant execute on function public.record_failed_ideon_turn(uuid, uuid, integer, text, text, integer) to service_role;
grant execute on function public.save_final_idea(uuid, jsonb, boolean) to service_role;
grant execute on function public.submit_questionnaire(uuid, text, jsonb) to service_role;

revoke all on function public.admin_delete_session(uuid, boolean) from public, anon;
revoke all on function public.admin_freeze_experiment_config(uuid) from public, anon;
revoke all on function public.admin_activate_experiment_config(uuid) from public, anon;
grant execute on function public.admin_delete_session(uuid, boolean) to authenticated;
grant execute on function public.admin_freeze_experiment_config(uuid) to authenticated;
grant execute on function public.admin_activate_experiment_config(uuid) to authenticated;
grant execute on function public.is_researcher() to authenticated;
grant execute on function public.is_ideon_admin() to authenticated;
