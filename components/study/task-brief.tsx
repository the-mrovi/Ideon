"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Goal, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudyModeSelector } from "@/components/study/mode-selector";
import { clearClientConsent, hasClientConsent, readClientSession, readClientStudyMode, writeClientSession, writeClientStudyMode } from "@/src/study/client-session";
import type { StudyMode } from "@/types/study";

interface SessionResponse {
  sessionId?: string;
  sessionToken?: string;
  sessionCode?: string;
  participantCode?: string;
  error?: string;
}

const sessionErrors: Record<string, string> = {
  supabase_not_configured: "The research database is not configured on this server.",
  supabase_credentials_rejected: "The research database rejected the server credentials.",
  database_schema_missing: "The research database is missing the Ideon study schema.",
  database_unavailable: "The research database could not be reached. Please try again.",
  invalid_session: "The research session could not be verified. Please try again.",
  mode_locked: "This session's mode is already locked. Please return to consent and start a new session.",
  session_not_ready: "The research session is not ready to begin.",
  invalid_request: "The study server rejected the request. Please refresh and try again.",
};

async function requestSession(body: Record<string, string>, signal: AbortSignal) {
  const response = await fetch("/api/study/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => ({})) as SessionResponse;
  if (!response.ok) throw new Error(sessionErrors[payload.error ?? ""] ?? "The research session could not be started.");
  return payload;
}

export function TaskBrief() {
  const router = useRouter();
  const [mode, setMode] = useState<StudyMode>("random");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!hasClientConsent() && !readClientSession()) {
      router.replace("/study/consent");
      return;
    }
    const savedMode = readClientStudyMode();
    const restore = window.setTimeout(() => {
      if (savedMode === "random" || savedMode === "adaptive") setMode(savedMode);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [router]);
  const begin = async () => {
    if (!hasClientConsent() && !readClientSession()) { router.replace("/study/consent"); return; }
    setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      // Create the database row only after mode selection so its immutable
      // experiment condition is correct from the first insert.
      const session = await requestSession({ action: "start", mode }, controller.signal);
      if (!session.sessionId || !session.sessionToken || !session.sessionCode || !session.participantCode) {
        throw new Error("The study server returned an incomplete session. Please try again.");
      }
      const credentials = { sessionId: session.sessionId, sessionToken: session.sessionToken };
      await requestSession({ action: "consent", ...credentials }, controller.signal);
      await requestSession({ action: "begin", mode, ...credentials }, controller.signal);
      writeClientSession({ ...credentials, sessionCode: session.sessionCode, participantCode: session.participantCode, mode });
      writeClientStudyMode(mode);
      clearClientConsent();
      router.push("/study/chat");
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "AbortError"
        ? "The study server took too long to respond. Please try again."
        : cause instanceof Error ? cause.message : "Unable to start.");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  };
  return (
    <section className="form-panel brief-panel" aria-labelledby="brief-title">
      <div className="panel-kicker"><GraduationCap aria-hidden="true" /><span>Session briefing</span></div>
      <h1 id="brief-title">Your task</h1>
      <p className="panel-intro">Use Ideon to develop a clear and interesting research idea from the topic provided to you.</p>
      <div className="brief-topic">
        <span>Research topic</span>
        <strong>Generative AI in University Education</strong>
      </div>
      <div className="brief-grid">
        <article><Goal /><div><h2>Your goal</h2><p>Develop a specific research problem and a final research question.</p></div></article>
        <article><Clock3 /><div><h2>Session</h2><p>Approximately 20 minutes, followed by a short questionnaire.</p></div></article>
      </div>
      <div className="brief-note"><span>At the end</span><p>You’ll review and submit one final research direction in your own words.</p></div>
      <StudyModeSelector value={mode} onValueChange={(next) => { setMode(next); writeClientStudyMode(next); }} />
      <div className="form-actions right-only">{error ? <p role="alert">{error}</p> : null}<Button type="button" onClick={begin} disabled={busy} className="action-button">{busy ? "Starting..." : "Begin Ideation"} <ArrowRight /></Button></div>
    </section>
  );
}
