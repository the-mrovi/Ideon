const events = [
  { time: "10:25", state: "Initial", strategy: "Prompted for broad interest", confidence: "—" },
  { time: "10:27", state: "Exploring", strategy: "Clarifying focus", confidence: "0.76" },
  { time: "10:29", state: "Developing", strategy: "Specificity prompt", confidence: "0.84" },
  { time: "10:33", state: "Refining", strategy: "Research question framing", confidence: "0.81" },
];

export function StrategyTimeline() {
  return <section className="detail-card strategy-card"><div className="detail-card-heading"><span>Internal study data</span><h2>Strategy timeline</h2></div><div className="strategy-timeline">{events.map((event, index) => <article key={event.time}><i className={index === events.length - 1 ? "last" : ""} /><time>{event.time}</time><div><strong>{event.state}</strong><p>{event.strategy}</p></div><span>{event.confidence}</span></article>)}</div><p className="admin-only-note">Visible to researchers only. Mock values for Part 1.</p></section>;
}
