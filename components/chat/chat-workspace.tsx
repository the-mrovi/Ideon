"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, BookOpen, ChevronDown, Flag, Sparkles } from "lucide-react";
import { IdeonMark } from "@/components/brand/ideon-brand";
import { ChatMessage } from "@/components/chat/chat-message";
import { DebugInspector, type DebugTurn } from "@/components/chat/debug-inspector";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { ChatMessage as Message } from "@/types/study";
import { readClientSession, type ClientStudySession } from "@/src/study/client-session";

declare global {
  interface Document { modelContext?: { registerTool(tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute(input: unknown): unknown | Promise<unknown> }, options?: { signal?: AbortSignal }): void | Promise<void> } }
}

interface ChatApiResult { response?: string; debug?: DebugTurn; error?: { code: string; message: string; retryable: boolean } }

const initialMessages: Message[] = [{ id: "welcome", role: "assistant", content: "Welcome to your research ideation session. Let’s explore the part of generative AI in university education that feels most important to you. What have you noticed, questioned, or wanted to understand more deeply?", createdAt: "Now" }];

const starterPrompts = [
  "Cognitive offloading in undergraduate learning",
  "How AI changes students’ problem-solving habits",
  "Rethinking assessment in AI-supported classrooms",
];

export function ChatWorkspace() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [debug, setDebug] = useState<DebugTurn | null>(null);
  const busyRef = useRef(false);
  const sessionRef = useRef<ClientStudySession | null>(null);
  const retryEventIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    const session = readClientSession();
    if (!session) { router.replace("/study/consent"); return; }
    sessionRef.current = session;
    fetch("/api/study/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume", sessionId: session.sessionId, sessionToken: session.sessionToken }) })
      .then(async (response) => { if (!response.ok) throw new Error("resume_failed"); return response.json() as Promise<{ messages?: Message[] }>; })
      .then((data) => { if (data.messages?.length) setMessages(data.messages); setReady(true); })
      .catch(() => router.replace("/study/consent"));
  }, [router]);

  const sendMessage = useCallback(async (raw: string, appendUser = true) => {
    const content = raw.trim();
    const session = sessionRef.current;
    if (!content || busyRef.current || !session) return false;
    busyRef.current = true;
    setBusy(true);
    const turnEventId = retryEventIdRef.current ?? crypto.randomUUID();
    retryEventIdRef.current = turnEventId;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const thinkingId = crypto.randomUUID();
    const user: Message = { id: crypto.randomUUID(), role: "user", content, createdAt: now, status: "sending" };
    setMessages((items) => [...items.filter((item) => item.status !== "failed"), ...(appendUser ? [user] : []), { id: thinkingId, role: "assistant", content: "", createdAt: now, status: "thinking" }]);
    setValue("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId, sessionToken: session.sessionToken, turnEventId, message: content }) });
      const data = await response.json() as ChatApiResult;
      if (!response.ok || !data.response) throw new Error(data.error?.message ?? "Ideon could not complete that response. Please try again.");
      setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, content: data.response!, status: "streaming" } : item.status === "sending" ? { ...item, status: "normal" } : item));
      if (data.debug) setDebug(data.debug);
      retryEventIdRef.current = null;
      window.setTimeout(() => setMessages((items) => items.map((item) => item.id === thinkingId ? { ...item, status: "normal" } : item)), 500);
      return true;
    } catch (error) {
      retryEventIdRef.current = null;
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
      <div className="chat-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <header className="chat-header">
        <div className="chat-brand"><IdeonMark /><div><strong>Ideon</strong><span><i /> Research session active</span></div></div>
        <nav className="chat-progress" aria-label="Research session progress">
          <span className="is-active" aria-current="step"><b>1</b><strong>Chat</strong></span>
          <span><b>2</b><strong>Final</strong></span>
          <span><b>3</b><strong>Survey</strong></span>
        </nav>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" className="finish-action" aria-label="Finish ideation"><Flag /><span>Finish ideation</span></Button></AlertDialogTrigger>
          <AlertDialogContent className="glass-dialog"><AlertDialogHeader><AlertDialogTitle>Ready to review your final idea?</AlertDialogTitle><AlertDialogDescription>You can return to this conversation if you want more time to think.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continue Ideating</AlertDialogCancel><AlertDialogAction onClick={() => router.push("/study/final")}>Review Final Idea</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </header>
      <Collapsible className="task-collapsible">
        <CollapsibleTrigger className="task-trigger">
          <span className="task-title"><span className="task-kicker"><i /><small>Research task</small></span><strong>Generative AI in University Education</strong></span>
          <span className="task-guidelines"><BookOpen /><em>View guidelines</em><ChevronDown /></span>
        </CollapsibleTrigger>
        <CollapsibleContent className="task-content"><div className="task-grid"><div><small>Core objective</small><p>Develop a specific research problem through a focused conversation.</p></div><div><small>Expected outcome</small><p>A clear research question ready for final review and submission.</p></div></div></CollapsibleContent>
      </Collapsible>
      <div className="message-list" aria-live="polite"><div className="conversation-stream"><div className="conversation-intro"><span><Sparkles /> Guided ideation</span><p>There is no required way to begin. Follow the question that genuinely interests you.</p></div>{messages.map((message) => <ChatMessage key={message.id} message={message} onRetry={retry} />)}{messages.length === 1 && !busy && ready ? <div className="starter-prompts" aria-label="Suggested starting points">{starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => { setValue(prompt); textareaRef.current?.focus(); }}>{prompt}<ArrowUp /></button>)}</div> : null}{debug ? <DebugInspector value={debug} /> : null}<div ref={endRef} /></div></div>
      <div className="chat-bottom"><form className="chat-composer" onSubmit={submit}><div className="composer-field"><label htmlFor="ideon-message"><Sparkles /> Research response</label><Textarea id="ideon-message" ref={textareaRef} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={ready ? "Share what you’re thinking…" : "Restoring your session…"} aria-label="Message Ideon" rows={1} disabled={busy || !ready} /><div className="composer-meta"><span>Enter to send · Shift + Enter for a new line</span><span className={`composer-status ${ready ? "is-ready" : ""}`}><i /> {ready ? "Ideon is ready" : "Restoring session"}</span></div></div><Button type="submit" className="composer-send" disabled={!value.trim() || busy || !ready} aria-label="Send message"><span>Send</span><ArrowUp /></Button></form></div>
    </section>
  );
}
