import { NextResponse } from "next/server";
import { z } from "zod";
import { submitQuestionnaire } from "@/src/db/study";

const schema = z.object({
  sessionId: z.string().uuid(), sessionToken: z.string().min(32).max(256),
  answers: z.array(z.object({ questionKey: z.string().min(1).max(100), construct: z.string().min(1).max(100), numericValue: z.number().int().min(1).max(5).optional(), textValue: z.string().max(4000).optional() })).min(1).max(30),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const sessionCode = await submitQuestionnaire({ sessionId: parsed.data.sessionId, sessionToken: parsed.data.sessionToken }, parsed.data.answers);
    return NextResponse.json({ ok: true, sessionCode });
  } catch (error) {
    console.error("Questionnaire request failed", error);
    return NextResponse.json({ error: "questionnaire_failed" }, { status: 503 });
  }
}
