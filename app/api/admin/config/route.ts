import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/db/auth";
import { rpc } from "@/src/db/supabase";

const schema = z.object({ action: z.enum(["freeze", "activate"]), configId: z.string().uuid() }).strict();
export async function POST(request: Request) {
  try {
    const { token } = await requireAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await rpc(parsed.data.action === "freeze" ? "admin_freeze_experiment_config" : "admin_activate_experiment_config", { p_config_id: parsed.data.configId }, { serviceRole: false, accessToken: token });
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Admin config action failed", error); return NextResponse.json({ error: "action_failed" }, { status: 403 }); }
}
