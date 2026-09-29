create extension if not exists pgcrypto;

create sequence if not exists public.ideon_participant_code_seq start 1;

create table public.experiment_configs (
  id uuid primary key default gen_random_uuid(),
  config_version text not null unique,
  study_phase text not null check (study_phase in ('development', 'pilot', 'main')),
  assignment_method text not null check (assignment_method in ('manual', 'balanced_random', 'simple_random')),
  model_provider text not null,
  model_name text not null,
  model_version text not null,
  fixed_strategy text not null check (fixed_strategy in ('explore', 'deepen')),
  random_explore_probability numeric(4,3) not null check (random_explore_probability between 0 and 1),
  switch_confidence_threshold numeric(4,3) not null check (switch_confidence_threshold between 0 and 1),
  moderate_signal_threshold numeric(4,3) not null check (moderate_signal_threshold between 0 and 1),
  state_context_messages integer not null check (state_context_messages > 0),
  min_turns_before_switch integer not null check (min_turns_before_switch >= 0),
  wait_strategy_enabled boolean not null default false,
  state_prompt_version text not null,
  explore_prompt_version text not null,
  deepen_prompt_version text not null,
  questionnaire_version text not null,
  consent_version text not null,
  task_version text not null,
  assigned_task text not null,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  frozen_at timestamptz
);

create unique index experiment_configs_one_active_per_phase
  on public.experiment_configs (study_phase) where is_active;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  participant_code text not null unique,
  study_version text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  session_code text not null unique,
  session_token_hash text not null unique,
  participant_id uuid not null references public.participants(id) on delete cascade,
  experiment_config_id uuid not null references public.experiment_configs(id),
  experiment_condition text not null check (experiment_condition in ('fixed', 'random', 'adaptive')),
  experiment_config_version text not null,
  study_phase text not null check (study_phase in ('development', 'pilot', 'main')),
  status text not null default 'created' check (status in ('created', 'consented', 'in_progress', 'final_submitted', 'questionnaire_completed', 'completed', 'withdrawn', 'abandoned')),
  model_provider text not null,
  model_name text not null,
  model_version text not null,
  state_prompt_version text not null,
  explore_prompt_version text not null,
  deepen_prompt_version text not null,
  task_version text not null,
  assigned_task text not null,
  original_topic text,
  current_direction text,
  selected_ideas jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_ideas) = 'array'),
  rejected_ideas jsonb not null default '[]'::jsonb check (jsonb_typeof(rejected_ideas) = 'array'),
  current_strategy text check (current_strategy in ('explore', 'deepen')),
  turn_count integer not null default 0 check (turn_count >= 0),
  consent_version text,
  consent_given boolean not null default false,
  read_study_information boolean not null default false,
  understands_recording boolean not null default false,
  agrees_to_participate boolean not null default false,
  consent_timestamp timestamptz,
  final_submission_completed boolean not null default false,
  questionnaire_completed boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  turn_event_id uuid not null,
  turn_number integer not null check (turn_number > 0),
  role text not null check (role in ('user', 'assistant', 'system_generated')),
  content text not null,
  message_status text not null default 'completed' check (message_status in ('pending', 'completed', 'failed')),
  error_category text,
  model_message_id text,
  token_input integer check (token_input is null or token_input >= 0),
  token_output integer check (token_output is null or token_output >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, turn_event_id, role),
  unique (session_id, turn_number, role)
);

create table public.strategy_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  turn_event_id uuid not null,
  turn_number integer not null check (turn_number > 0),
  experiment_condition text not null check (experiment_condition in ('fixed', 'random', 'adaptive')),
  explicit_intent text check (explicit_intent is null or explicit_intent in ('explore', 'deepen')),
  user_override boolean not null default false,
  override_source text,
  detected_state text check (detected_state is null or detected_state in ('uncertain', 'exploring', 'interested', 'committed', 'rejecting', 'stuck', 'neutral')),
  state_confidence numeric(5,4) check (state_confidence is null or state_confidence between 0 and 1),
  state_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(state_evidence) = 'array'),
  previous_strategy text check (previous_strategy is null or previous_strategy in ('explore', 'deepen', 'wait')),
  selected_strategy text not null check (selected_strategy in ('explore', 'deepen', 'wait')),
  strategy_changed boolean not null,
  decision_source text not null check (decision_source in ('fixed', 'random', 'adaptive', 'user_override', 'fallback')),
  decision_reason text,
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

create table public.idea_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  event_type text not null check (event_type in ('suggested', 'selected', 'rejected', 'revisited', 'refined')),
  idea_text text not null check (length(trim(idea_text)) > 0),
  source text not null check (source in ('user', 'ai', 'mixed')),
  created_at timestamptz not null default now()
);

create table public.final_ideas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.study_sessions(id) on delete cascade,
  research_topic text not null default '',
  research_problem text not null default '',
  research_question text not null default '',
  short_explanation text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'submitted' or submitted_at is not null)
);

create table public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.study_sessions(id) on delete cascade,
  questionnaire_version text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  questionnaire_response_id uuid not null references public.questionnaire_responses(id) on delete cascade,
  question_key text not null,
  construct text not null check (construct in ('creativity', 'control', 'ownership', 'trust', 'reliance', 'cognitive_load', 'satisfaction')),
  numeric_value integer check (numeric_value is null or numeric_value between 1 and 5),
  text_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (questionnaire_response_id, question_key),
  check (numeric_value is not null or nullif(trim(text_value), '') is not null)
);

create table public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  role text not null check (role in ('researcher', 'admin')),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('export_data', 'delete_test_session', 'delete_participant', 'freeze_experiment_config', 'activate_experiment_config')),
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index study_sessions_participant_idx on public.study_sessions (participant_id);
create index study_sessions_condition_idx on public.study_sessions (experiment_condition);
create index study_sessions_status_idx on public.study_sessions (status);
create index study_sessions_phase_created_idx on public.study_sessions (study_phase, created_at desc);
create index messages_session_turn_idx on public.messages (session_id, turn_number);
create index strategy_events_session_turn_idx on public.strategy_events (session_id, turn_number);
create index strategy_events_strategy_idx on public.strategy_events (selected_strategy);
create index strategy_events_state_idx on public.strategy_events (detected_state);
create index idea_events_session_idx on public.idea_events (session_id, turn_number);
create index questionnaire_answers_response_idx on public.questionnaire_answers (questionnaire_response_id);
create index audit_events_created_idx on public.audit_events (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger study_sessions_set_updated_at before update on public.study_sessions
for each row execute function public.set_updated_at();
create trigger final_ideas_set_updated_at before update on public.final_ideas
for each row execute function public.set_updated_at();
create trigger questionnaire_responses_set_updated_at before update on public.questionnaire_responses
for each row execute function public.set_updated_at();
create trigger questionnaire_answers_set_updated_at before update on public.questionnaire_answers
for each row execute function public.set_updated_at();

create or replace function public.protect_session_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.participant_id is distinct from new.participant_id
     or old.experiment_config_id is distinct from new.experiment_config_id
     or old.experiment_condition is distinct from new.experiment_condition
     or old.experiment_config_version is distinct from new.experiment_config_version
     or old.study_phase is distinct from new.study_phase
     or old.task_version is distinct from new.task_version
     or old.assigned_task is distinct from new.assigned_task then
    raise exception 'session_assignment_is_immutable';
  end if;
  return new;
end;
$$;

create trigger study_sessions_protect_assignment before update on public.study_sessions
for each row execute function public.protect_session_assignment();

create or replace function public.protect_frozen_experiment_config()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.frozen_at is not null and (
    old.config_version is distinct from new.config_version
    or old.study_phase is distinct from new.study_phase
    or old.assignment_method is distinct from new.assignment_method
    or old.model_provider is distinct from new.model_provider
    or old.model_name is distinct from new.model_name
    or old.model_version is distinct from new.model_version
    or old.fixed_strategy is distinct from new.fixed_strategy
    or old.random_explore_probability is distinct from new.random_explore_probability
    or old.switch_confidence_threshold is distinct from new.switch_confidence_threshold
    or old.moderate_signal_threshold is distinct from new.moderate_signal_threshold
    or old.state_context_messages is distinct from new.state_context_messages
    or old.min_turns_before_switch is distinct from new.min_turns_before_switch
    or old.wait_strategy_enabled is distinct from new.wait_strategy_enabled
    or old.state_prompt_version is distinct from new.state_prompt_version
    or old.explore_prompt_version is distinct from new.explore_prompt_version
    or old.deepen_prompt_version is distinct from new.deepen_prompt_version
    or old.questionnaire_version is distinct from new.questionnaire_version
    or old.consent_version is distinct from new.consent_version
    or old.task_version is distinct from new.task_version
    or old.assigned_task is distinct from new.assigned_task
    or old.configuration is distinct from new.configuration
    or old.frozen_at is distinct from new.frozen_at
  ) then
    raise exception 'frozen_experiment_config_is_immutable';
  end if;
  return new;
end;
$$;

create trigger experiment_configs_protect_frozen before update on public.experiment_configs
for each row execute function public.protect_frozen_experiment_config();

create or replace function public.prevent_research_record_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'research_record_is_append_only';
end;
$$;

create trigger messages_append_only before update on public.messages
for each row execute function public.prevent_research_record_update();
create trigger strategy_events_append_only before update on public.strategy_events
for each row execute function public.prevent_research_record_update();
create trigger idea_events_append_only before update on public.idea_events
for each row execute function public.prevent_research_record_update();
