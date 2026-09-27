import { NextResponse } from "next/server";
import { z } from "zod";
import { beginStudy, createStudySession, loadStudy, recordConsent } from "@/src/db/study";
import { SupabaseConfigurationError } from "@/src/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const credentials = z.object({ sessionId: z.string().uuid(), sessionToken: z.string().min(32).max(256) });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), mode: z.enum(["random", "adaptive"]).optional() }),
  z.object({ action: z.literal("consent"), ...credentials.shape }),
  z.object({ action: z.literal("begin"), mode: z.enum(["random", "adaptive"]), ...credentials.shape }),
  z.object({ action: z.literal("resume"), ...credentials.shape }),
]);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    if (parsed.data.action === "start") return NextResponse.json(await createStudySession(parsed.data.mode ?? "random"), { status: 201 });
    const auth = { sessionId: parsed.data.sessionId, sessionToken: parsed.data.sessionToken };
    if (parsed.data.action === "consent") { await recordConsent(auth); return NextResponse.json({ ok: true }); }
    if (parsed.data.action === "begin") return NextResponse.json({ ok: true, ...(await beginStudy(auth, parsed.data.mode)) });
    return NextResponse.json(await loadStudy(auth));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = error instanceof SupabaseConfigurationError
      ? "supabase_not_configured"
      : message.includes("invalid_session_token")
        ? "invalid_session"
        : message.includes("mode_locked")
          ? "mode_locked"
          : message.includes("session_not_ready")
            ? "session_not_ready"
            : /Supabase request failed \((401|403)\)/.test(message)
              ? "supabase_credentials_rejected"
              : /Supabase request failed \(404\)|PGRST202|Could not find the function|relation .* does not exist/i.test(message)
                ? "database_schema_missing"
                : "database_unavailable";
    console.error("Study session request failed", error);
    const status = code === "invalid_session" ? 401 : code === "mode_locked" || code === "session_not_ready" ? 409 : 503;
    return NextResponse.json({ error: code }, { status });
  }
}
