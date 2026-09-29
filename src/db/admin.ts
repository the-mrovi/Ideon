import "server-only";
import { supabaseRequest } from "./supabase.ts";
import type { AdminSession, ChatMessage, ExperimentCondition, FinalIdea } from "../../types/study.ts";

interface RawSession { id: string; participant_id: string; study_mode: ExperimentCondition | null; started_at: string | null; created_at: string; ended_at: string | null; duration_seconds: number | null; status: string }
interface RawRuntime { session_id: string; session_code: string; turn_count: number; study_phase: "development" | "pilot" | "main" }
interface Participant { id: string; participant_code: string }

function duration(seconds: number | null, start: string | null, end: string | null) {
  const value = seconds ?? (start ? Math.max(0, Math.round((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 1000)) : 0);
  return value ? `${Math.floor(value / 60)}m ${value % 60}s` : "—";
}
function status(value: string): AdminSession["status"] { return value === "completed" ? "completed" : value === "in_progress" ? "active" : "not_started"; }

export async function getAdminSessions(token: string): Promise<AdminSession[]> {
  const [sessions, participants, runtimes, finals] = await Promise.all([
    supabaseRequest<RawSession[]>("/rest/v1/sessions?select=id,participant_id,study_mode,started_at,created_at,ended_at,duration_seconds,status&order=created_at.desc", { serviceRole: false, accessToken: token }),
    supabaseRequest<Participant[]>("/rest/v1/participants?select=id,participant_code", { serviceRole: false, accessToken: token }),
    supabaseRequest<RawRuntime[]>("/rest/v1/session_runtime?select=session_id,session_code,turn_count,study_phase", { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ session_id: string }>>("/rest/v1/final_ideas?select=session_id", { serviceRole: false, accessToken: token }),
  ]);
  const codes = new Map(participants.map((p) => [p.id, p.participant_code]));
  const runtimeBySession = new Map(runtimes.map((runtime) => [runtime.session_id, runtime]));
  const finalSessions = new Set(finals.map((final) => final.session_id));
  return sessions.map((session) => {
    const runtime = runtimeBySession.get(session.id);
    return { id: session.id, sessionCode: runtime?.session_code, participantCode: codes.get(session.participant_id) ?? "Anonymous", condition: session.study_mode ?? "natural", startedAt: new Date(session.started_at ?? session.created_at).toLocaleString(), duration: duration(session.duration_seconds, session.started_at, session.ended_at), status: status(session.status), hasFinalIdea: finalSessions.has(session.id), turns: runtime?.turn_count ?? 0, studyPhase: runtime?.study_phase };
  });
}

export async function getDashboard(token: string) {
  const sessions = await getAdminSessions(token);
  const completed = sessions.filter((s) => s.status === "completed");
  const totalSeconds = completed.reduce((sum, s) => { const match = /(?:(\d+)m)?\s*(?:(\d+)s)?/.exec(s.duration); return sum + Number(match?.[1] ?? 0) * 60 + Number(match?.[2] ?? 0); }, 0);
  const distributions: Record<ExperimentCondition, number> = { adaptive: 0, random: 0, fixed: 0, natural: 0 };
  sessions.forEach((s) => { distributions[s.condition] += 1; });
  return { sessions, total: sessions.length, completed: completed.length, averageDuration: completed.length ? duration(Math.round(totalSeconds / completed.length), null, null) : "—", averageTurns: sessions.length ? (sessions.reduce((sum, s) => sum + (s.turns ?? 0), 0) / sessions.length).toFixed(1) : "0", distributions };
}

export async function getSessionDetail(token: string, id: string) {
  const encodedId = encodeURIComponent(id);
  const [sessions, participants, runtimes, messages, strategies, ideas, finals, drafts, questionnaire] = await Promise.all([
    supabaseRequest<RawSession[]>(`/rest/v1/sessions?id=eq.${encodedId}&select=id,participant_id,study_mode,started_at,created_at,ended_at,duration_seconds,status`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Participant[]>("/rest/v1/participants?select=id,participant_code", { serviceRole: false, accessToken: token }),
    supabaseRequest<RawRuntime[]>(`/rest/v1/session_runtime?session_id=eq.${encodedId}&select=session_id,session_code,turn_count,study_phase`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ id: string; sender: "user" | "ai"; message_text: string; created_at: string }>>(`/rest/v1/messages?session_id=eq.${encodedId}&select=id,sender,message_text,created_at&order=turn_number.asc,created_at.asc`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ id: string; created_at: string; detected_state: string | null; selected_strategy: string; state_confidence: number | null; decision_reason: string | null }>>(`/rest/v1/automatic_behavior_predictions?session_id=eq.${encodedId}&select=id,created_at,detected_state,selected_strategy,state_confidence,decision_reason&order=turn_number.asc`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ event_type: string; idea_text: string; turn_number: number }>>(`/rest/v1/legacy_idea_events?session_id=eq.${encodedId}&select=event_type,idea_text,turn_number&order=created_at.asc`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ research_topic: string | null; research_problem: string | null; research_question: string | null }>>(`/rest/v1/final_ideas?session_id=eq.${encodedId}&select=research_topic,research_problem,research_question`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ short_explanation: string }>>(`/rest/v1/final_idea_drafts?session_id=eq.${encodedId}&select=short_explanation`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ question_key: string; numeric_value: number | null; response_text: string | null }>>(`/rest/v1/post_session_responses?session_id=eq.${encodedId}&select=question_key,numeric_value,response_text&order=question_key.asc`, { serviceRole: false, accessToken: token }),
  ]);
  const raw = sessions[0]; if (!raw) return null;
  const runtime = runtimes[0];
  const code = participants.find((p) => p.id === raw.participant_id)?.participant_code ?? "Anonymous";
  const session: AdminSession = { id: raw.id, sessionCode: runtime?.session_code, participantCode: code, condition: raw.study_mode ?? "natural", startedAt: new Date(raw.started_at ?? raw.created_at).toLocaleString(), duration: duration(raw.duration_seconds, raw.started_at, raw.ended_at), status: status(raw.status), hasFinalIdea: Boolean(finals[0]), turns: runtime?.turn_count ?? 0, studyPhase: runtime?.study_phase };
  const transcript: ChatMessage[] = messages.map((message) => ({ id: message.id, role: message.sender === "ai" ? "assistant" : "user", content: message.message_text, createdAt: new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
  const final: FinalIdea | null = finals[0] ? { topic: finals[0].research_topic ?? "", problem: finals[0].research_problem ?? "", question: finals[0].research_question ?? "", explanation: drafts[0]?.short_explanation ?? "" } : null;
  return { session, transcript, strategies, ideas, final, questionnaire: questionnaire.map((answer) => ({ ...answer, text_value: answer.response_text })) };
}

export function sessionsCsv(sessions: AdminSession[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [["session_id", "session_code", "participant_code", "condition", "started_at", "duration", "status", "final_idea"], ...sessions.map((s) => [s.id, s.sessionCode ?? "", s.participantCode, s.condition, s.startedAt, s.duration, s.status, s.hasFinalIdea])].map((row) => row.map(escape).join(",")).join("\r\n");
}

export function recordsCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => `"${(typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "")).replaceAll('"', '""')}"`;
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((row) => row.map(escape).join(",")).join("\r\n");
}

const exportQueries = {
  transcripts: "/rest/v1/messages?select=id,session_id,turn_number,sender,message_text,created_at&order=created_at.asc",
  strategies: "/rest/v1/automatic_behavior_predictions?select=*&order=created_at.asc",
  annotations: "/rest/v1/behavior_annotations?select=*&order=created_at.asc",
  final_ideas: "/rest/v1/final_ideas?select=*&order=submitted_at.asc",
  post_session_responses: "/rest/v1/post_session_responses?select=*&order=created_at.asc",
} as const;
export type ExportDataset = keyof typeof exportQueries;
export function getExportRows(token: string, dataset: ExportDataset) { return supabaseRequest<Array<Record<string, unknown>>>(exportQueries[dataset], { serviceRole: false, accessToken: token }); }

export interface ExperimentConfigSummary { id: string; config_version: string; study_phase: string; assignment_method: string; model_name: string; model_version: string; frozen_at: string | null; is_active: boolean; created_at: string }
export function getExperimentConfigs(token: string) { return supabaseRequest<ExperimentConfigSummary[]>("/rest/v1/experiment_configs?select=id,config_version,study_phase,assignment_method,model_name,model_version,frozen_at,is_active,created_at&order=created_at.desc", { serviceRole: false, accessToken: token }); }
