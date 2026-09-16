import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/db/auth";
import { rpc } from "@/src/db/supabase";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireAdmin(); const { id } = await params;
    await rpc("admin_delete_session", { p_session_id: id, p_delete_participant: true }, { serviceRole: false, accessToken: token });
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Admin session delete failed", error); return NextResponse.json({ error: "delete_failed" }, { status: 403 }); }
}
