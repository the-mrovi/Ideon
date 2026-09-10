import type { ChatMessage, ExperimentCondition } from "../../types/study.ts";

export type Strategy = "explore" | "deepen" | "wait";
export type ActiveStrategy = Exclude<Strategy, "wait">;
export type UserState = "uncertain" | "exploring" | "interested" | "committed" | "rejecting" | "stuck" | "neutral";
export type PreferredStrategy = ActiveStrategy | "keep_current";

export interface StateAnalysisInput {
  latestUserMessage: string;
  recentMessages: ChatMessage[];
  currentStrategy: ActiveStrategy | null;
  currentIdea?: string | null;
}

export interface StateAnalysisResult {
  state: UserState;
  confidence: number;
  preferredStrategy: PreferredStrategy;
  evidence: string[];
  shortReason: string;
}

export interface StrategyDecisionInput {
  condition: ExperimentCondition;
  currentStrategy: ActiveStrategy | null;
  stateAnalysis?: StateAnalysisResult;
  explicitIntent?: ActiveStrategy | null;
  turnNumber: number;
  turnsSinceLastSwitch: number;
  sessionSeed?: string;
  moderateSignalCount?: number;
}

export interface StrategyDecision {
  selectedStrategy: ActiveStrategy;
  previousStrategy: ActiveStrategy | null;
  changed: boolean;
  source: "fixed" | "random" | "adaptive" | "user_override" | "fallback";
  confidence?: number;
  state?: UserState;
  shortReason: string;
  randomValue?: number;
}

export interface IdeationContext {
  originalTopic?: string;
  currentDirection?: string;
  selectedIdeas: string[];
  rejectedIdeas: string[];
  userGoals?: string[];
  currentStrategy?: ActiveStrategy;
}

export interface IdeonTurnEvent {
  sessionId: string;
  turnNumber: number;
  condition: ExperimentCondition;
  userMessage: string;
  explicitIntent?: ActiveStrategy | null;
  userOverride: boolean;
  detectedState?: UserState | null;
  stateConfidence?: number | null;
  stateEvidence?: string[];
  previousStrategy?: ActiveStrategy | null;
  selectedStrategy: ActiveStrategy;
  strategyChanged: boolean;
  decisionSource: StrategyDecision["source"];
  decisionReason: string;
  configVersion: string;
  promptVersion: string;
  modelName: string;
  modelSettings: Record<string, unknown>;
  aiResponse: string;
  ideationContext: IdeationContext;
  createdAt: string;
}

export interface ChatTurnInput {
  sessionId: string;
  condition: ExperimentCondition;
  message: string;
  recentMessages: ChatMessage[];
}

export interface ChatTurnResult {
  response: string;
  event: IdeonTurnEvent;
}
