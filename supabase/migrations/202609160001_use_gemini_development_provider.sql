update public.experiment_configs
set
  model_provider = 'google',
  model_name = 'Gemini 3.6 Flash',
  model_version = 'gemini-3.6-flash'
where config_version = 'ideon-v1'
  and study_phase = 'development'
  and frozen_at is null;
