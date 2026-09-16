import { NextResponse } from "next/server";
import { z } from "zod";
import { beginStudy, createStudySession, loadStudy, recordConsent } from "@/src/db/study";
import { SupabaseConfigurationError } from "@/src/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const credentials = z.object({ sessionId: z.string().uuid(), sessionToken: z.string().min(32).max(256) });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("consent"), ...credentials.shape }),
  z.object({ action: z.literal("begin"), ...credentials.shape }),
  z.object({ action: z.literal("resume"), ...credentials.shape }),
]);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    if (parsed.data.action === "start") return NextResponse.json(await createStudySession(), { status: 201 });
    const auth = { sessionId: parsed.data.sessionId, sessionToken: parsed.data.sessionToken };
    if (parsed.data.action === "consent") { await recordConsent(auth); return NextResponse.json({ ok: true }); }
    if (parsed.data.action === "begin") { await beginStudy(auth); return NextResponse.json({ ok: true }); }
    return NextResponse.json(await loadStudy(auth));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = error instanceof SupabaseConfigurationError
      ? "supabase_not_configured"
      : message.includes("invalid_session_token")
        ? "invalid_session"
        : /Supabase request failed \((401|403)\)/.test(message)
          ? "supabase_credentials_rejected"
          : /Supabase request failed \(404\)|PGRST202|Could not find the function|relation .* does not exist/i.test(message)
            ? "database_schema_missing"
            : "database_unavailable";
    console.error("Study session request failed", error);
    return NextResponse.json({ error: code }, { status: code === "invalid_session" ? 401 : 503 });
  }
}
