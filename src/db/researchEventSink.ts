import "server-only";
import type { ResearchEventSink } from "../ai/aiEvents.ts";
import type { IdeonTurnEvent } from "../ai/decisionTypes.ts";
import { rpc } from "./supabase.ts";

export class SupabaseResearchEventSink implements ResearchEventSink {
  async recordTurn(event: IdeonTurnEvent) {
    await rpc("record_ideon_turn", { p_event: event });
  }
}
