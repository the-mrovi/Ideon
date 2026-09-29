insert into public.experiment_configs (
  config_version, study_phase, assignment_method, model_provider, model_name, model_version,
  fixed_strategy, random_explore_probability, switch_confidence_threshold, moderate_signal_threshold,
  state_context_messages, min_turns_before_switch, wait_strategy_enabled,
  state_prompt_version, explore_prompt_version, deepen_prompt_version,
  questionnaire_version, consent_version, task_version, assigned_task, configuration, is_active
) values (
  'ideon-v1', 'development', 'balanced_random', 'google', 'Gemini 3.6 Flash', 'gemini-3.6-flash',
  'deepen', 0.5, 0.72, 0.55, 6, 1, false,
  'state-classifier-v1.0.0', 'explore-v1.0.0', 'deepen-v1.0.0',
  'ideon-questionnaire-v1', 'ideon-consent-v1', 'ideon-task-v1',
  'Develop a specific research problem and final research question about Generative AI in University Education.',
  '{"targetResponseWords":"100-220","participantOverrideInBaselines":false}'::jsonb,
  true
);
