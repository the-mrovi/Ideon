import { requireAdmin } from "@/src/db/auth";
import { getAdminSessions, sessionsCsv } from "@/src/db/admin";
export async function GET() { const { token } = await requireAdmin(); const csv = sessionsCsv(await getAdminSessions(token)); return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=ideon-sessions.csv", "Cache-Control": "no-store" } }); }
