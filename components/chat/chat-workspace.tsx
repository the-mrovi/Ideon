"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Flag, Send } from "lucide-react";
import { IdeonMark } from "@/components/brand/ideon-brand";
import { ChatMessage } from "@/components/chat/chat-message";
import { DebugInspector, type DebugTurn } from "@/components/chat/debug-inspector";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { ChatMessage as Message, ExperimentCondition } from "@/types/study";

declare global {
  interface Document { modelContext?: { registerTool(tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute(input: unknown): unknown | Promise<unknown> }, options?: { signal?: AbortSignal }): void | Promise<void> } }
}

interface ChatApiResult { response?: string; debug?: DebugTurn; error?: { code: string; message: string; retryable: boolean } }

const STUDY_CONDITION: ExperimentCondition = "adaptive";
const initialMessages: Message[] = [{ id: "welcome", role: "assistant", content: "Let’s begin with the part of generative AI in university education that you find most interesting. What have you noticed or wondered about?", createdAt: "Now" }];

export function ChatWorkspace() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<DebugTurn | null>(null);
  const busyRef = useRef(false);
  const sessionIdRef = useRef("");
  const messagesRef = useRef(messages);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 160);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? "auto" : "hidden";
  }, [value]);

  const sendMessage = useCallback(async (raw: string, appendUser = true) => {
    const content = raw.trim();
    if (!content || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    if (!sessionIdRef.current) sessionIdRef.current = `IDN-${crypto.randomUUID()}`;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const thinkingId = crypto.randomUUID();
    const history = messagesRef.current;
    const user: Message = { id: crypto.randomUUID(), role: "user", content, createdAt: now, status: "sending" };
    setMessages((items) => [...items.filter((item) => item.status !== "failed"), ...(appendUser ? [user] : []), { id: thinkingId, role: "assistant", content: "", createdAt: now, status: "thinking" }]);
    setValue("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionIdRef.current, condition: STUDY_CONDITION, message: content, recentMessages: history.slice(-12) }) });
      const data = await response.json() as ChatApiResult;
      if (!response.ok || !data.response) throw new Error(data.error?.message ?? "Ideon could not complete that response. Please try again.");
      setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, content: data.response!, status: "streaming" } : item.status === "sending" ? { ...item, status: "normal" } : item));
      if (data.debug) setDebug(data.debug);
      window.setTimeout(() => setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, status: "normal" } : item)), 500);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ideon could not complete that response. Please try again.";
      setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, content: message, status: "failed" } : item.status === "sending" ? { ...item, status: "normal" } : item));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({ name: "submit_ideation_message", title: "Send an ideation message", description: "Send the participant's next message in the visible Ideon research conversation.", inputSchema: { type: "object", properties: { message: { type: "string", minLength: 1, maxLength: 4000 } }, required: ["message"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, async execute(input) { const candidate = input as { message?: unknown }; if (typeof candidate?.message !== "string" || !candidate.message.trim() || candidate.message.length > 4000) throw new Error("A message between 1 and 4000 characters is required."); const sent = await sendMessage(candidate.message); if (!sent) throw new Error("The message could not be sent."); return { status: "sent", characterCount: candidate.message.trim().length }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* Experimental WebMCP support is optional. */ }
    return () => lifecycle.abort();
  }, [sendMessage]);

  const submit = (event?: React.FormEvent) => { event?.preventDefault(); void sendMessage(value); };
  const retry = () => { const lastUser = [...messagesRef.current].reverse().find((message) => message.role === "user"); if (lastUser) void sendMessage(lastUser.content, false); };

  return (
    <section className="chat-workspace" aria-label="Ideon research conversation">
      <header className="chat-header">
        <div className="chat-brand"><IdeonMark /><div><strong>Ideon</strong><span><i /> Research session active</span></div></div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" className="finish-action" aria-label="Finish ideation"><Flag /><span>Finish ideation</span></Button></AlertDialogTrigger>
          <AlertDialogContent className="glass-dialog"><AlertDialogHeader><AlertDialogTitle>Ready to review your final idea?</AlertDialogTitle><AlertDialogDescription>You can return to this conversation if you want more time to think.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continue Ideating</AlertDialogCancel><AlertDialogAction onClick={() => router.push("/study/final")}>Review Final Idea</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </header>
      <Collapsible className="task-collapsible"><CollapsibleTrigger className="task-trigger"><span><small>Research task</small><strong>Generative AI in University Education</strong></span><ChevronDown /></CollapsibleTrigger><CollapsibleContent className="task-content">Develop a specific research problem and final research question. You’ll review your idea before submission.</CollapsibleContent></Collapsible>
      <div className="message-list" aria-live="polite"><div className="empty-chat-hint"><span>Begin with what interests you—there is no required way to approach the conversation.</span></div>{messages.map((message) => <ChatMessage key={message.id} message={message} onRetry={retry} />)}{debug ? <DebugInspector value={debug} /> : null}<div ref={endRef} /></div>
      <div className="chat-bottom"><form className="chat-composer" onSubmit={submit}><Textarea ref={textareaRef} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Share what you're thinking..." aria-label="Message Ideon" rows={1} disabled={busy} /><div className="composer-meta"><span>Enter to send · Shift + Enter for a new line</span><Button type="submit" size="icon" disabled={!value.trim() || busy} aria-label="Send message"><Send /></Button></div></form></div>
    </section>
  );
}
