import { ideonConfig } from "./experimentConfig.ts";
import { STATE_CLASSIFIER_INSTRUCTIONS } from "./prompts/state-classifier.ts";
import type { BuiltPrompt } from "./promptBuilder.ts";
import type { StateAnalysisInput, StateAnalysisResult, UserState, PreferredStrategy } from "./decisionTypes.ts";

export type LLMGenerationInput = BuiltPrompt;

export interface LLMClient {
  readonly modelName: string;
  readonly modelSettings: Record<string, unknown>;
  generateResponse(input: LLMGenerationInput): Promise<string>;
  classifyState(input: StateAnalysisInput): Promise<StateAnalysisResult>;
}

export class LLMConfigurationError extends Error {
  constructor() { super("OPENAI_API_KEY is not configured."); this.name = "LLMConfigurationError"; }
}

export class LLMGenerationError extends Error {
  constructor(message = "The language model could not complete the response.") { super(message); this.name = "LLMGenerationError"; }
}

interface ResponsesPayload {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
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
  readonly modelName = ideonConfig.model;
  readonly modelSettings = Object.freeze({ maxOutputTokens: ideonConfig.maxOutputTokens, reasoningEffort: ideonConfig.reasoningEffort, store: false });
  private readonly apiKey: string | undefined;

  constructor(apiKey = process.env.OPENAI_API_KEY) { this.apiKey = apiKey; }

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
