import type { Metadata } from "next";
import { Clock3, MessagesSquare, UserCheck, UsersRound } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { MetricCard } from "@/components/admin/metric-card";
import { SessionsTable } from "@/components/admin/sessions-table";
import { requireAdmin } from "@/src/db/auth";
import { getDashboard } from "@/src/db/admin";

export const metadata: Metadata = { title: "Research Dashboard" };
export default async function DashboardPage() {
  const { token } = await requireAdmin();
  const data = await getDashboard(token);
  const percent = (value: number) => `${data.total ? Math.round(value / data.total * 100) : 0}%`;
  return <AdminShell><div className="admin-page"><header className="admin-page-heading"><div><span>Study overview</span><h1>Research dashboard</h1><p>Participant activity and study progress at a glance.</p></div><span className="study-live"><i /> Study active</span></header><section className="metrics-grid"><MetricCard label="Total participants" value={String(data.total)} detail="Anonymous records" icon={UsersRound} /><MetricCard label="Completed sessions" value={String(data.completed)} detail={`${data.total ? Math.round(data.completed / data.total * 100) : 0}% completion`} icon={UserCheck} /><MetricCard label="Average duration" value={data.averageDuration} detail="Across completed sessions" icon={Clock3} /><MetricCard label="Conversation turns" value={data.averageTurns} detail="Average per session" icon={MessagesSquare} /></section><section className="distribution-panel"><div><span>Condition distribution</span><h2>Live study groups</h2></div><div className="distribution-bars"><div><span>Adaptive <b>{data.distributions.adaptive}</b></span><i><em style={{ width: percent(data.distributions.adaptive) }} /></i></div><div><span>Random <b>{data.distributions.random}</b></span><i><em style={{ width: percent(data.distributions.random) }} /></i></div><div><span>Fixed <b>{data.distributions.fixed}</b></span><i><em style={{ width: percent(data.distributions.fixed) }} /></i></div></div></section><SessionsTable sessions={data.sessions} /></div></AdminShell>;
}
