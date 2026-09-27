-- Ideon v2 limits participant-selectable modes to Random and Adaptive.
-- A mode may change only before the session starts; afterward the existing
-- assignment-protection trigger keeps it immutable.

alter table public.study_sessions
  add column if not exists user_constraints jsonb not null default '[]'::jsonb
  check (jsonb_typeof(user_constraints) = 'array');

alter table public.strategy_events
  add column if not exists random_value numeric(9,8)
  check (random_value is null or (random_value >= 0 and random_value < 1));

alter table public.strategy_events
  add column if not exists random_explore_probability numeric(4,3)
  check (random_explore_probability is null or random_explore_probability between 0 and 1);

create or replace function public.protect_session_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.participant_id is distinct from new.participant_id
     or old.experiment_config_id is distinct from new.experiment_config_id
     or old.experiment_config_version is distinct from new.experiment_config_version
     or old.study_phase is distinct from new.study_phase
     or old.task_version is distinct from new.task_version
     or old.assigned_task is distinct from new.assigned_task then
    raise exception 'session_assignment_is_immutable';
  end if;

  if old.experiment_condition is distinct from new.experiment_condition and not (
    old.status in ('created', 'consented')
    and new.status = 'in_progress'
    and old.started_at is null
    and old.turn_count = 0
    and new.experiment_condition in ('random', 'adaptive')
  ) then
    raise exception 'session_mode_is_locked';
  end if;
  return new;
end;
$$;

-- Activate a new development configuration instead of silently changing v1.
update public.experiment_configs
set is_active = false
where study_phase = 'development' and is_active;

insert into public.experiment_configs (
  config_version, study_phase, assignment_method, model_provider, model_name, model_version,
  fixed_strategy, random_explore_probability, switch_confidence_threshold, moderate_signal_threshold,
  state_context_messages, min_turns_before_switch, wait_strategy_enabled,
  state_prompt_version, explore_prompt_version, deepen_prompt_version,
  questionnaire_version, consent_version, task_version, assigned_task, configuration, is_active
) values (
  'ideon-v2', 'development', 'manual', 'google', 'Gemini 3.6 Flash', 'gemini-3.6-flash',
  'deepen', 0.5, 0.72, 0.55, 6, 1, false,
  'state-classifier-v1.1.0', 'explore-v1.1.0', 'deepen-v1.1.0',
  'ideon-questionnaire-v1', 'ideon-consent-v1', 'ideon-task-v1',
  'Develop a specific research problem and final research question about Generative AI in University Education.',
  '{"targetResponseWords":"100-220","participantOverrideInBaselines":false,"participantSelectableModes":["random","adaptive"]}'::jsonb,
  true
)
on conflict (config_version) do update set is_active = true;

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
    if p_manual_condition not in ('random', 'adaptive') then raise exception 'manual_condition_required'; end if;
    v_condition := p_manual_condition;
  elsif v_config.assignment_method = 'simple_random' then
    v_condition := (array['random', 'adaptive'])[1 + floor(random() * 2)::integer];
  else
    select candidate into v_condition
    from unnest(array['random', 'adaptive']) as candidate
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
    'status', v_session.status,
    'mode', v_session.experiment_condition
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
    strategy_changed, decision_source, decision_reason, random_value, random_explore_probability,
    model_provider, model_name, model_version, experiment_config_version, state_prompt_version,
    explore_prompt_version, deepen_prompt_version, state_analysis_latency_ms, llm_response_latency_ms,
    total_turn_latency_ms, created_at
  ) values (
    v_session_id, v_turn_event_id, v_turn, p_event->>'condition', nullif(p_event->>'explicitIntent', ''),
    coalesce((p_event->>'userOverride')::boolean, false), case when coalesce((p_event->>'userOverride')::boolean, false) then 'participant_message' else null end,
    nullif(p_event->>'detectedState', ''), nullif(p_event->>'stateConfidence', '')::numeric,
    coalesce(p_event->'stateEvidence', '[]'::jsonb), nullif(p_event->>'previousStrategy', ''),
    p_event->>'selectedStrategy', (p_event->>'strategyChanged')::boolean, p_event->>'decisionSource',
    p_event->>'decisionReason', nullif(p_event->>'randomValue', '')::numeric,
    nullif(p_event->>'randomExploreProbability', '')::numeric, p_event->>'modelProvider',
    p_event->>'modelName', p_event->>'modelVersion', p_event->>'configVersion',
    p_event->>'statePromptVersion', p_event->>'explorePromptVersion', p_event->>'deepenPromptVersion',
    nullif(p_event->>'stateAnalysisLatencyMs', '')::integer,
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
    select 1 from jsonb_array_elements_text(v_session.selected_ideas) as prior(value)
    where prior.value = item.value
  );

  insert into public.idea_events (session_id, turn_number, event_type, idea_text, source)
  select v_session_id, v_turn, 'rejected', item.value, 'user'
  from jsonb_array_elements_text(coalesce(v_context->'rejectedIdeas', '[]'::jsonb)) as item(value)
  where not exists (
    select 1 from jsonb_array_elements_text(v_session.rejected_ideas) as prior(value)
    where prior.value = item.value
  );

  update public.study_sessions set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    current_direction = nullif(v_context->>'currentDirection', ''),
    selected_ideas = coalesce(v_context->'selectedIdeas', '[]'::jsonb),
    rejected_ideas = coalesce(v_context->'rejectedIdeas', '[]'::jsonb),
    user_constraints = coalesce(v_context->'userConstraints', '[]'::jsonb),
    current_strategy = p_event->>'selectedStrategy',
    turn_count = v_turn,
    last_activity_at = now()
  where id = v_session_id;

  return true;
end;
$$;

revoke all on function public.create_study_session(text, text) from public, anon, authenticated;
revoke all on function public.record_ideon_turn(jsonb) from public, anon, authenticated;
grant execute on function public.create_study_session(text, text) to service_role;
grant execute on function public.record_ideon_turn(jsonb) to service_role;
