import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, FileText, UserRound } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { SessionTranscript } from "@/components/admin/session-transcript";
import { StrategyTimeline } from "@/components/admin/strategy-timeline";
import { requireAdmin } from "@/src/db/auth";
import { getSessionDetail } from "@/src/db/admin";

export const metadata: Metadata = { title: "Session Detail" };

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token } = await requireAdmin();
  const detail = await getSessionDetail(token, id);
  if (!detail) notFound();
  const { session, transcript, strategies, ideas, final, questionnaire } = detail;
  return <AdminShell active="sessions"><div className="admin-page detail-page"><Link href="/admin/dashboard#sessions" className="back-link"><ArrowLeft /> All sessions</Link><header className="detail-header"><div><span>Participant session</span><h1>{session.participantCode}</h1><p>{session.sessionCode}</p></div><span className={`session-status ${session.status}`}><i /> {session.status.replace("_", " ")}</span></header><section className="session-facts"><article><UserRound /><span>Condition<strong>{session.condition}</strong></span></article><article><CalendarDays /><span>Started<strong>{session.startedAt}</strong></span></article><article><Clock3 /><span>Duration<strong>{session.duration}</strong></span></article><article><FileText /><span>Final idea<strong>{session.hasFinalIdea ? "Submitted" : "Not submitted"}</strong></span></article></section><div className="detail-grid"><div><SessionTranscript messages={transcript} /><section className="detail-card final-idea-card"><div className="detail-card-heading"><span>Submitted outcome</span><h2>Final research idea</h2></div>{final ? <dl><div><dt>Research topic</dt><dd>{final.topic}</dd></div><div><dt>Research problem</dt><dd>{final.problem}</dd></div><div><dt>Final research question</dt><dd>{final.question}</dd></div><div><dt>Short explanation</dt><dd>{final.explanation}</dd></div></dl> : <p>No final idea has been submitted.</p>}</section>{ideas.length ? <section className="detail-card"><div className="detail-card-heading"><span>Idea history</span><h2>Selections and rejections</h2></div>{ideas.map((idea, index) => <p key={`${idea.turn_number}-${index}`}><strong>{idea.event_type}</strong> · turn {idea.turn_number}: {idea.idea_text}</p>)}</section> : null}</div><aside><StrategyTimeline events={strategies} /><section className="detail-card responses-card"><div className="detail-card-heading"><span>Post-task survey</span><h2>Questionnaire</h2></div>{questionnaire.map((answer) => <div className="response-row" key={answer.question_key}><p>{answer.question_key}</p><strong>{answer.numeric_value ?? answer.text_value ?? "—"}{answer.numeric_value ? <span>/5</span> : null}</strong></div>)}{questionnaire.length === 0 ? <p>No questionnaire submitted.</p> : null}</section></aside></div></div></AdminShell>;
}
