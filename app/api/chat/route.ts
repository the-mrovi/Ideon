import { NextResponse } from "next/server";
import { z } from "zod";
import { processIdeationTurn } from "@/src/ai/ideonPipeline";
import { LLMConfigurationError, LLMGenerationError } from "@/src/ai/llmClient";
import { hydrateSessionState } from "@/src/ai/sessionStore";
import { loadTurnContext, recordFailedTurn } from "@/src/db/study";
import { SupabaseResearchEventSink } from "@/src/db/researchEventSink";
import { SupabaseConfigurationError } from "@/src/db/supabase";

const chatRequestSchema = z.object({ sessionId: z.string().uuid(), sessionToken: z.string().min(32).max(256), turnEventId: z.string().uuid(), message: z.string().trim().min(1).max(4_000) }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "invalid_json", message: "The request body must be valid JSON.", retryable: false } }, { status: 400 }); }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "The chat request is incomplete or invalid.", retryable: false } }, { status: 400 });
  try {
    const startedAt = performance.now();
    const credentials = { sessionId: parsed.data.sessionId, sessionToken: parsed.data.sessionToken };
    const context = await loadTurnContext(credentials);
    hydrateSessionState(context.session.id, context.state);
    try {
      const result = await processIdeationTurn({
        sessionId: context.session.id, condition: context.session.experiment_condition, message: parsed.data.message,
        recentMessages: context.recentMessages, turnEventId: parsed.data.turnEventId,
        configVersion: context.session.experiment_config_version, modelProvider: context.session.model_provider,
        modelVersion: context.session.model_version, statePromptVersion: context.session.state_prompt_version,
        explorePromptVersion: context.session.explore_prompt_version, deepenPromptVersion: context.session.deepen_prompt_version,
      }, { eventSink: new SupabaseResearchEventSink() });
      const debugEnabled = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_IDEON_DEBUG_INSPECTOR === "true";
      return NextResponse.json({ response: result.response, ...(debugEnabled ? { debug: { state: result.event.detectedState, confidence: result.event.stateConfidence, strategy: result.event.selectedStrategy, previous: result.event.previousStrategy, switched: result.event.strategyChanged, source: result.event.decisionSource, reason: result.event.decisionReason, turn: result.event.turnNumber } } : {}) });
    } catch (error) {
      const category = error instanceof LLMConfigurationError ? "provider_not_configured" : error instanceof LLMGenerationError ? "generation_failed" : "pipeline_failed";
      await recordFailedTurn(credentials, parsed.data.turnEventId, context.state.turnNumber + 1, parsed.data.message, category, Math.round(performance.now() - startedAt)).catch((recordError) => console.error("Failed to persist turn failure", recordError));
      throw error;
    }
  } catch (error) {
    if (error instanceof LLMConfigurationError) {
      console.error("Ideon provider is not configured: set GEMINI_API_KEY or OPENAI_API_KEY.");
      return NextResponse.json({ error: { code: "provider_not_configured", message: "Ideon is temporarily unavailable. Please contact the study coordinator.", retryable: false } }, { status: 503 });
    }
    if (error instanceof LLMGenerationError) return NextResponse.json({ error: { code: "generation_failed", message: "Ideon could not complete that response. Please try again.", retryable: true } }, { status: 502 });
    if (error instanceof SupabaseConfigurationError) return NextResponse.json({ error: { code: "supabase_not_configured", message: "The research database is not configured on this server.", retryable: false } }, { status: 503 });
    if (error instanceof Error && error.message.includes("invalid_session_token")) return NextResponse.json({ error: { code: "invalid_session", message: "This study session could not be verified. Return to the consent page to begin again.", retryable: false } }, { status: 401 });
    console.error("Ideon chat pipeline failed", error);
    return NextResponse.json({ error: { code: "internal_error", message: "Ideon encountered an unexpected problem. Please try again.", retryable: true } }, { status: 500 });
  }
}
