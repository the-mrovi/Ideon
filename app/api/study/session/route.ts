import { NextResponse } from "next/server";
import { z } from "zod";
import { beginStudy, createStudySession, loadStudy, recordConsent } from "@/src/db/study";
import { SupabaseConfigurationError } from "@/src/db/supabase";

const credentials = z.object({ sessionId: z.string().uuid(), sessionToken: z.string().min(32).max(256) });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("consent"), ...credentials.shape }),
  z.object({ action: z.literal("begin"), ...credentials.shape }),
  z.object({ action: z.literal("resume"), ...credentials.shape }),
]);

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    if (parsed.data.action === "start") return NextResponse.json(await createStudySession(), { status: 201 });
    const auth = { sessionId: parsed.data.sessionId, sessionToken: parsed.data.sessionToken };
    if (parsed.data.action === "consent") { await recordConsent(auth); return NextResponse.json({ ok: true }); }
    if (parsed.data.action === "begin") { await beginStudy(auth); return NextResponse.json({ ok: true }); }
    return NextResponse.json(await loadStudy(auth));
  } catch (error) {
    const code = error instanceof SupabaseConfigurationError ? "supabase_not_configured" : error instanceof Error && error.message.includes("invalid_session_token") ? "invalid_session" : "session_failed";
    console.error("Study session request failed", error);
    return NextResponse.json({ error: code }, { status: code === "invalid_session" ? 401 : 503 });
  }
}
