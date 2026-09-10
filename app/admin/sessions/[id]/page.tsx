import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, FileText, UserRound } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { SessionTranscript } from "@/components/admin/session-transcript";
import { StrategyTimeline } from "@/components/admin/strategy-timeline";
import { mockSessions, mockTranscript, questionnaireResponses } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Session Detail" };

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = mockSessions.find((item) => item.id === id) ?? mockSessions[0];
  return <AdminShell active="sessions"><div className="admin-page detail-page"><Link href="/admin/dashboard#sessions" className="back-link"><ArrowLeft /> All sessions</Link><header className="detail-header"><div><span>Participant session</span><h1>{session.participantCode}</h1><p>{session.id}</p></div><span className={`session-status ${session.status}`}><i /> {session.status.replace("_", " ")}</span></header><section className="session-facts"><article><UserRound /><span>Condition<strong>{session.condition}</strong></span></article><article><CalendarDays /><span>Started<strong>{session.startedAt}</strong></span></article><article><Clock3 /><span>Duration<strong>{session.duration}</strong></span></article><article><FileText /><span>Final idea<strong>{session.hasFinalIdea ? "Submitted" : "Not submitted"}</strong></span></article></section><div className="detail-grid"><div><SessionTranscript messages={mockTranscript} /><section className="detail-card final-idea-card"><div className="detail-card-heading"><span>Submitted outcome</span><h2>Final research idea</h2></div><dl><div><dt>Research problem</dt><dd>First-year computer science students may rely on generative AI before independently reasoning through programming errors, affecting the development of debugging skills.</dd></div><div><dt>Final research question</dt><dd>How does the timing of generative AI assistance affect debugging skill development among first-year computer science students?</dd></div><div><dt>Short explanation</dt><dd>The study could compare students who consult AI immediately with those who first attempt structured debugging on their own.</dd></div></dl></section></div><aside><StrategyTimeline /><section className="detail-card responses-card"><div className="detail-card-heading"><span>Post-task survey</span><h2>Questionnaire</h2></div>{questionnaireResponses.map(([question, value]) => <div className="response-row" key={question}><p>{question}</p><strong>{value}<span>/5</span></strong></div>)}</section></aside></div></div></AdminShell>;
}
