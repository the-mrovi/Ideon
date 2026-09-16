export type ExperimentCondition = "fixed" | "random" | "adaptive";
export type ChatRole = "user" | "assistant";
export type MessageStatus = "normal" | "sending" | "thinking" | "streaming" | "failed";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status?: MessageStatus;
}

export interface StudySession {
  id: string;
  participantCode: string;
  condition?: ExperimentCondition;
  startedAt?: string;
  status: "not_started" | "active" | "completed";
}

export interface FinalIdea {
  topic: string;
  problem: string;
  question: string;
  explanation: string;
}

export interface AdminSession extends StudySession {
  sessionCode?: string;
  condition: ExperimentCondition;
  startedAt: string;
  duration: string;
  hasFinalIdea: boolean;
  turns?: number;
  studyPhase?: "development" | "pilot" | "main";
}
