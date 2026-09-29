export type PilotStudyMode = "random" | "adaptive" | "natural";
export type PilotSessionStatus = "created" | "in_progress" | "completed" | "abandoned";
export type MessageSender = "user" | "ai";
export type ObservedBehavior =
  | "asks_for_alternatives"
  | "selects_idea"
  | "shows_interest"
  | "requests_more_detail"
  | "rejects_idea"
  | "changes_direction"
  | "shows_uncertainty"
  | "shows_stuck"
  | "accepts_suggestion"
  | "other";
export type AnnotatedUserState = "uncertain" | "exploring" | "interested" | "committed" | "rejecting" | "stuck" | "neutral";
export type PreferredStrategy = "explore" | "deepen" | "keep_current";

export interface Participant {
  id: string;
  participant_code: string;
  created_at: string;
}

export interface Session {
  id: string;
  participant_id: string;
  research_task: string;
  study_mode: PilotStudyMode | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  status: PilotSessionStatus;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  turn_number: number;
  sender: MessageSender;
  message_text: string;
  created_at: string;
}

export interface BehaviorAnnotation {
  id: string;
  message_id: string;
  observed_behavior: ObservedBehavior;
  user_state: AnnotatedUserState;
  preferred_strategy: PreferredStrategy;
  confidence: number | null;
  researcher_notes: string | null;
  created_at: string;
}

export interface FinalIdeaRecord {
  id: string;
  session_id: string;
  research_topic: string | null;
  research_problem: string | null;
  research_question: string | null;
  submitted_at: string;
}

export interface PostSessionResponse {
  id: string;
  session_id: string;
  question_key: string;
  response_text: string | null;
  numeric_value: number | null;
  created_at: string;
}
