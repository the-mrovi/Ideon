"use client";

export interface DebugTurn {
  state: string | null;
  confidence: number | null;
  strategy: string;
  previous: string | null;
  switched: boolean;
  source: string;
  reason: string;
  turn: number;
}

export function DebugInspector({ value }: { value: DebugTurn }) {
  return <aside className="debug-inspector" aria-label="Development strategy inspector"><div><strong>Development inspector</strong><span>Turn {value.turn}</span></div><dl><div><dt>State</dt><dd>{value.state ?? "not analysed"}</dd></div><div><dt>Confidence</dt><dd>{value.confidence === null ? "—" : value.confidence.toFixed(2)}</dd></div><div><dt>Strategy</dt><dd>{value.strategy}</dd></div><div><dt>Previous</dt><dd>{value.previous ?? "none"}</dd></div><div><dt>Switched</dt><dd>{value.switched ? "yes" : "no"}</dd></div><div><dt>Source</dt><dd>{value.source}</dd></div></dl><p>{value.reason}</p></aside>;
}
