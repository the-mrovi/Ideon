import { NextResponse } from "next/server";
import { signOutAdmin } from "@/src/db/auth";
export async function POST(request: Request) { await signOutAdmin(); return NextResponse.redirect(new URL("/admin", request.url), 303); }
