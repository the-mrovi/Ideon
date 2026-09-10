import type { IdeonTurnEvent } from "./decisionTypes.ts";

export interface ResearchEventSink {
  recordTurn(event: IdeonTurnEvent): Promise<void>;
}

export class InMemoryResearchEventSink implements ResearchEventSink {
  private readonly events: IdeonTurnEvent[] = [];
  async recordTurn(event: IdeonTurnEvent) {
    this.events.push(structuredClone(event));
    if (process.env.NODE_ENV === "development") console.info("[Ideon research event]", event);
  }
  getAll() { return structuredClone(this.events); }
  getForSession(sessionId: string) { return this.getAll().filter((event) => event.sessionId === sessionId); }
  clear() { this.events.length = 0; }
}

// Part 3 integration point: replace this instance with a SupabaseResearchEventSink.
export const researchEventSink = new InMemoryResearchEventSink();
