import "server-only";
import { supabaseRequest } from "./supabase.ts";
import type {
  BehaviorAnnotation,
  FinalIdeaRecord,
  Message,
  ObservedBehavior,
  Participant,
  PilotStudyMode,
  PostSessionResponse,
  PreferredStrategy,
  Session,
  AnnotatedUserState,
} from "../../types/database.ts";

const representation = "return=representation";
const upsertRepresentation = "resolution=merge-duplicates,return=representation";

export async function createParticipant(participantCode: string): Promise<Participant> {
  const rows = await supabaseRequest<Participant[]>("/rest/v1/participants?select=*", {
    method: "POST",
    body: { participant_code: participantCode },
    serviceRole: true,
    prefer: representation,
  });
  if (!rows[0]) throw new Error("participant_creation_failed");
  return rows[0];
}

export async function createSession(input: { participantId: string; researchTask: string; studyMode?: PilotStudyMode | null }): Promise<Session> {
  const rows = await supabaseRequest<Session[]>("/rest/v1/sessions?select=*", {
    method: "POST",
    body: { participant_id: input.participantId, research_task: input.researchTask, study_mode: input.studyMode ?? null },
    serviceRole: true,
    prefer: representation,
  });
  if (!rows[0]) throw new Error("session_creation_failed");
  return rows[0];
}

export async function saveMessage(input: { sessionId: string; turnNumber: number; sender: "user" | "ai"; messageText: string }): Promise<Message> {
  const rows = await supabaseRequest<Message[]>("/rest/v1/messages?select=*", {
    method: "POST",
    body: { session_id: input.sessionId, turn_number: input.turnNumber, sender: input.sender, message_text: input.messageText },
    serviceRole: true,
    prefer: representation,
  });
  if (!rows[0]) throw new Error("message_creation_failed");
  return rows[0];
}

export function getSessionMessages(sessionId: string) {
  return supabaseRequest<Message[]>(`/rest/v1/messages?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=turn_number.asc,created_at.asc`, { serviceRole: true });
}

export async function saveBehaviorAnnotation(input: {
  messageId: string;
  observedBehavior: ObservedBehavior;
  userState: AnnotatedUserState;
  preferredStrategy: PreferredStrategy;
  confidence?: number | null;
  researcherNotes?: string | null;
}): Promise<BehaviorAnnotation> {
  const rows = await supabaseRequest<BehaviorAnnotation[]>("/rest/v1/behavior_annotations?on_conflict=message_id&select=*", {
    method: "POST",
    body: {
      message_id: input.messageId,
      observed_behavior: input.observedBehavior,
      user_state: input.userState,
      preferred_strategy: input.preferredStrategy,
      confidence: input.confidence ?? null,
      researcher_notes: input.researcherNotes ?? null,
    },
    serviceRole: true,
    prefer: upsertRepresentation,
  });
  if (!rows[0]) throw new Error("annotation_creation_failed");
  return rows[0];
}

export async function updateBehaviorAnnotation(id: string, changes: Partial<Pick<BehaviorAnnotation, "observed_behavior" | "user_state" | "preferred_strategy" | "confidence" | "researcher_notes">>): Promise<BehaviorAnnotation> {
  const rows = await supabaseRequest<BehaviorAnnotation[]>(`/rest/v1/behavior_annotations?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    body: changes,
    serviceRole: true,
    prefer: representation,
  });
  if (!rows[0]) throw new Error("annotation_not_found");
  return rows[0];
}

export async function saveFinalIdea(record: Omit<FinalIdeaRecord, "id" | "submitted_at">): Promise<FinalIdeaRecord> {
  const rows = await supabaseRequest<FinalIdeaRecord[]>("/rest/v1/final_ideas?on_conflict=session_id&select=*", {
    method: "POST",
    body: record,
    serviceRole: true,
    prefer: upsertRepresentation,
  });
  if (!rows[0]) throw new Error("final_idea_creation_failed");
  return rows[0];
}

export async function savePostSessionResponse(response: Omit<PostSessionResponse, "id" | "created_at">): Promise<PostSessionResponse> {
  const rows = await supabaseRequest<PostSessionResponse[]>("/rest/v1/post_session_responses?on_conflict=session_id,question_key&select=*", {
    method: "POST",
    body: response,
    serviceRole: true,
    prefer: upsertRepresentation,
  });
  if (!rows[0]) throw new Error("post_session_response_creation_failed");
  return rows[0];
}

export async function getSessionData(sessionId: string) {
  const id = encodeURIComponent(sessionId);
  const [sessions, messages, finalIdeas, responses] = await Promise.all([
    supabaseRequest<Session[]>(`/rest/v1/sessions?id=eq.${id}&select=*`, { serviceRole: true }),
    getSessionMessages(sessionId),
    supabaseRequest<FinalIdeaRecord[]>(`/rest/v1/final_ideas?session_id=eq.${id}&select=*`, { serviceRole: true }),
    supabaseRequest<PostSessionResponse[]>(`/rest/v1/post_session_responses?session_id=eq.${id}&select=*&order=created_at.asc`, { serviceRole: true }),
  ]);
  if (!sessions[0]) return null;
  const messageIds = messages.map((message) => message.id);
  const annotations = messageIds.length
    ? await supabaseRequest<BehaviorAnnotation[]>(`/rest/v1/behavior_annotations?message_id=in.(${messageIds.join(",")})&select=*`, { serviceRole: true })
    : [];
  return { session: sessions[0], messages, annotations, finalIdea: finalIdeas[0] ?? null, postSessionResponses: responses };
}
