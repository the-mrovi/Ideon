import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { rpc, supabaseRequest } from "./supabase.ts";
import type { ChatMessage, ExperimentCondition, FinalIdea } from "../../types/study.ts";
import type { IdeonSessionState } from "../ai/sessionStore.ts";

export interface StudyCredentials { sessionId: string; sessionToken: string }
export interface NewStudySession extends StudyCredentials { participantCode: string; sessionCode: string; status: string }

interface SessionRow {
  id: string; session_code: string; session_token_hash: string; experiment_condition: ExperimentCondition;
  experiment_config_version: string; consent_given: boolean; status: string; turn_count: number;
  current_strategy: "explore" | "deepen" | null; current_direction: string | null;
  selected_ideas: string[]; rejected_ideas: string[]; original_topic: string | null;
  state_prompt_version: string; explore_prompt_version: string; deepen_prompt_version: string;
  model_provider: string; model_name: string; model_version: string; assigned_task: string;
}

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function sameHash(left: string, right: string) {
  const a = Buffer.from(left, "hex"); const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createStudySession(): Promise<NewStudySession> {
  const phase = process.env.IDEON_STUDY_PHASE ?? "development";
  return rpc<NewStudySession>("create_study_session", { p_study_phase: phase, p_manual_condition: null });
}

export async function requireStudySession(credentials: StudyCredentials): Promise<SessionRow> {
  const rows = await supabaseRequest<SessionRow[]>(`/rest/v1/study_sessions?id=eq.${encodeURIComponent(credentials.sessionId)}&select=*`, { serviceRole: true });
  const session = rows[0];
  if (!session || !credentials.sessionToken || !sameHash(session.session_token_hash, tokenHash(credentials.sessionToken))) throw new Error("invalid_session_token");
  return session;
}

export async function recordConsent(credentials: StudyCredentials) {
  await requireStudySession(credentials);
  const now = new Date().toISOString();
  await supabaseRequest(`/rest/v1/study_sessions?id=eq.${encodeURIComponent(credentials.sessionId)}`, {
    method: "PATCH", body: { consent_given: true, read_study_information: true, understands_recording: true, agrees_to_participate: true, consent_version: "ideon-consent-v1", consent_timestamp: now, status: "consented", last_activity_at: now }, serviceRole: true,
  });
}

export async function beginStudy(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  if (!session.consent_given) throw new Error("consent_required");
  const now = new Date().toISOString();
  await supabaseRequest(`/rest/v1/study_sessions?id=eq.${encodeURIComponent(credentials.sessionId)}`, { method: "PATCH", body: { status: "in_progress", started_at: now, last_activity_at: now }, serviceRole: true, prefer: "return=minimal" });
}

export async function loadStudy(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  const messages = await supabaseRequest<Array<{ id: string; role: "user" | "assistant"; content: string; created_at: string; message_status: string }>>(`/rest/v1/messages?session_id=eq.${session.id}&message_status=eq.completed&select=id,role,content,created_at,message_status&order=created_at.asc`, { serviceRole: true });
  return {
    session: { id: session.id, code: session.session_code, condition: session.experiment_condition, status: session.status, assignedTask: session.assigned_task, turnCount: session.turn_count },
    messages: messages.map((m): ChatMessage => ({ id: m.id, role: m.role, content: m.content, createdAt: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })),
  };
}

export async function loadTurnContext(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  if (!session.consent_given || !["consented", "in_progress"].includes(session.status)) throw new Error("session_not_active");
  const messages = await supabaseRequest<Array<{ id: string; role: "user" | "assistant"; content: string; created_at: string }>>(`/rest/v1/messages?session_id=eq.${session.id}&message_status=eq.completed&select=id,role,content,created_at&order=created_at.asc&limit=24`, { serviceRole: true });
  const state: IdeonSessionState = {
    condition: session.experiment_condition,
    context: { originalTopic: session.original_topic ?? undefined, currentDirection: session.current_direction ?? undefined, selectedIdeas: session.selected_ideas ?? [], rejectedIdeas: session.rejected_ideas ?? [], currentStrategy: session.current_strategy ?? undefined },
    currentStrategy: session.current_strategy,
    turnNumber: session.turn_count,
    lastStrategyChangeTurn: 0,
    pendingPreference: null,
    pendingPreferenceCount: 0,
  };
  return { session, state, recentMessages: messages.map((m): ChatMessage => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })) };
}

export async function saveFinalIdea(credentials: StudyCredentials, idea: FinalIdea, submit: boolean) {
  const session = await requireStudySession(credentials);
  await rpc("save_final_idea", { p_session_id: session.id, p_idea: { topic: idea.topic, problem: idea.problem, question: idea.question, explanation: idea.explanation }, p_submit: submit });
}

export async function loadFinalIdea(credentials: StudyCredentials): Promise<FinalIdea | null> {
  const session = await requireStudySession(credentials);
  const rows = await supabaseRequest<Array<{ research_topic: string; research_problem: string; research_question: string; short_explanation: string }>>(`/rest/v1/final_ideas?session_id=eq.${session.id}&select=research_topic,research_problem,research_question,short_explanation`, { serviceRole: true });
  const idea = rows[0];
  return idea ? { topic: idea.research_topic, problem: idea.research_problem, question: idea.research_question, explanation: idea.short_explanation } : null;
}

export async function submitQuestionnaire(credentials: StudyCredentials, answers: Array<{ questionKey: string; construct: string; numericValue?: number; textValue?: string }>) {
  const session = await requireStudySession(credentials);
  await rpc("submit_questionnaire", { p_session_id: session.id, p_questionnaire_version: "ideon-questionnaire-v1", p_answers: answers });
  return session.session_code;
}

export async function recordFailedTurn(credentials: StudyCredentials, turnEventId: string, turnNumber: number, message: string, category: string, latency: number) {
  const session = await requireStudySession(credentials);
  return rpc<boolean>("record_failed_ideon_turn", { p_session_id: session.id, p_turn_event_id: turnEventId, p_turn_number: turnNumber, p_user_message: message, p_error_category: category, p_total_latency_ms: latency });
}
