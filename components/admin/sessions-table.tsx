"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteSessionButton } from "@/components/admin/delete-session-button";
import type { AdminSession } from "@/types/study";

export function SessionsTable({ sessions }: { sessions: AdminSession[] }) {
  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState("all");
  const [descending, setDescending] = useState(true);
  const filtered = useMemo(() => sessions.filter((session) => (condition === "all" || session.condition === condition) && `${session.participantCode} ${session.sessionCode} ${session.id}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => descending ? b.startedAt.localeCompare(a.startedAt) : a.startedAt.localeCompare(b.startedAt)), [sessions, query, condition, descending]);

  return (
    <section className="sessions-section" id="sessions">
      <div className="section-heading"><div><span>Session records</span><h2>Participant sessions</h2></div><p>{sessions.length} total sessions</p></div>
      <div className="table-toolbar"><label className="table-search"><Search /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search participant or session" aria-label="Search sessions" /></label><Select value={condition} onValueChange={(value) => value && setCondition(value)}><SelectTrigger aria-label="Filter by condition"><SelectValue placeholder="All conditions" /></SelectTrigger><SelectContent><SelectItem value="all">All conditions</SelectItem><SelectItem value="adaptive">Adaptive</SelectItem><SelectItem value="random">Random</SelectItem><SelectItem value="fixed">Fixed</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => setDescending((value) => !value)}><ArrowUpDown /> Started</Button></div>
      <div className="sessions-table-wrap"><Table><TableHeader><TableRow><TableHead>Participant</TableHead><TableHead>Session</TableHead><TableHead>Condition</TableHead><TableHead>Started</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead><TableHead>Final idea</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map((session) => <TableRow key={session.id}><TableCell><Link href={`/admin/sessions/${session.id}`} className="participant-link">{session.participantCode}</Link></TableCell><TableCell>{session.sessionCode ?? session.id}</TableCell><TableCell><span className={`condition-tag ${session.condition}`}>{session.condition}</span></TableCell><TableCell>{session.startedAt}</TableCell><TableCell>{session.duration}</TableCell><TableCell><span className={`session-status ${session.status}`}><i />{session.status.replace("_", " ")}</span></TableCell><TableCell>{session.hasFinalIdea ? "Submitted" : "—"}</TableCell><TableCell>{session.studyPhase !== "main" ? <DeleteSessionButton id={session.id} /> : "Protected"}</TableCell></TableRow>)}</TableBody></Table>{filtered.length === 0 ? <div className="empty-table"><strong>No matching sessions</strong><p>Adjust the search or condition filter to see more records.</p></div> : null}</div>
      <div className="table-pagination"><span>Showing {filtered.length} of {sessions.length}</span></div>
    </section>
  );
}
