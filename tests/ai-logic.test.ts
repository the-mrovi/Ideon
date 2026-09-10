import test from "node:test";
import assert from "node:assert/strict";
import { detectExplicitIntent } from "../src/ai/explicitIntentDetector.ts";
import { analyzeUserState, analyzeWithRules } from "../src/ai/stateAnalyzer.ts";
import { chooseStrategy, seededRandom } from "../src/ai/strategyManager.ts";
import { OpenAIResponsesClient, LLMGenerationError, type LLMClient } from "../src/ai/llmClient.ts";
import { processIdeationTurn } from "../src/ai/ideonPipeline.ts";
import { getSessionState, resetSessionState } from "../src/ai/sessionStore.ts";
import { buildPrompt } from "../src/ai/promptBuilder.ts";
import { createIdeationContext } from "../src/ai/contextManager.ts";
import type { StateAnalysisInput, StateAnalysisResult } from "../src/ai/decisionTypes.ts";

const baseInput: StateAnalysisInput = { latestUserMessage: "", recentMessages: [], currentStrategy: "deepen", currentIdea: "trust calibration" };
const cases = [
  ["I'm not sure what topic to choose.", "uncertain", "explore"],
  ["Give me other ideas.", "exploring", "explore"],
  ["I don't like this direction.", "rejecting", "explore"],
  ["I like the trust idea.", "interested", "deepen"],
  ["Okay.", "neutral", "keep_current"],
] as const;

for (const [message, state, preference] of cases) {
  test(`rules classify: ${message}`, () => {
    const result = analyzeWithRules({ ...baseInput, latestUserMessage: message });
    assert.equal(result?.state, state);
    assert.equal(result?.preferredStrategy, preference);
  });
}

test("explicit explore and deepen commands override prediction", () => {
  assert.equal(detectExplicitIntent("Give me other ideas.").strategy, "explore");
  assert.equal(detectExplicitIntent("Go deeper into number 2.").strategy, "deepen");
  assert.equal(detectExplicitIntent("Let's continue with this topic.").strategy, "deepen");
});

test("fixed mode never adapts to user state", () => {
  const decision = chooseStrategy({ condition: "fixed", currentStrategy: "deepen", stateAnalysis: { state: "rejecting", confidence: 1, preferredStrategy: "explore", evidence: [], shortReason: "Rejected." }, turnNumber: 4, turnsSinceLastSwitch: 3 });
  assert.equal(decision.selectedStrategy, "deepen");
  assert.equal(decision.source, "fixed");
});

test("seeded random mode is reproducible and ignores user state", () => {
  assert.equal(seededRandom("session-a", 3), seededRandom("session-a", 3));
  const common = { condition: "random" as const, currentStrategy: "deepen" as const, turnNumber: 3, turnsSinceLastSwitch: 2, sessionSeed: "session-a" };
  const exploreSignal = chooseStrategy({ ...common, stateAnalysis: { state: "rejecting", confidence: 1, preferredStrategy: "explore", evidence: [], shortReason: "Rejected." } });
  const deepenSignal = chooseStrategy({ ...common, stateAnalysis: { state: "committed", confidence: 1, preferredStrategy: "deepen", evidence: [], shortReason: "Committed." } });
  assert.equal(exploreSignal.selectedStrategy, deepenSignal.selectedStrategy);
  assert.equal(exploreSignal.randomValue, deepenSignal.randomValue);
});

test("adaptive mode switches on a strong state signal", () => {
  const decision = chooseStrategy({ condition: "adaptive", currentStrategy: "deepen", stateAnalysis: { state: "rejecting", confidence: 0.94, preferredStrategy: "explore", evidence: ["don't like"], shortReason: "User rejected the direction." }, turnNumber: 3, turnsSinceLastSwitch: 2 });
  assert.equal(decision.selectedStrategy, "explore");
  assert.equal(decision.changed, true);
  assert.equal(decision.source, "adaptive");
});

test("adaptive mode retains strategy for a low-confidence opposing signal", () => {
  const decision = chooseStrategy({ condition: "adaptive", currentStrategy: "deepen", stateAnalysis: { state: "uncertain", confidence: 0.49, preferredStrategy: "explore", evidence: [], shortReason: "Weak uncertainty." }, turnNumber: 3, turnsSinceLastSwitch: 2, moderateSignalCount: 1 });
  assert.equal(decision.selectedStrategy, "deepen");
  assert.equal(decision.changed, false);
});

test("two repeated moderate signals can switch without flapping", () => {
  const decision = chooseStrategy({ condition: "adaptive", currentStrategy: "deepen", stateAnalysis: { state: "uncertain", confidence: 0.61, preferredStrategy: "explore", evidence: [], shortReason: "Repeated uncertainty." }, turnNumber: 4, turnsSinceLastSwitch: 3, moderateSignalCount: 2 });
  assert.equal(decision.selectedStrategy, "explore");
});

test("adaptive explicit intent is recorded as a user override", () => {
  const decision = chooseStrategy({ condition: "adaptive", currentStrategy: "deepen", explicitIntent: "explore", turnNumber: 2, turnsSinceLastSwitch: 0 });
  assert.equal(decision.selectedStrategy, "explore");
  assert.equal(decision.source, "user_override");
});

test("malformed classifier output retries once then becomes neutral fallback", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "not-json" }] }] }), { status: 200, headers: { "Content-Type": "application/json" } }); };
  try {
    const client = new OpenAIResponsesClient("test-key");
    const result = await analyzeUserState({ ...baseInput, latestUserMessage: "I have thoughts about assessment design." }, client);
    assert.equal(calls, 2);
    assert.equal(result.state, "neutral");
    assert.equal(result.confidence, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("generation failure does not commit a strategy change", async () => {
  const sessionId = "failure-session";
  resetSessionState(sessionId);
  const client: LLMClient = {
    modelName: "test-model",
    modelSettings: {},
    async classifyState(): Promise<StateAnalysisResult> { throw new Error("should not be called for deterministic input"); },
    async generateResponse(): Promise<string> { throw new LLMGenerationError("network down"); },
  };
  await assert.rejects(() => processIdeationTurn({ sessionId, condition: "adaptive", message: "I like the trust idea.", recentMessages: [] }, { client, eventSink: { async recordTurn() {} } }), LLMGenerationError);
  assert.equal(getSessionState(sessionId).turnNumber, 0);
  assert.equal(getSessionState(sessionId).currentStrategy, null);
});

test("explore and deepen build distinct, versioned behavioral prompts", () => {
  const context = createIdeationContext();
  context.rejectedIdeas.push("AI plagiarism detection");
  const explore = buildPrompt("explore", "What else could I study?", [], context);
  const deepen = buildPrompt("deepen", "Help me refine this.", [], context);
  assert.match(explore.instructions, /Generate 3–5 meaningfully different research directions/);
  assert.match(deepen.instructions, /narrow the topic into a clearer problem/);
  assert.match(explore.instructions, /Do not repeat these rejected directions: AI plagiarism detection/);
  assert.notEqual(explore.promptVersion, deepen.promptVersion);
});

test("successful turns emit structured metadata and update idea context", async () => {
  const sessionId = "successful-session";
  resetSessionState(sessionId);
  const events: unknown[] = [];
  const client: LLMClient = {
    modelName: "test-model",
    modelSettings: { maxOutputTokens: 420 },
    async classifyState(): Promise<StateAnalysisResult> { throw new Error("deterministic rule should handle this message"); },
    async generateResponse(): Promise<string> { return "Let’s define the population and learning outcome for this direction."; },
  };
  const result = await processIdeationTurn({ sessionId, condition: "adaptive", message: "Let's use the trust calibration idea.", recentMessages: [] }, { client, eventSink: { async recordTurn(event) { events.push(event); } } });
  assert.equal(result.event.selectedStrategy, "deepen");
  assert.equal(result.event.decisionSource, "adaptive");
  assert.equal(result.event.modelName, "test-model");
  assert.equal(result.event.ideationContext.selectedIdeas.length, 1);
  assert.equal(events.length, 1);
  assert.equal(getSessionState(sessionId).turnNumber, 1);
});
