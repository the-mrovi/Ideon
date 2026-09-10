import type { Metadata } from "next";
import { Clock3, MessagesSquare, UserCheck, UsersRound } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { MetricCard } from "@/components/admin/metric-card";
import { SessionsTable } from "@/components/admin/sessions-table";
import { mockSessions } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Research Dashboard" };
export default function DashboardPage() {
  return <AdminShell><div className="admin-page"><header className="admin-page-heading"><div><span>Study overview</span><h1>Research dashboard</h1><p>Participant activity and study progress at a glance.</p></div><span className="study-live"><i /> Study active</span></header><section className="metrics-grid"><MetricCard label="Total participants" value="48" detail="+7 this week" icon={UsersRound} /><MetricCard label="Completed sessions" value="42" detail="87.5% completion" icon={UserCheck} /><MetricCard label="Average duration" value="19m 36s" detail="Across completed sessions" icon={Clock3} /><MetricCard label="Conversation turns" value="11.8" detail="Average per session" icon={MessagesSquare} /></section><section className="distribution-panel"><div><span>Condition distribution</span><h2>Balanced across study groups</h2></div><div className="distribution-bars"><div><span>Adaptive <b>17</b></span><i><em style={{ width: "35%" }} /></i></div><div><span>Random <b>16</b></span><i><em style={{ width: "33%" }} /></i></div><div><span>Fixed <b>15</b></span><i><em style={{ width: "31%" }} /></i></div></div></section><SessionsTable sessions={mockSessions} /></div></AdminShell>;
}
