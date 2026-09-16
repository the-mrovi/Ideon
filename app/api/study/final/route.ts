import { NextResponse } from "next/server";
import { z } from "zod";
import { loadFinalIdea, saveFinalIdea } from "@/src/db/study";

const credentials = { sessionId: z.string().uuid(), sessionToken: z.string().min(32).max(256) };
const draftIdea = z.object({ topic: z.string().trim().max(500), problem: z.string().trim().max(4000), question: z.string().trim().max(2000), explanation: z.string().trim().max(4000) });
const completeIdea = draftIdea.refine((idea) => Object.values(idea).every(Boolean), "All final idea fields are required.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("load"), ...credentials }),
  z.object({ action: z.literal("save"), ...credentials, idea: draftIdea }),
  z.object({ action: z.literal("submit"), ...credentials, idea: completeIdea }),
]);

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const auth = { sessionId: parsed.data.sessionId, sessionToken: parsed.data.sessionToken };
    if (parsed.data.action === "load") return NextResponse.json({ idea: await loadFinalIdea(auth) });
    await saveFinalIdea(auth, parsed.data.idea, parsed.data.action === "submit");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Final idea request failed", error);
    return NextResponse.json({ error: "final_idea_failed" }, { status: 503 });
  }
}
