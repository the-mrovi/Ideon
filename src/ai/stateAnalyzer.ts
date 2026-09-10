import { ideonConfig, stateToPreferredStrategy } from "./experimentConfig.ts";
import type { LLMClient } from "./llmClient.ts";
import type { ActiveStrategy, StateAnalysisInput, StateAnalysisResult, UserState } from "./decisionTypes.ts";

interface Rule { state: UserState; confidence: number; patterns: RegExp[]; reason: string }

const RULES: Rule[] = [
  { state: "rejecting", confidence: 0.94, reason: "User rejected or questioned the current direction.", patterns: [/\bi don'?t like\b/i, /\bnot this (one|direction|topic)\b/i, /\b(isn'?t|is not) what i want\b/i, /\btoo (common|broad|narrow|obvious)\b/i, /\bwrong direction\b/i] },
  { state: "committed", confidence: 0.92, reason: "User clearly selected a direction to continue.", patterns: [/\b(this is the one|this will be my topic|let'?s use .+|go with .+|i (want|will) (to )?(continue|focus|use|choose))\b/i, /\bi want (number|option|idea)\s*\d+\b/i] },
  { state: "uncertain", confidence: 0.9, reason: "User expressed uncertainty about which direction to choose.", patterns: [/\b(i don'?t (really )?know|i do not (really )?know|not sure|no idea|can'?t decide|cannot decide|which (one|direction|topic).*(choose|pick))\b/i, /\bmaybe something else\b/i] },
  { state: "exploring", confidence: 0.88, reason: "User is comparing or requesting multiple possibilities.", patterns: [/\b(what other|what else|other ideas?|alternatives?|different ideas?|different directions?|a few ideas?|compare (these|options))\b/i] },
  { state: "stuck", confidence: 0.84, reason: "User reported difficulty progressing the current idea.", patterns: [/\b(i'?m stuck|i am stuck|what (do|should) i do next|how (do|can) (we|i) continue|can'?t make (this|it) more specific|don'?t know how to continue)\b/i] },
  { state: "interested", confidence: 0.82, reason: "User showed positive interest in a particular direction.", patterns: [/\b(i like|sounds interesting|seems interesting|this interests me|worth exploring|maybe we can work on)\b/i] },
  { state: "neutral", confidence: 0.78, reason: "Message acknowledges the conversation without a clear change signal.", patterns: [/^\s*(okay|ok|alright|i understand|continue|sure|yes|right)\s*[.!]?\s*$/i] },
];

function contextualPreference(state: UserState, input: StateAnalysisInput): "explore" | "deepen" | "keep_current" {
  if (state !== "stuck") {
    const mapped = stateToPreferredStrategy[state];
    return mapped === "contextual" ? "keep_current" : mapped;
  }
  const rejectionSignal = /\b(change|different|wrong|don'?t like|not working|give up)\b/i.test(input.latestUserMessage);
  if (rejectionSignal) return "explore";
  if (input.currentIdea || input.currentStrategy === "deepen") return "deepen";
  return "explore";
}

export function analyzeWithRules(input: StateAnalysisInput): StateAnalysisResult | null {
  for (const rule of RULES) {
    const matches = rule.patterns.flatMap((pattern) => input.latestUserMessage.match(pattern)?.[0] ?? []);
    if (matches.length) return { state: rule.state, confidence: rule.confidence, preferredStrategy: contextualPreference(rule.state, input), evidence: matches.slice(0, 2), shortReason: rule.reason };
  }
  return null;
}

export function neutralFallback(reason = "State classification did not produce a reliable result."): StateAnalysisResult {
  return { state: "neutral", confidence: 0, preferredStrategy: "keep_current", evidence: [], shortReason: reason };
}

export async function analyzeUserState(input: StateAnalysisInput, client: LLMClient): Promise<StateAnalysisResult> {
  const deterministic = analyzeWithRules(input);
  if (deterministic) return deterministic;
  const boundedInput = { ...input, recentMessages: input.recentMessages.slice(-ideonConfig.stateContextMessages) };
  try {
    const result = await client.classifyState(boundedInput);
    if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) return neutralFallback("Classifier returned an invalid confidence score.");
    const allowedStates: UserState[] = ["uncertain", "exploring", "interested", "committed", "rejecting", "stuck", "neutral"];
    if (!allowedStates.includes(result.state)) return neutralFallback("Classifier returned an unsupported state.");
    return { ...result, preferredStrategy: contextualPreference(result.state, input), evidence: result.evidence.slice(0, 3), shortReason: result.shortReason.slice(0, 180) };
  } catch {
    return neutralFallback();
  }
}

export function acceptsCurrentDirection(message: string, currentStrategy: ActiveStrategy | null) {
  return !/\b(change|different|reject|don'?t like|not this)\b/i.test(message) && currentStrategy === "deepen";
}
