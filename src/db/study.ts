import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { rpc, supabaseRequest } from "./supabase.ts";
import type { ChatMessage, ExperimentCondition, FinalIdea, StudyMode } from "../../types/study.ts";
import type { IdeonSessionState } from "../ai/sessionStore.ts";
import type { ActiveStrategy, PreferredStrategy, UserState } from "../ai/decisionTypes.ts";
import { ideonConfig, stateToPreferredStrategy } from "../ai/experimentConfig.ts";

export interface StudyCredentials { sessionId: string; sessionToken: string }
export interface NewStudySession extends StudyCredentials { participantCode: string; sessionCode: string; status: string; mode?: StudyMode }

interface CoreSessionRow {
  id: string; participant_id: string; research_task: string; study_mode: "random" | "adaptive" | "natural" | null;
  started_at: string | null; ended_at: string | null; duration_seconds: number | null;
  status: "created" | "in_progress" | "completed" | "abandoned"; created_at: string; updated_at: string;
}

interface SessionAccessRow { session_id: string; session_token_hash: string; consent_given: boolean }

interface SessionRuntimeRow {
  session_id: string; session_code: string; experiment_config_version: string; study_phase: "development" | "pilot" | "main";
  model_provider: string; model_name: string; model_version: string; state_prompt_version: string;
  explore_prompt_version: string; deepen_prompt_version: string; task_version: string; original_topic: string | null;
  current_direction: string | null; selected_ideas: string[]; rejected_ideas: string[]; user_constraints: string[];
  current_strategy: "explore" | "deepen" | null; turn_count: number;
}

export interface LoadedStudySession extends CoreSessionRow, SessionRuntimeRow {
  session_token_hash: string; consent_given: boolean; experiment_condition: ExperimentCondition; assigned_task: string;
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

  const participantCode = `P${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const participants = await supabaseRequest<Array<{ id: string }>>("/rest/v1/participants?select=id", {
    method: "POST",
    body: { participant_code: participantCode },
    serviceRole: true,
    prefer: "return=representation",
  });
  const participant = participants[0];
  if (!participant) throw new Error("participant_creation_failed");

  try {
    const sessions = await supabaseRequest<Array<{ id: string; status: string }>>("/rest/v1/sessions?select=id,status", {
      method: "POST", body: { participant_id: participant.id, research_task: config.assigned_task, study_mode: mode }, serviceRole: true, prefer: "return=representation",
    });
    const session = sessions[0];
    if (!session) throw new Error("session_creation_failed");
    const sessionToken = randomBytes(32).toString("hex");
    const sessionCode = `IDN-S-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    await Promise.all([
      supabaseRequest("/rest/v1/session_access", { method: "POST", body: { session_id: session.id, session_token_hash: tokenHash(sessionToken) }, serviceRole: true, prefer: "return=minimal" }),
      supabaseRequest("/rest/v1/session_runtime", {
        method: "POST",
        body: {
          session_id: session.id, session_code: sessionCode, experiment_config_id: config.id,
          experiment_config_version: config.config_version, study_phase: config.study_phase,
          model_provider: config.model_provider, model_name: config.model_name, model_version: config.model_version,
          state_prompt_version: config.state_prompt_version, explore_prompt_version: config.explore_prompt_version,
          deepen_prompt_version: config.deepen_prompt_version, task_version: config.task_version,
          original_topic: "Generative AI in University Education",
        },
        serviceRole: true,
        prefer: "return=minimal",
      }),
    ]);
    return { sessionId: session.id, sessionToken, participantCode, sessionCode, status: session.status, mode };
  } catch (error) {
    await supabaseRequest(`/rest/v1/participants?id=eq.${participant.id}`, { method: "DELETE", serviceRole: true, prefer: "return=minimal" }).catch(() => undefined);
    throw error;
  }
}

export async function requireStudySession(credentials: StudyCredentials): Promise<LoadedStudySession> {
  const id = encodeURIComponent(credentials.sessionId);
  const [sessions, accessRows, runtimeRows] = await Promise.all([
    supabaseRequest<CoreSessionRow[]>(`/rest/v1/sessions?id=eq.${id}&select=*`, { serviceRole: true }),
    supabaseRequest<SessionAccessRow[]>(`/rest/v1/session_access?session_id=eq.${id}&select=session_id,session_token_hash,consent_given`, { serviceRole: true }),
    supabaseRequest<SessionRuntimeRow[]>(`/rest/v1/session_runtime?session_id=eq.${id}&select=*`, { serviceRole: true }),
  ]);
  const session = sessions[0]; const access = accessRows[0]; const runtime = runtimeRows[0];
  if (!session || !access || !runtime || !credentials.sessionToken || !sameHash(access.session_token_hash, tokenHash(credentials.sessionToken))) throw new Error("invalid_session_token");
  return { ...session, ...runtime, session_token_hash: access.session_token_hash, consent_given: access.consent_given, experiment_condition: (session.study_mode ?? "natural") as ExperimentCondition, assigned_task: session.research_task };
}

export async function recordConsent(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  const now = new Date().toISOString();
  await Promise.all([
    supabaseRequest(`/rest/v1/session_access?session_id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: { consent_given: true, read_study_information: true, understands_recording: true, agrees_to_participate: true, consent_version: "ideon-consent-v1", consent_timestamp: now }, serviceRole: true, prefer: "return=minimal" }),
    supabaseRequest(`/rest/v1/session_runtime?session_id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: { last_activity_at: now }, serviceRole: true, prefer: "return=minimal" }),
  ]);
}

export async function beginStudy(credentials: StudyCredentials, mode: StudyMode) {
  const session = await requireStudySession(credentials);
  if (!session.consent_given) throw new Error("consent_required");
  if (session.study_mode !== mode) throw new Error("mode_locked");
  if (session.status === "in_progress" && session.started_at) return { mode, modeLocked: true };
  if (session.turn_count > 0 || session.started_at) throw new Error("mode_locked");
  if (session.status !== "created") throw new Error("session_not_ready");
  const now = new Date().toISOString();
  await Promise.all([
    supabaseRequest(`/rest/v1/sessions?id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: { status: "in_progress", started_at: now }, serviceRole: true, prefer: "return=minimal" }),
    supabaseRequest(`/rest/v1/session_runtime?session_id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: { last_activity_at: now }, serviceRole: true, prefer: "return=minimal" }),
  ]);
  return { mode, modeLocked: true };
}

export async function loadStudy(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  const messages = await supabaseRequest<Array<{ id: string; sender: "user" | "ai"; message_text: string; created_at: string }>>(`/rest/v1/messages?session_id=eq.${session.id}&select=id,sender,message_text,created_at&order=turn_number.asc,created_at.asc`, { serviceRole: true });
  return {
    session: { id: session.id, code: session.session_code, condition: session.study_mode, status: session.status, assignedTask: session.research_task, turnCount: session.turn_count, modeLocked: Boolean(session.started_at || session.turn_count > 0 || session.status === "in_progress") },
    messages: messages.map((message): ChatMessage => ({ id: message.id, role: message.sender === "ai" ? "assistant" : "user", content: message.message_text, createdAt: new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })),
  };
}

export async function loadTurnContext(credentials: StudyCredentials) {
  const session = await requireStudySession(credentials);
  if (!session.consent_given || session.status !== "in_progress") throw new Error("session_not_active");
  const [messages, strategyRows] = await Promise.all([
    supabaseRequest<Array<{ id: string; sender: "user" | "ai"; message_text: string; created_at: string }>>(`/rest/v1/messages?session_id=eq.${session.id}&select=id,sender,message_text,created_at&order=turn_number.asc,created_at.asc&limit=24`, { serviceRole: true }),
    supabaseRequest<StrategyRow[]>(`/rest/v1/automatic_behavior_predictions?session_id=eq.${session.id}&select=turn_number,selected_strategy,strategy_changed,detected_state,state_confidence,decision_source&order=turn_number.desc&limit=12`, { serviceRole: true }),
  ]);
  const restored = restoredAdaptiveSignals(strategyRows, session.current_strategy);
  const state: IdeonSessionState = {
    condition: session.experiment_condition,
    context: { originalTopic: session.original_topic ?? undefined, currentDirection: session.current_direction ?? undefined, selectedIdeas: session.selected_ideas ?? [], rejectedIdeas: session.rejected_ideas ?? [], userConstraints: session.user_constraints ?? [], currentStrategy: session.current_strategy ?? undefined },
    currentStrategy: session.current_strategy,
    turnNumber: session.turn_count,
    ...restored,
  };
  return { session, state, recentMessages: messages.map((message): ChatMessage => ({ id: message.id, role: message.sender === "ai" ? "assistant" : "user", content: message.message_text, createdAt: message.created_at })) };
}

export async function saveFinalIdea(credentials: StudyCredentials, idea: FinalIdea, submit: boolean) {
  const session = await requireStudySession(credentials);
  await rpc("save_final_idea", { p_session_id: session.id, p_idea: { topic: idea.topic, problem: idea.problem, question: idea.question, explanation: idea.explanation }, p_submit: submit });
}

export async function loadFinalIdea(credentials: StudyCredentials): Promise<FinalIdea | null> {
  const session = await requireStudySession(credentials);
  const drafts = await supabaseRequest<Array<{ research_topic: string; research_problem: string; research_question: string; short_explanation: string }>>(`/rest/v1/final_idea_drafts?session_id=eq.${session.id}&select=research_topic,research_problem,research_question,short_explanation`, { serviceRole: true });
  if (drafts[0]) return { topic: drafts[0].research_topic, problem: drafts[0].research_problem, question: drafts[0].research_question, explanation: drafts[0].short_explanation };
  const rows = await supabaseRequest<Array<{ research_topic: string | null; research_problem: string | null; research_question: string | null }>>(`/rest/v1/final_ideas?session_id=eq.${session.id}&select=research_topic,research_problem,research_question`, { serviceRole: true });
  const idea = rows[0];
  return idea ? { topic: idea.research_topic ?? "", problem: idea.research_problem ?? "", question: idea.research_question ?? "", explanation: "" } : null;
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
