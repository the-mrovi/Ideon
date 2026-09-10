import type { UserState, PreferredStrategy } from "./decisionTypes.ts";

export const EXPERIMENT_CONFIG_VERSION = "ideon-v1";

export const ideonConfig = Object.freeze({
  condition: "adaptive" as const,
  fixedStrategy: "deepen" as const,
  randomExploreProbability: 0.5,
  switchConfidenceThreshold: 0.72,
  moderateSignalThreshold: 0.55,
  stateContextMessages: 6,
  minTurnsBeforeAutomaticSwitch: 1,
  enableParticipantOverridesInBaselines: false,
  provider: "openai" as const,
  model: "gpt-5.4-mini-2026-03-17",
  reasoningEffort: "none" as const,
  maxOutputTokens: 420,
  targetResponseWords: "100-220",
});

export const stateToPreferredStrategy: Record<UserState, PreferredStrategy | "contextual"> = Object.freeze({
  uncertain: "explore",
  exploring: "explore",
  interested: "deepen",
  committed: "deepen",
  rejecting: "explore",
  stuck: "contextual",
  neutral: "keep_current",
});
