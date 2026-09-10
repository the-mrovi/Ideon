import { ideonConfig } from "./experimentConfig.ts";
import type { ActiveStrategy, StrategyDecision, StrategyDecisionInput } from "./decisionTypes.ts";

export function seededRandom(seed: string, turnNumber: number): number {
  let hash = 2166136261;
  const input = `${seed}:${turnNumber}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13; hash ^= hash >>> 7; hash += hash << 3; hash ^= hash >>> 17; hash += hash << 5;
  return (hash >>> 0) / 4294967296;
}

function fallbackStrategy(current: ActiveStrategy | null): ActiveStrategy {
  return current ?? ideonConfig.fixedStrategy;
}

export function chooseStrategy(input: StrategyDecisionInput): StrategyDecision {
  const previous = input.currentStrategy;
  const baselineOverridesEnabled = ideonConfig.enableParticipantOverridesInBaselines;
  if (input.explicitIntent && (input.condition === "adaptive" || baselineOverridesEnabled)) {
    return { selectedStrategy: input.explicitIntent, previousStrategy: previous, changed: previous !== null && previous !== input.explicitIntent, source: "user_override", confidence: 1, shortReason: "User explicitly requested this collaboration behavior." };
  }

  if (input.condition === "fixed") {
    return { selectedStrategy: ideonConfig.fixedStrategy, previousStrategy: previous, changed: previous !== null && previous !== ideonConfig.fixedStrategy, source: "fixed", shortReason: "Configured fixed baseline strategy." };
  }

  if (input.condition === "random") {
    const randomValue = seededRandom(input.sessionSeed ?? "ideon-default-seed", input.turnNumber);
    const selectedStrategy = randomValue < ideonConfig.randomExploreProbability ? "explore" : "deepen";
    return { selectedStrategy, previousStrategy: previous, changed: previous !== null && previous !== selectedStrategy, source: "random", shortReason: `Seeded random baseline draw compared with configured probability ${ideonConfig.randomExploreProbability}.`, randomValue };
  }

  const analysis = input.stateAnalysis;
  if (!analysis) {
    const selectedStrategy = fallbackStrategy(previous);
    return { selectedStrategy, previousStrategy: previous, changed: false, source: "fallback", confidence: 0, state: "neutral", shortReason: "No valid state analysis was available; kept the current strategy." };
  }

  const preferred = analysis.preferredStrategy;
  if (previous === null) {
    const selectedStrategy = preferred === "keep_current" ? ideonConfig.fixedStrategy : preferred;
    return { selectedStrategy, previousStrategy: null, changed: false, source: preferred === "keep_current" ? "fallback" : "adaptive", confidence: analysis.confidence, state: analysis.state, shortReason: preferred === "keep_current" ? "Neutral first turn used the configured initial strategy." : analysis.shortReason };
  }
  if (preferred === "keep_current" || preferred === previous) {
    return { selectedStrategy: previous, previousStrategy: previous, changed: false, source: "adaptive", confidence: analysis.confidence, state: analysis.state, shortReason: preferred === "keep_current" ? "No reliable signal supported changing the current strategy." : analysis.shortReason };
  }

  const intervalSatisfied = input.turnsSinceLastSwitch >= ideonConfig.minTurnsBeforeAutomaticSwitch;
  const strongSignal = analysis.confidence >= ideonConfig.switchConfidenceThreshold;
  const repeatedModerateSignal = analysis.confidence >= ideonConfig.moderateSignalThreshold && (input.moderateSignalCount ?? 0) >= 2;
  if (intervalSatisfied && (strongSignal || repeatedModerateSignal)) {
    return { selectedStrategy: preferred, previousStrategy: previous, changed: true, source: "adaptive", confidence: analysis.confidence, state: analysis.state, shortReason: analysis.shortReason };
  }
  return { selectedStrategy: previous, previousStrategy: previous, changed: false, source: "adaptive", confidence: analysis.confidence, state: analysis.state, shortReason: intervalSatisfied ? "Signal was below the switching threshold, so the current strategy was retained." : "Minimum turn interval prevented an automatic switch." };
}
