import { IdeonMark } from "@/components/brand/ideon-brand";
import type { ChatMessage } from "@/types/study";

export function SessionTranscript({ messages }: { messages: ChatMessage[] }) {
  return <section className="detail-card transcript-card"><div className="detail-card-heading"><span>Conversation</span><h2>Full transcript</h2></div><div className="admin-transcript">{messages.map((message) => <article className={message.role} key={message.id}>{message.role === "assistant" ? <IdeonMark /> : <span className="participant-avatar">P</span>}<div><div><strong>{message.role === "assistant" ? "Ideon" : "Participant"}</strong><time>{message.createdAt}</time></div><p>{message.content}</p></div></article>)}</div></section>;
}
