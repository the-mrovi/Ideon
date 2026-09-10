import { NextResponse } from "next/server";
import { z } from "zod";
import { processIdeationTurn } from "@/src/ai/ideonPipeline";
import { LLMConfigurationError, LLMGenerationError } from "@/src/ai/llmClient";

const messageSchema = z.object({ id: z.string().min(1).max(100), role: z.enum(["user", "assistant"]), content: z.string().max(12_000), createdAt: z.string().max(100), status: z.enum(["normal", "sending", "thinking", "streaming", "failed"]).optional() });
const chatRequestSchema = z.object({ sessionId: z.string().min(3).max(100), condition: z.enum(["fixed", "random", "adaptive"]), message: z.string().trim().min(1).max(4_000), recentMessages: z.array(messageSchema).max(24) }).strict();

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "invalid_json", message: "The request body must be valid JSON.", retryable: false } }, { status: 400 }); }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "The chat request is incomplete or invalid.", retryable: false } }, { status: 400 });
  try {
    const result = await processIdeationTurn(parsed.data);
    const debugEnabled = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_IDEON_DEBUG_INSPECTOR === "true";
    return NextResponse.json({ response: result.response, ...(debugEnabled ? { debug: { state: result.event.detectedState, confidence: result.event.stateConfidence, strategy: result.event.selectedStrategy, previous: result.event.previousStrategy, switched: result.event.strategyChanged, source: result.event.decisionSource, reason: result.event.decisionReason, turn: result.event.turnNumber } } : {}) });
  } catch (error) {
    if (error instanceof LLMConfigurationError) {
      console.error("Ideon provider is not configured: OPENAI_API_KEY is missing.");
      return NextResponse.json({ error: { code: "provider_not_configured", message: "Ideon is temporarily unavailable. Please contact the study coordinator.", retryable: false } }, { status: 503 });
    }
    if (error instanceof LLMGenerationError) return NextResponse.json({ error: { code: "generation_failed", message: "Ideon could not complete that response. Please try again.", retryable: true } }, { status: 502 });
    console.error("Ideon chat pipeline failed", error);
    return NextResponse.json({ error: { code: "internal_error", message: "Ideon encountered an unexpected problem. Please try again.", retryable: true } }, { status: 500 });
  }
}
