import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { rpc, supabaseRequest } from "./supabase.ts";
import type { ChatMessage, ExperimentCondition, FinalIdea, StudyMode } from "../../types/study.ts";
import type { IdeonSessionState } from "../ai/sessionStore.ts";
import type { ActiveStrategy, PreferredStrategy, UserState } from "../ai/decisionTypes.ts";
import { ideonConfig, stateToPreferredStrategy } from "../ai/experimentConfig.ts";

export interface StudyCredentials { sessionId: string; sessionToken: string }
export interface NewStudySession extends StudyCredentials { participantCode: string; sessionCode: string; status: string; mode?: StudyMode }

interface SessionRow {
  id: string; session_code: string; session_token_hash: string; experiment_condition: ExperimentCondition;
  experiment_config_version: string; consent_given: boolean; status: string; turn_count: number;
  started_at: string | null;
  current_strategy: "explore" | "deepen" | null; current_direction: string | null;
  selected_ideas: string[]; rejected_ideas: string[]; user_constraints: string[]; original_topic: string | null;
  state_prompt_version: string; explore_prompt_version: string; deepen_prompt_version: string;
  model_provider: string; model_name: string; model_version: string; assigned_task: string;
}

interface StrategyRow {
  turn_number: number;
  selected_strategy: ActiveStrategy;
  strategy_changed: boolean;
  detected_state: UserState | null;
  state_confidence: number | null;
  decision_source: string;
}

interface ExperimentConfigRow {
  id: string;
  config_version: string;
  study_phase: "development" | "pilot" | "main";
  model_provider: string;
  model_name: string;
  model_version: string;
  state_prompt_version: string;
  explore_prompt_version: string;
  deepen_prompt_version: string;
  task_version: string;
  assigned_task: string;
  frozen_at: string | null;
}

function restoredAdaptiveSignals(rows: StrategyRow[], currentStrategy: ActiveStrategy | null) {
  const chronological = [...rows].sort((left, right) => left.turn_number - right.turn_number);
  const lastStrategyChangeTurn = chronological.filter((row) => row.strategy_changed).at(-1)?.turn_number ?? 0;
  let pendingPreference: PreferredStrategy | null = null;
  let pendingPreferenceCount = 0;
  for (const row of chronological) {
    if (row.turn_number <= lastStrategyChangeTurn || row.decision_source !== "adaptive" || row.state_confidence === null || !row.detected_state) continue;
    const mapped = stateToPreferredStrategy[row.detected_state];
    const preference = mapped === "contextual" ? "keep_current" : mapped;
    if (preference === "keep_current" || preference === currentStrategy || row.state_confidence < ideonConfig.moderateSignalThreshold) {
      pendingPreference = null;
      pendingPreferenceCount = 0;
    } else if (preference === pendingPreference) {
      pendingPreferenceCount += 1;
    } else {
      pendingPreference = preference;
      pendingPreferenceCount = 1;
    }
  }
  return { lastStrategyChangeTurn, pendingPreference, pendingPreferenceCount };
}

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function sameHash(left: string, right: string) {
  const a = Buffer.from(left, "hex"); const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createStudySession(mode: StudyMode): Promise<NewStudySession> {
  const configuredPhase = process.env.IDEON_STUDY_PHASE ?? "development";
  if (!(["development", "pilot", "main"] as const).includes(configuredPhase as "development" | "pilot" | "main")) throw new Error("invalid_study_phase");
  const phase = configuredPhase as "development" | "pilot" | "main";
  const configs = await supabaseRequest<ExperimentConfigRow[]>(`/rest/v1/experiment_configs?study_phase=eq.${phase}&is_active=eq.true&select=id,config_version,study_phase,model_provider,model_name,model_version,state_prompt_version,explore_prompt_version,deepen_prompt_version,task_version,assigned_task,frozen_at&order=created_at.desc&limit=1`, { serviceRole: true });
  const config = configs[0];
  if (!config) throw new Error("study_not_configured");
  if (phase === "main" && !config.frozen_at) throw new Error("main_config_not_frozen");

  // Insert with the participant-selected mode immediately. This works with
  // both the original immutable-assignment trigger and the v2 schema.
  const participantCode = `IDN-P-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const participants = await supabaseRequest<Array<{ id: string }>>("/rest/v1/participants?select=id", {
    method: "POST",
    body: { participant_code: participantCode, study_version: config.config_version },
    serviceRole: true,
    prefer: "return=representation",
  });
  const participant = participants[0];
  if (!participant) throw new Error("participant_creation_failed");

  const sessionToken = randomBytes(32).toString("hex");
  const sessionCode = `IDN-S-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const sessions = await supabaseRequest<Array<{ id: string; status: string }>>("/rest/v1/study_sessions?select=id,status", {
    method: "POST",
    body: {
      session_code: sessionCode,
      session_token_hash: tokenHash(sessionToken),
      participant_id: participant.id,
      experiment_config_id: config.id,
      experiment_condition: mode,
      experiment_config_version: config.config_version,
      study_phase: config.study_phase,
      model_provider: config.model_provider,
      model_name: config.model_name,
      model_version: config.model_version,
      state_prompt_version: config.state_prompt_version,
      explore_prompt_version: config.explore_prompt_version,
      deepen_prompt_version: config.deepen_prompt_version,
      task_version: config.task_version,
      assigned_task: config.assigned_task,
      original_topic: "Generative AI in University Education",
    },
    serviceRole: true,
    prefer: "return=representation",
  });
  const session = sessions[0];
  if (!session) throw new Error("session_creation_failed");
  return { sessionId: session.id, sessionToken, participantCode, sessionCode, status: session.status, mode };
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

export async function beginStudy(credentials: StudyCredentials, mode: StudyMode) {
  const session = await requireStudySession(credentials);
  if (!session.consent_given) throw new Error("consent_required");
  if (session.experiment_condition !== mode) throw new Error("mode_locked");
  if (session.status === "in_progress" && session.started_at) return { mode, modeLocked: true };
  if (session.turn_count > 0 || session.started_at) throw new Error("mode_locked");
  if (session.status !== "consented") throw new Error("session_not_ready");
  const now = new Date().toISOString();
  await supabaseRequest(`/rest/v1/study_sessions?id=eq.${encodeURIComponent(credentials.sessionId)}`, { method: "PATCH", body: { status: "in_progress", started_at: now, last_activity_at: now }, serviceRole: true, prefer: "return=minimal" });
  return { mode, modeLocked: true };
}

export async function loadStudy(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  const messages = await supabaseRequest<Array<{ id: string; role: "user" | "assistant"; content: string; created_at: string; message_status: string }>>(`/rest/v1/messages?session_id=eq.${session.id}&message_status=eq.completed&select=id,role,content,created_at,message_status&order=created_at.asc`, { serviceRole: true });
  return {
    session: { id: session.id, code: session.session_code, condition: session.experiment_condition, status: session.status, assignedTask: session.assigned_task, turnCount: session.turn_count, modeLocked: Boolean(session.started_at || session.turn_count > 0 || session.status === "in_progress") },
    messages: messages.map((m): ChatMessage => ({ id: m.id, role: m.role, content: m.content, createdAt: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })),
  };
}

export async function loadTurnContext(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  if (!session.consent_given || !["consented", "in_progress"].includes(session.status)) throw new Error("session_not_active");
  const [messages, strategyRows] = await Promise.all([
    supabaseRequest<Array<{ id: string; role: "user" | "assistant"; content: string; created_at: string }>>(`/rest/v1/messages?session_id=eq.${session.id}&message_status=eq.completed&select=id,role,content,created_at&order=created_at.asc&limit=24`, { serviceRole: true }),
    supabaseRequest<StrategyRow[]>(`/rest/v1/strategy_events?session_id=eq.${session.id}&select=turn_number,selected_strategy,strategy_changed,detected_state,state_confidence,decision_source&order=turn_number.desc&limit=12`, { serviceRole: true }),
  ]);
  const restored = restoredAdaptiveSignals(strategyRows, session.current_strategy);
  const state: IdeonSessionState = {
    condition: session.experiment_condition,
    context: { originalTopic: session.original_topic ?? undefined, currentDirection: session.current_direction ?? undefined, selectedIdeas: session.selected_ideas ?? [], rejectedIdeas: session.rejected_ideas ?? [], userConstraints: session.user_constraints ?? [], currentStrategy: session.current_strategy ?? undefined },
    currentStrategy: session.current_strategy,
    turnNumber: session.turn_count,
    ...restored,
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
