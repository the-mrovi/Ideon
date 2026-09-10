"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Ellipsis, Flag, Send } from "lucide-react";
import { IdeonMark } from "@/components/brand/ideon-brand";
import { ChatMessage } from "@/components/chat/chat-message";
import { StrategyOverride } from "@/components/chat/strategy-override";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { ChatMessage as Message } from "@/types/study";

declare global {
  interface Document { modelContext?: { registerTool(tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute(input: unknown): unknown | Promise<unknown> }, options?: { signal?: AbortSignal }): void | Promise<void> } }
}

const initialMessages: Message[] = [
  { id: "welcome", role: "assistant", content: "Let’s begin with the part of generative AI in university education that you find most interesting. What have you noticed or wondered about?", createdAt: "Now" },
];

function mockReply(input: string) {
  const lowered = input.toLowerCase();
  if (lowered.includes("student")) return "You’re focusing on students’ experience. What specific change in their learning, confidence, or decision-making would be most meaningful to investigate?";
  if (lowered.includes("teacher") || lowered.includes("lecturer")) return "That brings the educator’s role into focus. Which teaching decision or classroom practice could you observe clearly enough to turn into a research problem?";
  return "There may be a promising research problem in that direction. What group, setting, and outcome would help you make the idea more specific?";
}

export function ChatWorkspace() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const sendMessage = useCallback((raw: string) => {
    const content = raw.trim();
    if (!content || busy) return false;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const user: Message = { id: crypto.randomUUID(), role: "user", content, createdAt: now, status: "sending" };
    const thinkingId = crypto.randomUUID();
    setMessages((items) => [...items, user, { id: thinkingId, role: "assistant", content: "", createdAt: now, status: "thinking" }]);
    setValue(""); setBusy(true);
    window.setTimeout(() => {
      if (content.toLowerCase().includes("network error")) {
        setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, content: "We couldn’t complete that response. Your message is still here.", status: "failed" } : item));
        setBusy(false); return;
      }
      setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, content: mockReply(content), status: "streaming" } : item));
      window.setTimeout(() => { setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, status: "normal" } : item)); setBusy(false); }, 700);
    }, 850);
    return true;
  }, [busy]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "submit_ideation_message", title: "Send an ideation message",
        description: "Send the participant's next message in the visible Ideon research conversation.",
        inputSchema: { type: "object", properties: { message: { type: "string", minLength: 1, maxLength: 4000 } }, required: ["message"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          const candidate = input as { message?: unknown };
          if (typeof candidate?.message !== "string" || !candidate.message.trim() || candidate.message.length > 4000) throw new Error("A message between 1 and 4000 characters is required.");
          const sent = sendMessage(candidate.message);
          if (!sent) throw new Error("The conversation is busy. Try again when the response finishes.");
          return { status: "sent", characterCount: candidate.message.trim().length };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* Unsupported experimental registration is non-blocking. */ }
    return () => lifecycle.abort();
  }, [sendMessage]);

  const submit = (event?: React.FormEvent) => { event?.preventDefault(); sendMessage(value); };
  const retry = () => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    setMessages((items) => items.filter((item) => item.status !== "failed")); setBusy(false);
    window.setTimeout(() => lastUser && sendMessage(lastUser.content), 0);
  };

  return (
    <section className="chat-workspace" aria-label="Ideon research conversation">
      <header className="chat-header">
        <div className="chat-brand"><IdeonMark /><div><strong>Ideon</strong><span><i /> Research session active</span></div></div>
        <Button variant="ghost" size="icon" aria-label="Session menu"><Ellipsis /></Button>
      </header>
      <Collapsible className="task-collapsible">
        <CollapsibleTrigger className="task-trigger"><span><small>Research task</small><strong>Generative AI in University Education</strong></span><ChevronDown /></CollapsibleTrigger>
        <CollapsibleContent className="task-content">Develop a specific research problem and final research question. You’ll review your idea before submission.</CollapsibleContent>
      </Collapsible>
      <div className="message-list" aria-live="polite">
        <div className="empty-chat-hint"><span>Begin with what interests you—there is no required way to approach the conversation.</span></div>
        {messages.map((message) => <ChatMessage key={message.id} message={message} onRetry={retry} />)}
        <StrategyOverride />
        <div ref={endRef} />
      </div>
      <div className="chat-bottom">
        <form className="chat-composer" onSubmit={submit}>
          <Textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Share what you're thinking..." aria-label="Message Ideon" rows={1} disabled={busy} />
          <div className="composer-meta"><span>Enter to send · Shift + Enter for a new line</span><Button type="submit" size="icon" disabled={!value.trim() || busy} aria-label="Send message"><Send /></Button></div>
        </form>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" className="finish-action"><Flag /> Finish Ideation</Button></AlertDialogTrigger>
          <AlertDialogContent className="glass-dialog">
            <AlertDialogHeader><AlertDialogTitle>Ready to review your final idea?</AlertDialogTitle><AlertDialogDescription>You can return to this conversation if you want more time to think.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Continue Ideating</AlertDialogCancel><AlertDialogAction onClick={() => router.push("/study/final")}>Review Final Idea</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
