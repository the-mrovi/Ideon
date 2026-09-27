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
import { buildSupabaseHeaders, isLegacySupabaseJwt } from "../src/db/supabaseHeaders.ts";

const baseInput: StateAnalysisInput = { latestUserMessage: "", recentMessages: [], currentStrategy: "deepen", currentIdea: "trust calibration" };
const cases = [
  ["I'm not sure what topic to choose.", "uncertain", "explore"],
  ["Give me other ideas.", "exploring", "explore"],
  ["I don't like this direction.", "rejecting", "explore"],
  ["I like the trust idea.", "interested", "deepen"],
  ["Okay.", "neutral", "keep_current"],
] as const;

test("Supabase secret keys are sent only as API keys", () => {
  assert.deepEqual(buildSupabaseHeaders("sb_secret_example"), { apikey: "sb_secret_example" });
  assert.deepEqual(buildSupabaseHeaders("sb_publishable_example"), { apikey: "sb_publishable_example" });
});

test("legacy service-role JWTs and user sessions retain Bearer authorization", () => {
  const legacy = "eyJheader.payload.signature";
  assert.equal(isLegacySupabaseJwt(legacy), true);
  assert.deepEqual(buildSupabaseHeaders(legacy), { apikey: legacy, Authorization: `Bearer ${legacy}` });
  assert.deepEqual(buildSupabaseHeaders("sb_publishable_example", "user.jwt.token"), { apikey: "sb_publishable_example", Authorization: "Bearer user.jwt.token" });
});

for (const [message, state, preference] of cases) {
  test(`rules classify: ${message}`, () => {
    const result = analyzeWithRules({ ...baseInput, latestUserMessage: message });
    assert.equal(result?.state, state);
    assert.equal(result?.preferredStrategy, preference);
  });
}

test("explicit explore and deepen commands override prediction", () => {
  assert.equal(detectExplicitIntent("Give me other ideas.").strategy, "explore");
  assert.equal(detectExplicitIntent("Give me another direction.").strategy, "explore");
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
  assert.equal(exploreSignal.randomExploreProbability, 0.5);
});

test("random mode can select both shared strategies without state classification", () => {
  const decisions = Array.from({ length: 40 }, (_, index) => chooseStrategy({ condition: "random", currentStrategy: null, turnNumber: 1, turnsSinceLastSwitch: 1, sessionSeed: `random-session-${index}` }));
  assert.equal(decisions.some((decision) => decision.selectedStrategy === "explore"), true);
  assert.equal(decisions.some((decision) => decision.selectedStrategy === "deepen"), true);
  assert.equal(decisions.every((decision) => decision.source === "random" && decision.randomValue !== undefined), true);
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

test("state classification receives only the configured recent context window", async () => {
  let received = 0;
  const client: LLMClient = {
    modelName: "test-model",
    modelSettings: {},
    async classifyState(input): Promise<StateAnalysisResult> { received = input.recentMessages.length; return { state: "neutral", confidence: 0.2, preferredStrategy: "keep_current", evidence: [], shortReason: "No clear signal." }; },
    async generateResponse(): Promise<string> { return "unused"; },
  };
  const recentMessages = Array.from({ length: 10 }, (_, index) => ({ id: String(index), role: index % 2 ? "assistant" as const : "user" as const, content: `Message ${index}`, createdAt: "Now" }));
  await analyzeUserState({ ...baseInput, latestUserMessage: "I have thoughts about assessment design.", recentMessages }, client);
  assert.equal(received, 6);
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
  assert.match(explore.instructions, /3–5 meaningfully different research directions/);
  assert.match(deepen.instructions, /Narrow gradually from broad topic/);
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

test("exact adaptive scenario logs Explore, Deepen, Deepen, Explore", async () => {
  const sessionId = "adaptive-scenario";
  resetSessionState(sessionId);
  const events: Array<{ selectedStrategy: string; decisionSource: string }> = [];
  const recentMessages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }> = [];
  const client: LLMClient = {
    modelName: "same-test-model",
    modelSettings: { maxOutputTokens: 420 },
    async classifyState(): Promise<StateAnalysisResult> { throw new Error("The deterministic rules should classify this scenario."); },
    async generateResponse(): Promise<string> { return "A concise Ideon response."; },
  };
  const messages = [
    "I want to research AI in education but I don't know what topic.",
    "The student trust idea seems interesting.",
    "Tell me more about trust calibration.",
    "Actually this seems too common. Give me another direction.",
  ];
  for (const [index, message] of messages.entries()) {
    const result = await processIdeationTurn({ sessionId, condition: "adaptive", message, recentMessages }, { client, eventSink: { async recordTurn(event) { events.push(event); } } });
    recentMessages.push({ id: `u-${index}`, role: "user", content: message, createdAt: "Now" }, { id: `a-${index}`, role: "assistant", content: result.response, createdAt: "Now" });
  }
  assert.deepEqual(events.map((event) => event.selectedStrategy), ["explore", "deepen", "deepen", "explore"]);
  assert.deepEqual(events.map((event) => event.decisionSource), ["adaptive", "adaptive", "user_override", "user_override"]);
});

test("random turns emit draw metadata and use the same shared prompt builder", async () => {
  const sessionId = "random-pipeline";
  resetSessionState(sessionId);
  let classifierCalls = 0;
  let instructions = "";
  const client: LLMClient = {
    modelName: "same-test-model",
    modelSettings: { maxOutputTokens: 420 },
    async classifyState(): Promise<StateAnalysisResult> { classifierCalls += 1; return { state: "committed", confidence: 1, preferredStrategy: "deepen", evidence: [], shortReason: "Should not run." }; },
    async generateResponse(input): Promise<string> { instructions = input.instructions; return "A useful response."; },
  };
  const result = await processIdeationTurn({ sessionId, condition: "random", message: "I don't like this direction.", recentMessages: [] }, { client, eventSink: { async recordTurn() {} } });
  assert.equal(classifierCalls, 0);
  assert.equal(result.event.decisionSource, "random");
  assert.equal(typeof result.event.randomValue, "number");
  assert.equal(result.event.randomExploreProbability, 0.5);
  const expected = buildPrompt(result.event.selectedStrategy, "I don't like this direction.", [], result.event.ideationContext);
  assert.equal(instructions, expected.instructions);
});
