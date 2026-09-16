import { ideonConfig } from "./experimentConfig.ts";
import { STATE_CLASSIFIER_INSTRUCTIONS } from "./prompts/state-classifier.ts";
import type { BuiltPrompt } from "./promptBuilder.ts";
import type { StateAnalysisInput, StateAnalysisResult, UserState, PreferredStrategy } from "./decisionTypes.ts";

export type LLMGenerationInput = BuiltPrompt;

export interface LLMClient {
  readonly providerName?: string;
  readonly modelName: string;
  readonly modelSettings: Record<string, unknown>;
  generateResponse(input: LLMGenerationInput): Promise<string>;
  classifyState(input: StateAnalysisInput): Promise<StateAnalysisResult>;
}

export class LLMConfigurationError extends Error {
  constructor() { super("No supported language-model provider is configured."); this.name = "LLMConfigurationError"; }
}

export class LLMGenerationError extends Error {
  constructor(message = "The language model could not complete the response.") { super(message); this.name = "LLMGenerationError"; }
}

interface ResponsesPayload {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}

interface GeminiPayload {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

function extractOutputText(payload: ResponsesPayload): string {
  return payload.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text?.trim()).filter(Boolean).join("\n") ?? "";
}

function isState(value: unknown): value is UserState {
  return ["uncertain", "exploring", "interested", "committed", "rejecting", "stuck", "neutral"].includes(String(value));
}

function isPreference(value: unknown): value is PreferredStrategy {
  return ["explore", "deepen", "keep_current"].includes(String(value));
}

export class OpenAIResponsesClient implements LLMClient {
  readonly providerName = "openai";
  readonly modelName: string;
  readonly modelSettings = Object.freeze({ maxOutputTokens: ideonConfig.maxOutputTokens, reasoningEffort: ideonConfig.reasoningEffort, store: false });
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.OPENAI_API_KEY, modelName = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini-2026-03-17") { this.apiKey = apiKey; this.modelName = modelName; }

  private async request(body: Record<string, unknown>): Promise<ResponsesPayload> {
    if (!this.apiKey) throw new LLMConfigurationError();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new LLMGenerationError(`OpenAI request failed with status ${response.status}.`);
      return await response.json() as ResponsesPayload;
    } catch (error) {
      if (error instanceof LLMConfigurationError || error instanceof LLMGenerationError) throw error;
      throw new LLMGenerationError(error instanceof Error ? error.message : undefined);
    } finally { clearTimeout(timeout); }
  }

  async generateResponse(input: LLMGenerationInput): Promise<string> {
    const payload = await this.request({ model: this.modelName, instructions: input.instructions, input: input.input, reasoning: { effort: ideonConfig.reasoningEffort }, max_output_tokens: ideonConfig.maxOutputTokens, store: false });
    const text = extractOutputText(payload);
    if (!text) throw new LLMGenerationError("OpenAI returned an empty response.");
    return text;
  }

  async classifyState(input: StateAnalysisInput): Promise<StateAnalysisResult> {
    const context = input.recentMessages.map((message) => `${message.role}: ${message.content}`).join("\n");
    const classifierInput = `Current strategy: ${input.currentStrategy ?? "none"}\nCurrent direction: ${input.currentIdea ?? "none"}\nRecent conversation:\n${context || "none"}\nLatest user message: ${input.latestUserMessage}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const payload = await this.request({
          model: this.modelName,
          instructions: STATE_CLASSIFIER_INSTRUCTIONS,
          input: classifierInput,
          max_output_tokens: 250,
          reasoning: { effort: ideonConfig.reasoningEffort },
          store: false,
          text: { format: { type: "json_schema", name: "ideon_state_analysis", strict: true, schema: { type: "object", additionalProperties: false, properties: { state: { type: "string", enum: ["uncertain", "exploring", "interested", "committed", "rejecting", "stuck", "neutral"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, preferredStrategy: { type: "string", enum: ["explore", "deepen", "keep_current"] }, evidence: { type: "array", items: { type: "string" }, maxItems: 3 }, shortReason: { type: "string", maxLength: 180 } }, required: ["state", "confidence", "preferredStrategy", "evidence", "shortReason"] } } },
        });
        const parsed = JSON.parse(extractOutputText(payload)) as Partial<StateAnalysisResult>;
        if (!isState(parsed.state) || !isPreference(parsed.preferredStrategy) || typeof parsed.confidence !== "number" || !Array.isArray(parsed.evidence) || typeof parsed.shortReason !== "string") throw new Error("Malformed classifier output.");
        return { state: parsed.state, confidence: parsed.confidence, preferredStrategy: parsed.preferredStrategy, evidence: parsed.evidence.filter((item): item is string => typeof item === "string"), shortReason: parsed.shortReason };
      } catch (error) { lastError = error; }
    }
    throw lastError instanceof Error ? lastError : new LLMGenerationError("State classification failed.");
  }
}

function extractGeminiText(payload: GeminiPayload): string {
  return payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text?.trim()).filter(Boolean).join("\n") ?? "";
}

const stateResponseSchema = {
  type: "object",
  properties: {
    state: { type: "string", enum: ["uncertain", "exploring", "interested", "committed", "rejecting", "stuck", "neutral"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    preferredStrategy: { type: "string", enum: ["explore", "deepen", "keep_current"] },
    evidence: { type: "array", items: { type: "string" }, maxItems: 3 },
    shortReason: { type: "string", maxLength: 180 },
  },
  required: ["state", "confidence", "preferredStrategy", "evidence", "shortReason"],
} as const;

export class GeminiGenerateContentClient implements LLMClient {
  readonly providerName = "google";
  readonly modelName: string;
  readonly modelSettings = Object.freeze({ maxOutputTokens: ideonConfig.maxOutputTokens, thinkingBudget: 0 });
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.GEMINI_API_KEY, modelName = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash") { this.apiKey = apiKey; this.modelName = modelName; }

  private async request(instructions: string, input: string | LLMGenerationInput["input"], structured = false): Promise<GeminiPayload> {
    if (!this.apiKey) throw new LLMConfigurationError();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const requestBody = JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: typeof input === "string"
          ? [{ role: "user", parts: [{ text: input }] }]
          : input.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
        generationConfig: {
          maxOutputTokens: structured ? 300 : ideonConfig.maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
          ...(structured ? { temperature: 0, responseMimeType: "application/json", responseSchema: stateResponseSchema } : {}),
        },
      });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body: requestBody,
          signal: controller.signal,
        });
        const body = await response.text();
        if (response.ok) return JSON.parse(body) as GeminiPayload;
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (retryable && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt))); continue; }
        throw new LLMGenerationError(`Gemini request failed with status ${response.status}${body ? `: ${body.slice(0, 240)}` : "."}`);
      }
      throw new LLMGenerationError("Gemini did not return a response.");
    } catch (error) {
      if (error instanceof LLMConfigurationError || error instanceof LLMGenerationError) throw error;
      throw new LLMGenerationError(error instanceof Error ? error.message : undefined);
    } finally { clearTimeout(timeout); }
  }

  async generateResponse(input: LLMGenerationInput): Promise<string> {
    const payload = await this.request(input.instructions, input.input);
    const text = extractGeminiText(payload);
    if (!text) throw new LLMGenerationError(`Gemini returned no text${payload.promptFeedback?.blockReason ? ` (${payload.promptFeedback.blockReason})` : ""}.`);
    return text;
  }

  async classifyState(input: StateAnalysisInput): Promise<StateAnalysisResult> {
    const context = input.recentMessages.map((message) => `${message.role}: ${message.content}`).join("\n");
    const classifierInput = `Current strategy: ${input.currentStrategy ?? "none"}\nCurrent direction: ${input.currentIdea ?? "none"}\nRecent conversation:\n${context || "none"}\nLatest user message: ${input.latestUserMessage}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const payload = await this.request(STATE_CLASSIFIER_INSTRUCTIONS, classifierInput, true);
        const parsed = JSON.parse(extractGeminiText(payload)) as Partial<StateAnalysisResult>;
        if (!isState(parsed.state) || !isPreference(parsed.preferredStrategy) || typeof parsed.confidence !== "number" || !Array.isArray(parsed.evidence) || typeof parsed.shortReason !== "string") throw new Error("Malformed classifier output.");
        return { state: parsed.state, confidence: parsed.confidence, preferredStrategy: parsed.preferredStrategy, evidence: parsed.evidence.filter((item): item is string => typeof item === "string"), shortReason: parsed.shortReason };
      } catch (error) { lastError = error; }
    }
    throw lastError instanceof Error ? lastError : new LLMGenerationError("State classification failed.");
  }
}

export function createLLMClient(preferredProvider?: string): LLMClient {
  const preferred = preferredProvider?.toLowerCase() ?? "";
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;
  if ((preferred.includes("gemini") || preferred.includes("google")) && geminiKey) return new GeminiGenerateContentClient(geminiKey);
  if (preferred.includes("openai") && openAIKey) return new OpenAIResponsesClient(openAIKey);
  if (geminiKey) return new GeminiGenerateContentClient(geminiKey);
  if (openAIKey) return new OpenAIResponsesClient(openAIKey);
  throw new LLMConfigurationError();
}
