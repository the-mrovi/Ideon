import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i><Icon /></i></div><strong>{value}</strong><p>{detail}</p></article>;
}
