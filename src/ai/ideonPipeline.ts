import { researchEventSink, type ResearchEventSink } from "./aiEvents.ts";
import { updateIdeationContext } from "./contextManager.ts";
import { detectExplicitIntent } from "./explicitIntentDetector.ts";
import { EXPERIMENT_CONFIG_VERSION, ideonConfig } from "./experimentConfig.ts";
import { createLLMClient, type LLMClient } from "./llmClient.ts";
import { buildPrompt } from "./promptBuilder.ts";
import { getSessionState, commitSessionState } from "./sessionStore.ts";
import { analyzeUserState } from "./stateAnalyzer.ts";
import { chooseStrategy } from "./strategyManager.ts";
import type { ChatTurnInput, ChatTurnResult, PreferredStrategy } from "./decisionTypes.ts";
import { STATE_CLASSIFIER_PROMPT_VERSION } from "./prompts/state-classifier.ts";
import { EXPLORE_PROMPT_VERSION } from "./prompts/explore.ts";
import { DEEPEN_PROMPT_VERSION } from "./prompts/deepen.ts";

export interface PipelineDependencies { client?: LLMClient; eventSink?: ResearchEventSink }

function updateModerateSignals(preferred: PreferredStrategy | undefined, confidence: number | undefined, current: PreferredStrategy | null, count: number) {
  if (!preferred || preferred === "keep_current" || confidence === undefined || confidence < ideonConfig.moderateSignalThreshold) return { preference: null as PreferredStrategy | null, count: 0 };
  return preferred === current ? { preference: preferred, count: count + 1 } : { preference: preferred, count: 1 };
}

export async function processIdeationTurn(input: ChatTurnInput, dependencies: PipelineDependencies = {}): Promise<ChatTurnResult> {
  const turnStartedAt = performance.now();
  const client = dependencies.client ?? createLLMClient(input.modelProvider);
  const eventSink = dependencies.eventSink ?? researchEventSink;
  const previousState = getSessionState(input.sessionId);
  const condition = previousState.condition ?? input.condition;
  const turnNumber = previousState.turnNumber + 1;
  const explicit = detectExplicitIntent(input.message);
  const stateStartedAt = performance.now();
  const stateAnalysis = condition === "adaptive" && !explicit.strategy ? await analyzeUserState({ latestUserMessage: input.message, recentMessages: input.recentMessages, currentStrategy: previousState.currentStrategy, currentIdea: previousState.context.currentDirection }, client) : undefined;
  const stateAnalysisLatencyMs = Math.round(performance.now() - stateStartedAt);
  const moderate = updateModerateSignals(stateAnalysis?.preferredStrategy, stateAnalysis?.confidence, previousState.pendingPreference, previousState.pendingPreferenceCount);
  const decision = chooseStrategy({ condition, currentStrategy: previousState.currentStrategy, stateAnalysis, explicitIntent: explicit.strategy, turnNumber, turnsSinceLastSwitch: turnNumber - previousState.lastStrategyChangeTurn, sessionSeed: input.sessionId, moderateSignalCount: moderate.count });
  const context = updateIdeationContext(previousState.context, input.message, stateAnalysis);
  context.currentStrategy = decision.selectedStrategy;
  const prompt = buildPrompt(decision.selectedStrategy, input.message, input.recentMessages, context);

  // No session decision is committed until generation succeeds. Network failures cannot change strategy.
  const responseStartedAt = performance.now();
  const response = await client.generateResponse(prompt);
  const llmResponseLatencyMs = Math.round(performance.now() - responseStartedAt);
  const event = {
    turnEventId: input.turnEventId ?? crypto.randomUUID(),
    sessionId: input.sessionId,
    turnNumber,
    condition,
    userMessage: input.message,
    explicitIntent: explicit.strategy,
    userOverride: decision.source === "user_override",
    detectedState: stateAnalysis?.state ?? null,
    stateConfidence: stateAnalysis?.confidence ?? null,
    stateEvidence: stateAnalysis?.evidence ?? [],
    previousStrategy: previousState.currentStrategy,
    selectedStrategy: decision.selectedStrategy,
    strategyChanged: decision.changed,
    decisionSource: decision.source,
    decisionReason: decision.shortReason,
    configVersion: input.configVersion ?? EXPERIMENT_CONFIG_VERSION,
    promptVersion: prompt.promptVersion,
    modelProvider: client.providerName ?? input.modelProvider ?? "unknown",
    modelVersion: client.modelName,
    statePromptVersion: input.statePromptVersion ?? STATE_CLASSIFIER_PROMPT_VERSION,
    explorePromptVersion: input.explorePromptVersion ?? EXPLORE_PROMPT_VERSION,
    deepenPromptVersion: input.deepenPromptVersion ?? DEEPEN_PROMPT_VERSION,
    stateAnalysisLatencyMs,
    llmResponseLatencyMs,
    totalTurnLatencyMs: Math.round(performance.now() - turnStartedAt),
    modelName: client.modelName,
    modelSettings: client.modelSettings,
    aiResponse: response,
    ideationContext: context,
    createdAt: new Date().toISOString(),
  } as const;
  await eventSink.recordTurn(event);
  commitSessionState(input.sessionId, { condition, context, currentStrategy: decision.selectedStrategy, turnNumber, lastStrategyChangeTurn: decision.changed ? turnNumber : previousState.lastStrategyChangeTurn, pendingPreference: decision.changed ? null : moderate.preference, pendingPreferenceCount: decision.changed ? 0 : moderate.count });
  return { response, event };
}
