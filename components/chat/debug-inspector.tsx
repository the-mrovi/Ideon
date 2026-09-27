"use client";

export interface DebugTurn {
  mode: string;
  state: string | null;
  confidence: number | null;
  strategy: string;
  previous: string | null;
  switched: boolean;
  source: string;
  reason: string;
  randomValue?: number | null;
  randomExploreProbability?: number | null;
  turn: number;
}

export function DebugInspector({ value }: { value: DebugTurn }) {
  return <aside className="debug-inspector" aria-label="Development strategy inspector"><div><strong>Development inspector</strong><span>Turn {value.turn}</span></div><dl><div><dt>Mode</dt><dd>{value.mode}</dd></div><div><dt>State</dt><dd>{value.state ?? "not analysed"}</dd></div><div><dt>Confidence</dt><dd>{value.confidence === null ? "—" : value.confidence.toFixed(2)}</dd></div><div><dt>Strategy</dt><dd>{value.strategy}</dd></div><div><dt>Previous</dt><dd>{value.previous ?? "none"}</dd></div><div><dt>Switched</dt><dd>{value.switched ? "yes" : "no"}</dd></div><div><dt>Source</dt><dd>{value.source}</dd></div>{value.randomValue === null || value.randomValue === undefined ? null : <div><dt>Random draw</dt><dd>{value.randomValue.toFixed(3)} / {value.randomExploreProbability?.toFixed(2)}</dd></div>}</dl><p>{value.reason}</p></aside>;
}
