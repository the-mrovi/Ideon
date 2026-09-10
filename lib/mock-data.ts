import type { AdminSession, ChatMessage } from "@/types/study";

// Part 3 integration point: replace these exports with repository/service calls.
export const mockSessions: AdminSession[] = [
  { id: "IDN-A7F3", participantCode: "P-1042", condition: "adaptive", startedAt: "11 Sep, 10:24", duration: "21m 18s", status: "completed", hasFinalIdea: true },
  { id: "IDN-K2M8", participantCode: "P-1041", condition: "random", startedAt: "11 Sep, 09:46", duration: "18m 42s", status: "completed", hasFinalIdea: true },
  { id: "IDN-R9C1", participantCode: "P-1040", condition: "fixed", startedAt: "10 Sep, 16:18", duration: "24m 05s", status: "completed", hasFinalIdea: true },
  { id: "IDN-V4D6", participantCode: "P-1039", condition: "adaptive", startedAt: "10 Sep, 15:32", duration: "12m 11s", status: "active", hasFinalIdea: false },
  { id: "IDN-B8Q2", participantCode: "P-1038", condition: "random", startedAt: "10 Sep, 13:04", duration: "16m 57s", status: "completed", hasFinalIdea: true },
  { id: "IDN-N5H7", participantCode: "P-1037", condition: "fixed", startedAt: "09 Sep, 17:21", duration: "—", status: "not_started", hasFinalIdea: false },
];

export const mockTranscript: ChatMessage[] = [
  { id: "m1", role: "assistant", content: "Let’s begin with the part of generative AI in university education that you find most interesting. What have you noticed or wondered about?", createdAt: "10:25" },
  { id: "m2", role: "user", content: "I’m interested in whether students still develop problem-solving skills when AI can help them complete difficult assignments.", createdAt: "10:27" },
  { id: "m3", role: "assistant", content: "That points to a useful tension between getting help and developing independent capability. Which kind of problem-solving would make this question concrete enough to study?", createdAt: "10:27" },
  { id: "m4", role: "user", content: "Maybe debugging skills among first-year computer science students. They often use AI before trying to understand the error themselves.", createdAt: "10:29" },
];

export const questionnaireResponses = [
  ["The conversation helped me develop an original direction.", 4],
  ["I felt in control of the direction of the conversation.", 5],
  ["The final research idea feels like my own.", 4],
  ["I trusted the suggestions provided by Ideon.", 4],
  ["The task required a manageable amount of mental effort.", 3],
] as const;
