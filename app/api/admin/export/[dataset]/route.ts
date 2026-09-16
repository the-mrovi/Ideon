import { requireAdmin } from "@/src/db/auth";
import { getExportRows, recordsCsv, type ExportDataset } from "@/src/db/admin";

const allowed = new Set<ExportDataset>(["transcripts", "strategies", "ideas", "final_ideas", "questionnaire_responses", "questionnaire_answers"]);
export async function GET(_: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!allowed.has(dataset as ExportDataset)) return new Response("Unknown export", { status: 404 });
  const { token } = await requireAdmin();
  const csv = recordsCsv(await getExportRows(token, dataset as ExportDataset));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=ideon-${dataset}.csv`, "Cache-Control": "no-store" } });
}
