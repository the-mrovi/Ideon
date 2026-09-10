"use client";

import { useState } from "react";
import { Check, Copy, Lightbulb, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage as ChatMessageType } from "@/types/study";

export function ThinkingIndicator() {
  return <span className="thinking-dots" aria-label="Ideon is thinking"><i /><i /><i /></span>;
}

export function ChatMessage({ message, onRetry }: { message: ChatMessageType; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (message.role === "user") return <article className="chat-message user-message"><p>{message.content}</p><time>{message.createdAt}</time></article>;
  if (message.status === "thinking") return (
    <article className="chat-message ai-message"><span className="message-avatar"><Lightbulb /></span><div><strong>Ideon</strong><ThinkingIndicator /></div></article>
  );
  if (message.status === "failed") return (
    <article className="chat-message ai-message error-message"><span className="message-avatar error"><TriangleAlert /></span><div><strong>Response interrupted</strong><p>{message.content}</p><Button variant="outline" size="sm" onClick={onRetry}><RefreshCw /> Retry</Button></div></article>
  );
  const copy = async () => { await navigator.clipboard?.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
  return (
    <article className={`chat-message ai-message ${message.status === "streaming" ? "is-streaming" : ""}`}>
      <span className="message-avatar"><Lightbulb /></span>
      <div className="message-body"><div className="message-byline"><strong>Ideon</strong><time>{message.createdAt}</time></div><p>{message.content}</p>
        <Button variant="ghost" size="icon-xs" className="copy-response" onClick={copy} aria-label={copied ? "Response copied" : "Copy response"}>{copied ? <Check /> : <Copy />}</Button>
      </div>
    </article>
  );
}
