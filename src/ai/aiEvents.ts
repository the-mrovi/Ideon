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

// Safe default for isolated unit tests; production routes inject the Supabase sink.
export const researchEventSink = new InMemoryResearchEventSink();
