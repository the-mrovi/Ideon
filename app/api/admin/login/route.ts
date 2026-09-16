import { NextResponse } from "next/server";
import { z } from "zod";
import { signInAdmin } from "@/src/db/auth";

const schema = z.object({ email: z.string().email().max(320), password: z.string().min(8).max(200) }).strict();
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await signInAdmin(parsed.data.email, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "invalid_credentials" }, { status: 401 }); }
}
