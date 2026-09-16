import type { ExperimentCondition } from "../../types/study.ts";
import type { ActiveStrategy, IdeationContext, PreferredStrategy } from "./decisionTypes.ts";
import { createIdeationContext } from "./contextManager.ts";

export interface IdeonSessionState {
  condition: ExperimentCondition | null;
  context: IdeationContext;
  currentStrategy: ActiveStrategy | null;
  turnNumber: number;
  lastStrategyChangeTurn: number;
  pendingPreference: PreferredStrategy | null;
  pendingPreferenceCount: number;
}

const sessions = new Map<string, IdeonSessionState>();

export function createSessionState(): IdeonSessionState {
  return { condition: null, context: createIdeationContext(), currentStrategy: null, turnNumber: 0, lastStrategyChangeTurn: 0, pendingPreference: null, pendingPreferenceCount: 0 };
}

export function getSessionState(sessionId: string): IdeonSessionState {
  const current = sessions.get(sessionId);
  if (current) return structuredClone(current);
  return createSessionState();
}

export function commitSessionState(sessionId: string, state: IdeonSessionState) { sessions.set(sessionId, structuredClone(state)); }
export function hydrateSessionState(sessionId: string, state: IdeonSessionState) { sessions.set(sessionId, structuredClone(state)); }
export function resetSessionState(sessionId: string) { sessions.delete(sessionId); }
