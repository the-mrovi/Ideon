-- Rebuild Ideon's research data model around the six finalized pilot tables.
-- Existing study records are preserved in legacy_* archive tables before data
-- is normalized into the new schema. No historical record is deleted here.

-- Preserve the original research tables and their complete rows.
alter table public.participants rename to legacy_participants;
alter table public.study_sessions rename to legacy_study_sessions;
alter table public.messages rename to legacy_messages;
alter table public.strategy_events rename to legacy_strategy_events;
alter table public.idea_events rename to legacy_idea_events;
alter table public.final_ideas rename to legacy_final_ideas;
alter table public.questionnaire_responses rename to legacy_questionnaire_responses;
alter table public.questionnaire_answers rename to legacy_questionnaire_answers;

-- These v2 fields may not exist in an older linked development database yet.
alter table public.legacy_study_sessions
  add column if not exists user_constraints jsonb not null default '[]'::jsonb
  check (jsonb_typeof(user_constraints) = 'array');
alter table public.legacy_strategy_events
  add column if not exists random_value numeric(9,8)
  check (random_value is null or (random_value >= 0 and random_value < 1));
alter table public.legacy_strategy_events
  add column if not exists random_explore_probability numeric(4,3)
  check (random_explore_probability is null or random_explore_probability between 0 and 1);

-- The six main pilot-study tables.
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  participant_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  research_task text not null,
  study_mode text check (study_mode is null or study_mode in ('random', 'adaptive', 'natural')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'created' check (status in ('created', 'in_progress', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  sender text not null check (sender in ('user', 'ai')),
  message_text text not null,
  created_at timestamptz not null default now(),
  unique (session_id, turn_number, sender)
);

create table public.behavior_annotations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  observed_behavior text not null check (observed_behavior in (
    'asks_for_alternatives', 'selects_idea', 'shows_interest', 'requests_more_detail',
    'rejects_idea', 'changes_direction', 'shows_uncertainty', 'shows_stuck',
    'accepts_suggestion', 'other'
  )),
  user_state text not null check (user_state in (
    'uncertain', 'exploring', 'interested', 'committed', 'rejecting', 'stuck', 'neutral'
  )),
  preferred_strategy text not null check (preferred_strategy in ('explore', 'deepen', 'keep_current')),
  confidence numeric check (confidence is null or confidence between 0 and 1),
  researcher_notes text,
  created_at timestamptz not null default now()
);

create table public.final_ideas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  research_topic text,
  research_problem text,
  research_question text,
  submitted_at timestamptz not null default now()
);

create table public.post_session_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_key text not null,
  response_text text,
  numeric_value integer,
  created_at timestamptz not null default now(),
  unique (session_id, question_key),
  check (response_text is not null or numeric_value is not null)
);

-- Operational data is separated from the six research tables so the schema
-- remains analytically clean while the participant workflow keeps working.
create table public.session_access (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  session_token_hash text not null unique,
  consent_version text,
  consent_given boolean not null default false,
  read_study_information boolean not null default false,
  understands_recording boolean not null default false,
  agrees_to_participate boolean not null default false,
  consent_timestamp timestamptz
);

create table public.session_runtime (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  session_code text not null unique,
  experiment_config_id uuid not null references public.experiment_configs(id),
  experiment_config_version text not null,
  study_phase text not null check (study_phase in ('development', 'pilot', 'main')),
  model_provider text not null,
  model_name text not null,
  model_version text not null,
  state_prompt_version text not null,
  explore_prompt_version text not null,
  deepen_prompt_version text not null,
  task_version text not null,
  original_topic text,
  current_direction text,
  selected_ideas jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_ideas) = 'array'),
  rejected_ideas jsonb not null default '[]'::jsonb check (jsonb_typeof(rejected_ideas) = 'array'),
  user_constraints jsonb not null default '[]'::jsonb check (jsonb_typeof(user_constraints) = 'array'),
  current_strategy text check (current_strategy is null or current_strategy in ('explore', 'deepen')),
  turn_count integer not null default 0 check (turn_count >= 0),
  final_submission_completed boolean not null default false,
  questionnaire_completed boolean not null default false,
  last_activity_at timestamptz not null default now()
);

create table public.message_runtime (
  message_id uuid primary key references public.messages(id) on delete cascade,
  turn_event_id uuid not null,
  message_status text not null default 'completed' check (message_status in ('pending', 'completed', 'failed')),
  error_category text,
  model_message_id text,
  token_input integer check (token_input is null or token_input >= 0),
  token_output integer check (token_output is null or token_output >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  unique (turn_event_id, message_id)
);

-- Automatic model decisions are intentionally distinct from manual researcher
-- annotations and can never overwrite behavior_annotations.
create table public.automatic_behavior_predictions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  turn_event_id uuid not null,
  turn_number integer not null check (turn_number > 0),
  study_mode text not null check (study_mode in ('random', 'adaptive', 'natural')),
  explicit_intent text check (explicit_intent is null or explicit_intent in ('explore', 'deepen')),
  user_override boolean not null default false,
  override_source text,
  detected_state text check (detected_state is null or detected_state in ('uncertain', 'exploring', 'interested', 'committed', 'rejecting', 'stuck', 'neutral')),
  state_confidence numeric check (state_confidence is null or state_confidence between 0 and 1),
  state_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(state_evidence) = 'array'),
  previous_strategy text check (previous_strategy is null or previous_strategy in ('explore', 'deepen')),
  selected_strategy text not null check (selected_strategy in ('explore', 'deepen')),
  strategy_changed boolean not null,
  decision_source text not null check (decision_source in ('random', 'adaptive', 'natural', 'user_override', 'fallback')),
  decision_reason text,
  random_value numeric check (random_value is null or (random_value >= 0 and random_value < 1)),
  random_explore_probability numeric check (random_explore_probability is null or random_explore_probability between 0 and 1),
  model_provider text not null,
  model_name text not null,
  model_version text not null,
  experiment_config_version text not null,
  state_prompt_version text not null,
  explore_prompt_version text not null,
  deepen_prompt_version text not null,
  state_analysis_latency_ms integer check (state_analysis_latency_ms is null or state_analysis_latency_ms >= 0),
  llm_response_latency_ms integer check (llm_response_latency_ms is null or llm_response_latency_ms >= 0),
  total_turn_latency_ms integer check (total_turn_latency_ms is null or total_turn_latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, turn_event_id),
  unique (session_id, turn_number)
);

-- Draft-only UI fields stay outside the official one-row-per-session output.
create table public.final_idea_drafts (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  research_topic text not null default '',
  research_problem text not null default '',
  research_question text not null default '',
  short_explanation text not null default '',
  updated_at timestamptz not null default now()
);

-- Required indexes (unique constraints already provide indexes for annotation
-- message IDs and final-idea session IDs).
create index sessions_participant_id_idx on public.sessions (participant_id);
create index messages_session_id_idx on public.messages (session_id);
create index messages_session_turn_number_idx on public.messages (session_id, turn_number);
create index post_session_responses_session_id_idx on public.post_session_responses (session_id);
create index automatic_predictions_session_turn_idx on public.automatic_behavior_predictions (session_id, turn_number);
create index message_runtime_turn_event_idx on public.message_runtime (turn_event_id);

-- Normalize the existing records into the new main and operational tables.
insert into public.participants (id, participant_code, created_at)
select id, participant_code, created_at
from public.legacy_participants;

insert into public.sessions (
  id, participant_id, research_task, study_mode, started_at, ended_at,
  duration_seconds, status, created_at, updated_at
)
select
  id,
  participant_id,
  assigned_task,
  case experiment_condition when 'fixed' then 'natural' else experiment_condition end,
  started_at,
  ended_at,
  duration_seconds,
  case
    when status in ('created', 'consented') then 'created'
    when status in ('in_progress', 'final_submitted') then 'in_progress'
    when status in ('questionnaire_completed', 'completed') then 'completed'
    else 'abandoned'
  end,
  created_at,
  updated_at
from public.legacy_study_sessions;

insert into public.session_access (
  session_id, session_token_hash, consent_version, consent_given,
  read_study_information, understands_recording, agrees_to_participate, consent_timestamp
)
select
  id, session_token_hash, consent_version, consent_given,
  read_study_information, understands_recording, agrees_to_participate, consent_timestamp
from public.legacy_study_sessions;

insert into public.session_runtime (
  session_id, session_code, experiment_config_id, experiment_config_version, study_phase,
  model_provider, model_name, model_version, state_prompt_version, explore_prompt_version,
  deepen_prompt_version, task_version, original_topic, current_direction, selected_ideas,
  rejected_ideas, user_constraints, current_strategy, turn_count, final_submission_completed,
  questionnaire_completed, last_activity_at
)
select
  id, session_code, experiment_config_id, experiment_config_version, study_phase,
  model_provider, model_name, model_version, state_prompt_version, explore_prompt_version,
  deepen_prompt_version, task_version, original_topic, current_direction, selected_ideas,
  rejected_ideas, user_constraints, current_strategy, turn_count, final_submission_completed,
  questionnaire_completed, last_activity_at
from public.legacy_study_sessions;

insert into public.messages (id, session_id, turn_number, sender, message_text, created_at)
select
  id,
  session_id,
  turn_number,
  case role when 'user' then 'user' else 'ai' end,
  content,
  created_at
from public.legacy_messages
where role in ('user', 'assistant');

insert into public.message_runtime (
  message_id, turn_event_id, message_status, error_category, model_message_id,
  token_input, token_output, latency_ms
)
select
  id, turn_event_id, message_status, error_category, model_message_id,
  token_input, token_output, latency_ms
from public.legacy_messages
where role in ('user', 'assistant');

insert into public.automatic_behavior_predictions (
  id, session_id, message_id, turn_event_id, turn_number, study_mode,
  explicit_intent, user_override, override_source, detected_state, state_confidence,
  state_evidence, previous_strategy, selected_strategy, strategy_changed,
  decision_source, decision_reason, random_value, random_explore_probability,
  model_provider, model_name, model_version, experiment_config_version,
  state_prompt_version, explore_prompt_version, deepen_prompt_version,
  state_analysis_latency_ms, llm_response_latency_ms, total_turn_latency_ms, created_at
)
select
  event.id,
  event.session_id,
  message.id,
  event.turn_event_id,
  event.turn_number,
  case event.experiment_condition when 'fixed' then 'natural' else event.experiment_condition end,
  event.explicit_intent,
  event.user_override,
  event.override_source,
  event.detected_state,
  event.state_confidence,
  event.state_evidence,
  nullif(event.previous_strategy, 'wait'),
  case event.selected_strategy when 'wait' then 'deepen' else event.selected_strategy end,
  event.strategy_changed,
  case event.decision_source when 'fixed' then 'natural' else event.decision_source end,
  event.decision_reason,
  event.random_value,
  event.random_explore_probability,
  event.model_provider,
  event.model_name,
  event.model_version,
  event.experiment_config_version,
  event.state_prompt_version,
  event.explore_prompt_version,
  event.deepen_prompt_version,
  event.state_analysis_latency_ms,
  event.llm_response_latency_ms,
  event.total_turn_latency_ms,
  event.created_at
from public.legacy_strategy_events event
join public.legacy_messages message
  on message.session_id = event.session_id
 and message.turn_event_id = event.turn_event_id
 and message.role = 'user';

insert into public.final_idea_drafts (
  session_id, research_topic, research_problem, research_question, short_explanation, updated_at
)
select session_id, research_topic, research_problem, research_question, short_explanation, updated_at
from public.legacy_final_ideas;

insert into public.final_ideas (
  id, session_id, research_topic, research_problem, research_question, submitted_at
)
select id, session_id, research_topic, research_problem, research_question, submitted_at
from public.legacy_final_ideas
where status = 'submitted';

insert into public.post_session_responses (
  id, session_id, question_key, response_text, numeric_value, created_at
)
select
  answer.id,
  response.session_id,
  answer.question_key,
  answer.text_value,
  answer.numeric_value,
  answer.created_at
from public.legacy_questionnaire_answers answer
join public.legacy_questionnaire_responses response
  on response.id = answer.questionnaire_response_id;

-- Timestamp and immutability safeguards.
create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

create trigger final_idea_drafts_set_updated_at
before update on public.final_idea_drafts
for each row execute function public.set_updated_at();

create or replace function public.protect_pilot_session_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_turn_count integer;
begin
  if old.participant_id is distinct from new.participant_id
     or old.research_task is distinct from new.research_task then
    raise exception 'session_assignment_is_immutable';
  end if;

  if old.study_mode is distinct from new.study_mode then
    select turn_count into v_turn_count
    from public.session_runtime
    where session_id = old.id;

    if old.started_at is not null
       or old.status <> 'created'
       or coalesce(v_turn_count, 0) > 0 then
      raise exception 'session_mode_is_locked';
    end if;
  end if;
  return new;
end;
$$;

create trigger sessions_protect_assignment
before update on public.sessions
for each row execute function public.protect_pilot_session_assignment();

create trigger automatic_predictions_append_only
before update on public.automatic_behavior_predictions
for each row execute function public.prevent_research_record_update();

create or replace function public.require_user_message_annotation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.messages
    where id = new.message_id and sender = 'user'
  ) then
    raise exception 'behavior_annotations_require_user_message';
  end if;
  return new;
end;
$$;

create trigger behavior_annotations_require_user_message
before insert or update on public.behavior_annotations
for each row execute function public.require_user_message_annotation();

-- Replace application RPCs so the existing chat flow writes the rebuilt
-- schema without changing the participant-facing behavior.
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
  v_session public.sessions%rowtype;
  v_condition text;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_session_code text := 'IDN-S-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));
begin
  if p_study_phase not in ('development', 'pilot', 'main') then
    raise exception 'invalid_study_phase';
  end if;

  select * into v_config
  from public.experiment_configs
  where study_phase = p_study_phase and is_active
  order by created_at desc
  limit 1;

  if v_config.id is null then raise exception 'study_not_configured'; end if;
  if p_study_phase = 'main' and v_config.frozen_at is null then raise exception 'main_config_not_frozen'; end if;
  if p_manual_condition not in ('random', 'adaptive') then raise exception 'manual_condition_required'; end if;
  v_condition := p_manual_condition;

  insert into public.participants (participant_code)
  values ('P' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8)))
  returning * into v_participant;

  insert into public.sessions (participant_id, research_task, study_mode)
  values (v_participant.id, v_config.assigned_task, v_condition)
  returning * into v_session;

  insert into public.session_access (session_id, session_token_hash)
  values (v_session.id, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  insert into public.session_runtime (
    session_id, session_code, experiment_config_id, experiment_config_version,
    study_phase, model_provider, model_name, model_version, state_prompt_version,
    explore_prompt_version, deepen_prompt_version, task_version, original_topic
  ) values (
    v_session.id, v_session_code, v_config.id, v_config.config_version,
    p_study_phase, v_config.model_provider, v_config.model_name, v_config.model_version,
    v_config.state_prompt_version, v_config.explore_prompt_version,
    v_config.deepen_prompt_version, v_config.task_version,
    'Generative AI in University Education'
  );

  return jsonb_build_object(
    'participantId', v_participant.id,
    'participantCode', v_participant.participant_code,
    'sessionId', v_session.id,
    'sessionCode', v_session_code,
    'sessionToken', v_token,
    'status', v_session.status,
    'mode', v_session.study_mode
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
  v_session public.sessions%rowtype;
  v_runtime public.session_runtime%rowtype;
  v_access public.session_access%rowtype;
  v_session_id uuid := (p_event->>'sessionId')::uuid;
  v_turn_event_id uuid := (p_event->>'turnEventId')::uuid;
  v_turn integer := (p_event->>'turnNumber')::integer;
  v_context jsonb := coalesce(p_event->'ideationContext', '{}'::jsonb);
  v_user_message_id uuid;
  v_ai_message_id uuid;
  v_created_at timestamptz := coalesce((p_event->>'createdAt')::timestamptz, now());
begin
  select * into v_session from public.sessions where id = v_session_id for update;
  select * into v_runtime from public.session_runtime where session_id = v_session_id for update;
  select * into v_access from public.session_access where session_id = v_session_id;

  if v_session.id is null or v_runtime.session_id is null then raise exception 'session_not_found'; end if;
  if not coalesce(v_access.consent_given, false) or v_session.status <> 'in_progress' then raise exception 'session_not_active'; end if;
  if exists (
    select 1
    from public.message_runtime
    where turn_event_id = v_turn_event_id
  ) then return false; end if;
  if v_turn <> v_runtime.turn_count + 1 then raise exception 'invalid_turn_number'; end if;
  if p_event->>'condition' <> v_session.study_mode then raise exception 'condition_mismatch'; end if;
  if p_event->>'configVersion' <> v_runtime.experiment_config_version then raise exception 'config_version_mismatch'; end if;

  insert into public.messages (session_id, turn_number, sender, message_text, created_at)
  values (v_session_id, v_turn, 'user', p_event->>'userMessage', v_created_at)
  returning id into v_user_message_id;

  insert into public.message_runtime (message_id, turn_event_id, message_status)
  values (v_user_message_id, v_turn_event_id, 'completed');

  insert into public.automatic_behavior_predictions (
    session_id, message_id, turn_event_id, turn_number, study_mode, explicit_intent,
    user_override, override_source, detected_state, state_confidence, state_evidence,
    previous_strategy, selected_strategy, strategy_changed, decision_source,
    decision_reason, random_value, random_explore_probability, model_provider,
    model_name, model_version, experiment_config_version, state_prompt_version,
    explore_prompt_version, deepen_prompt_version, state_analysis_latency_ms,
    llm_response_latency_ms, total_turn_latency_ms, created_at
  ) values (
    v_session_id,
    v_user_message_id,
    v_turn_event_id,
    v_turn,
    p_event->>'condition',
    nullif(p_event->>'explicitIntent', ''),
    coalesce((p_event->>'userOverride')::boolean, false),
    case when coalesce((p_event->>'userOverride')::boolean, false) then 'participant_message' else null end,
    nullif(p_event->>'detectedState', ''),
    nullif(p_event->>'stateConfidence', '')::numeric,
    coalesce(p_event->'stateEvidence', '[]'::jsonb),
    nullif(p_event->>'previousStrategy', ''),
    p_event->>'selectedStrategy',
    (p_event->>'strategyChanged')::boolean,
    p_event->>'decisionSource',
    p_event->>'decisionReason',
    nullif(p_event->>'randomValue', '')::numeric,
    nullif(p_event->>'randomExploreProbability', '')::numeric,
    p_event->>'modelProvider',
    p_event->>'modelName',
    p_event->>'modelVersion',
    p_event->>'configVersion',
    p_event->>'statePromptVersion',
    p_event->>'explorePromptVersion',
    p_event->>'deepenPromptVersion',
    nullif(p_event->>'stateAnalysisLatencyMs', '')::integer,
    nullif(p_event->>'llmResponseLatencyMs', '')::integer,
    nullif(p_event->>'totalTurnLatencyMs', '')::integer,
    v_created_at
  );

  insert into public.messages (session_id, turn_number, sender, message_text, created_at)
  values (v_session_id, v_turn, 'ai', p_event->>'aiResponse', v_created_at)
  returning id into v_ai_message_id;

  insert into public.message_runtime (message_id, turn_event_id, message_status, latency_ms)
  values (v_ai_message_id, v_turn_event_id, 'completed', nullif(p_event->>'llmResponseLatencyMs', '')::integer);

  update public.session_runtime
  set current_direction = nullif(v_context->>'currentDirection', ''),
      selected_ideas = coalesce(v_context->'selectedIdeas', '[]'::jsonb),
      rejected_ideas = coalesce(v_context->'rejectedIdeas', '[]'::jsonb),
      user_constraints = coalesce(v_context->'userConstraints', '[]'::jsonb),
      current_strategy = p_event->>'selectedStrategy',
      turn_count = v_turn,
      last_activity_at = now()
  where session_id = v_session_id;

  update public.sessions
  set started_at = coalesce(started_at, now()), status = 'in_progress'
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
declare
  v_session public.sessions%rowtype;
  v_runtime public.session_runtime%rowtype;
  v_access public.session_access%rowtype;
  v_user_message_id uuid;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  select * into v_runtime from public.session_runtime where session_id = p_session_id for update;
  select * into v_access from public.session_access where session_id = p_session_id;
  if v_session.id is null or v_runtime.session_id is null then raise exception 'session_not_found'; end if;
  if not coalesce(v_access.consent_given, false) or v_session.status <> 'in_progress' then raise exception 'session_not_active'; end if;
  if exists (select 1 from public.message_runtime where turn_event_id = p_turn_event_id) then return false; end if;
  if p_turn_number <> v_runtime.turn_count + 1 then raise exception 'invalid_turn_number'; end if;

  insert into public.messages (session_id, turn_number, sender, message_text)
  values (p_session_id, p_turn_number, 'user', p_user_message)
  returning id into v_user_message_id;

  insert into public.message_runtime (
    message_id, turn_event_id, message_status, error_category, latency_ms
  ) values (
    v_user_message_id, p_turn_event_id, 'failed', left(p_error_category, 80), greatest(p_total_latency_ms, 0)
  );

  update public.session_runtime
  set turn_count = p_turn_number, last_activity_at = now()
  where session_id = p_session_id;
  return true;
end;
$$;

create or replace function public.save_final_idea(
  p_session_id uuid,
  p_idea jsonb,
  p_submit boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sessions session
    join public.session_access access on access.session_id = session.id
    where session.id = p_session_id
      and access.consent_given
      and session.status in ('created', 'in_progress')
  ) then
    raise exception 'session_not_eligible';
  end if;

  if p_submit and (
    nullif(trim(p_idea->>'topic'), '') is null
    or nullif(trim(p_idea->>'problem'), '') is null
    or nullif(trim(p_idea->>'question'), '') is null
    or nullif(trim(p_idea->>'explanation'), '') is null
  ) then
    raise exception 'incomplete_final_idea';
  end if;

  insert into public.final_idea_drafts (
    session_id, research_topic, research_problem, research_question, short_explanation
  ) values (
    p_session_id,
    coalesce(p_idea->>'topic', ''),
    coalesce(p_idea->>'problem', ''),
    coalesce(p_idea->>'question', ''),
    coalesce(p_idea->>'explanation', '')
  )
  on conflict (session_id) do update set
    research_topic = excluded.research_topic,
    research_problem = excluded.research_problem,
    research_question = excluded.research_question,
    short_explanation = excluded.short_explanation;

  if p_submit then
    insert into public.final_ideas (
      session_id, research_topic, research_problem, research_question, submitted_at
    ) values (
      p_session_id,
      p_idea->>'topic',
      p_idea->>'problem',
      p_idea->>'question',
      now()
    )
    on conflict (session_id) do update set
      research_topic = excluded.research_topic,
      research_problem = excluded.research_problem,
      research_question = excluded.research_question,
      submitted_at = excluded.submitted_at;

    update public.session_runtime
    set final_submission_completed = true, last_activity_at = now()
    where session_id = p_session_id;
  end if;
end;
$$;

create or replace function public.submit_questionnaire(
  p_session_id uuid,
  p_questionnaire_version text,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer jsonb;
  v_started_at timestamptz;
begin
  select session.started_at into v_started_at
  from public.sessions session
  join public.session_access access on access.session_id = session.id
  join public.session_runtime runtime on runtime.session_id = session.id
  where session.id = p_session_id
    and access.consent_given
    and runtime.final_submission_completed
    and session.status = 'in_progress'
  for update of session;

  if not found then raise exception 'session_not_eligible'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) = 0 then
    raise exception 'invalid_questionnaire';
  end if;

  delete from public.post_session_responses where session_id = p_session_id;

  for v_answer in select * from jsonb_array_elements(p_answers) loop
    insert into public.post_session_responses (
      session_id, question_key, response_text, numeric_value
    ) values (
      p_session_id,
      v_answer->>'questionKey',
      nullif(v_answer->>'textValue', ''),
      nullif(v_answer->>'numericValue', '')::integer
    );
  end loop;

  update public.session_runtime
  set questionnaire_completed = true, last_activity_at = now()
  where session_id = p_session_id;

  update public.sessions
  set status = 'completed',
      ended_at = now(),
      duration_seconds = greatest(0, extract(epoch from (now() - coalesce(v_started_at, created_at)))::integer)
  where id = p_session_id;
end;
$$;

create or replace function public.admin_delete_session(
  p_session_id uuid,
  p_delete_participant boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
  v_phase text;
begin
  if not public.is_ideon_admin() then raise exception 'admin_required'; end if;

  select session.participant_id, runtime.study_phase
  into v_participant_id, v_phase
  from public.sessions session
  join public.session_runtime runtime on runtime.session_id = session.id
  where session.id = p_session_id;

  if not found then raise exception 'session_not_found'; end if;
  if v_phase = 'main' then raise exception 'main_study_deletion_requires_protocol_review'; end if;

  insert into public.audit_events (admin_user_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    case when p_delete_participant then 'delete_participant' else 'delete_test_session' end,
    case when p_delete_participant then 'participant' else 'session' end,
    case when p_delete_participant then v_participant_id else p_session_id end,
    jsonb_build_object('study_phase', v_phase)
  );

  if p_delete_participant then
    delete from public.participants where id = v_participant_id;
  else
    delete from public.sessions where id = p_session_id;
  end if;
end;
$$;

-- Row Level Security: participant-facing code uses server-side service-role
-- calls. Authenticated users can only read research data when they have a
-- researcher/admin profile. Session token hashes are never client-readable.
alter table public.participants enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.behavior_annotations enable row level security;
alter table public.final_ideas enable row level security;
alter table public.post_session_responses enable row level security;
alter table public.session_access enable row level security;
alter table public.session_runtime enable row level security;
alter table public.message_runtime enable row level security;
alter table public.automatic_behavior_predictions enable row level security;
alter table public.final_idea_drafts enable row level security;

create policy researcher_read_participants
on public.participants for select to authenticated
using (public.is_researcher());

create policy researcher_read_sessions
on public.sessions for select to authenticated
using (public.is_researcher());

create policy researcher_read_messages
on public.messages for select to authenticated
using (public.is_researcher());

create policy researcher_read_behavior_annotations
on public.behavior_annotations for select to authenticated
using (public.is_researcher());

create policy researcher_insert_behavior_annotations
on public.behavior_annotations for insert to authenticated
with check (
  public.is_researcher()
  and exists (
    select 1 from public.messages
    where messages.id = behavior_annotations.message_id
      and messages.sender = 'user'
  )
);

create policy researcher_update_behavior_annotations
on public.behavior_annotations for update to authenticated
using (public.is_researcher())
with check (
  public.is_researcher()
  and exists (
    select 1 from public.messages
    where messages.id = behavior_annotations.message_id
      and messages.sender = 'user'
  )
);

create policy researcher_read_final_ideas
on public.final_ideas for select to authenticated
using (public.is_researcher());

create policy researcher_read_post_session_responses
on public.post_session_responses for select to authenticated
using (public.is_researcher());

create policy researcher_read_session_runtime
on public.session_runtime for select to authenticated
using (public.is_researcher());

create policy researcher_read_message_runtime
on public.message_runtime for select to authenticated
using (public.is_researcher());

create policy researcher_read_automatic_predictions
on public.automatic_behavior_predictions for select to authenticated
using (public.is_researcher());

create policy researcher_read_final_idea_drafts
on public.final_idea_drafts for select to authenticated
using (public.is_researcher());

revoke all on public.participants, public.sessions, public.messages,
  public.behavior_annotations, public.final_ideas, public.post_session_responses,
  public.session_access, public.session_runtime, public.message_runtime,
  public.automatic_behavior_predictions, public.final_idea_drafts
from anon, authenticated;

grant select on public.participants, public.sessions, public.messages,
  public.final_ideas, public.post_session_responses, public.session_runtime,
  public.message_runtime, public.automatic_behavior_predictions,
  public.final_idea_drafts
to authenticated;

grant select, insert, update on public.behavior_annotations to authenticated;

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

notify pgrst, 'reload schema';
