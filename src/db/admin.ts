import "server-only";
import { supabaseRequest } from "./supabase.ts";
import type { AdminSession, ChatMessage, ExperimentCondition, FinalIdea } from "../../types/study.ts";

interface RawSession { id: string; session_code: string; experiment_condition: ExperimentCondition; started_at: string | null; created_at: string; ended_at: string | null; duration_seconds: number | null; status: string; final_submission_completed: boolean; turn_count: number; participant_id: string; study_phase: "development" | "pilot" | "main" }
interface Participant { id: string; participant_code: string }

function duration(seconds: number | null, start: string | null, end: string | null) {
  const value = seconds ?? (start ? Math.max(0, Math.round((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 1000)) : 0);
  return value ? `${Math.floor(value / 60)}m ${value % 60}s` : "—";
}
function status(value: string): AdminSession["status"] { return value === "completed" ? "completed" : value === "in_progress" ? "active" : "not_started"; }

export async function getAdminSessions(token: string): Promise<AdminSession[]> {
  const [sessions, participants] = await Promise.all([
    supabaseRequest<RawSession[]>("/rest/v1/study_sessions?select=id,session_code,experiment_condition,started_at,created_at,ended_at,duration_seconds,status,final_submission_completed,turn_count,participant_id&order=created_at.desc", { serviceRole: false, accessToken: token }),
    supabaseRequest<Participant[]>("/rest/v1/participants?select=id,participant_code", { serviceRole: false, accessToken: token }),
  ]);
  const codes = new Map(participants.map((p) => [p.id, p.participant_code]));
  return sessions.map((s) => ({ id: s.id, sessionCode: s.session_code, participantCode: codes.get(s.participant_id) ?? "Anonymous", condition: s.experiment_condition, startedAt: new Date(s.started_at ?? s.created_at).toLocaleString(), duration: duration(s.duration_seconds, s.started_at, s.ended_at), status: status(s.status), hasFinalIdea: s.final_submission_completed, turns: s.turn_count, studyPhase: s.study_phase }));
}

export async function getDashboard(token: string) {
  const sessions = await getAdminSessions(token);
  const completed = sessions.filter((s) => s.status === "completed");
  const totalSeconds = completed.reduce((sum, s) => { const match = /(?:(\d+)m)?\s*(?:(\d+)s)?/.exec(s.duration); return sum + Number(match?.[1] ?? 0) * 60 + Number(match?.[2] ?? 0); }, 0);
  const distributions = { adaptive: 0, random: 0, fixed: 0 };
  sessions.forEach((s) => { distributions[s.condition] += 1; });
  return { sessions, total: sessions.length, completed: completed.length, averageDuration: completed.length ? duration(Math.round(totalSeconds / completed.length), null, null) : "—", averageTurns: sessions.length ? (sessions.reduce((sum, s) => sum + (s.turns ?? 0), 0) / sessions.length).toFixed(1) : "0", distributions };
}

export async function getSessionDetail(token: string, id: string) {
  const [sessions, participants, messages, strategies, ideas, finals, responses] = await Promise.all([
    supabaseRequest<RawSession[]>(`/rest/v1/study_sessions?id=eq.${encodeURIComponent(id)}&select=*`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Participant[]>("/rest/v1/participants?select=id,participant_code", { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ id: string; role: "user" | "assistant"; content: string; created_at: string }>>(`/rest/v1/messages?session_id=eq.${encodeURIComponent(id)}&select=id,role,content,created_at&order=created_at.asc`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ id: string; created_at: string; detected_state: string | null; selected_strategy: string; state_confidence: number | null; decision_reason: string | null }>>(`/rest/v1/strategy_events?session_id=eq.${encodeURIComponent(id)}&select=id,created_at,detected_state,selected_strategy,state_confidence,decision_reason&order=turn_number.asc`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ event_type: string; idea_text: string; turn_number: number }>>(`/rest/v1/idea_events?session_id=eq.${encodeURIComponent(id)}&select=event_type,idea_text,turn_number&order=created_at.asc`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ research_topic: string; research_problem: string; research_question: string; short_explanation: string }>>(`/rest/v1/final_ideas?session_id=eq.${encodeURIComponent(id)}&select=*`, { serviceRole: false, accessToken: token }),
    supabaseRequest<Array<{ id: string }>>(`/rest/v1/questionnaire_responses?session_id=eq.${encodeURIComponent(id)}&select=id`, { serviceRole: false, accessToken: token }),
  ]);
  const raw = sessions[0]; if (!raw) return null;
  const code = participants.find((p) => p.id === raw.participant_id)?.participant_code ?? "Anonymous";
  const session: AdminSession = { id: raw.id, sessionCode: raw.session_code, participantCode: code, condition: raw.experiment_condition, startedAt: new Date(raw.started_at ?? raw.created_at).toLocaleString(), duration: duration(raw.duration_seconds, raw.started_at, raw.ended_at), status: status(raw.status), hasFinalIdea: raw.final_submission_completed, turns: raw.turn_count, studyPhase: raw.study_phase };
  const questionnaire = responses[0] ? await supabaseRequest<Array<{ question_key: string; numeric_value: number | null; text_value: string | null }>>(`/rest/v1/questionnaire_answers?questionnaire_response_id=eq.${responses[0].id}&select=question_key,numeric_value,text_value&order=question_key.asc`, { serviceRole: false, accessToken: token }) : [];
  const transcript: ChatMessage[] = messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
  const final: FinalIdea | null = finals[0] ? { topic: finals[0].research_topic, problem: finals[0].research_problem, question: finals[0].research_question, explanation: finals[0].short_explanation } : null;
  return { session, transcript, strategies, ideas, final, questionnaire };
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
  transcripts: "/rest/v1/messages?select=id,session_id,turn_event_id,turn_number,role,content,message_status,error_category,latency_ms,token_input,token_output,created_at&order=created_at.asc",
  strategies: "/rest/v1/strategy_events?select=*&order=created_at.asc",
  ideas: "/rest/v1/idea_events?select=*&order=created_at.asc",
  final_ideas: "/rest/v1/final_ideas?select=*&order=created_at.asc",
  questionnaire_responses: "/rest/v1/questionnaire_responses?select=*&order=created_at.asc",
  questionnaire_answers: "/rest/v1/questionnaire_answers?select=*&order=created_at.asc",
} as const;
export type ExportDataset = keyof typeof exportQueries;
export function getExportRows(token: string, dataset: ExportDataset) { return supabaseRequest<Array<Record<string, unknown>>>(exportQueries[dataset], { serviceRole: false, accessToken: token }); }

export interface ExperimentConfigSummary { id: string; config_version: string; study_phase: string; assignment_method: string; model_name: string; model_version: string; frozen_at: string | null; is_active: boolean; created_at: string }
export function getExperimentConfigs(token: string) { return supabaseRequest<ExperimentConfigSummary[]>("/rest/v1/experiment_configs?select=id,config_version,study_phase,assignment_method,model_name,model_version,frozen_at,is_active,created_at&order=created_at.desc", { serviceRole: false, accessToken: token }); }
