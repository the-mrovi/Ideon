"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Goal, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readClientSession } from "@/src/study/client-session";

export function TaskBrief() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const begin = async () => {
    const session = readClientSession();
    if (!session) { router.replace("/study/consent"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/study/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "begin", sessionId: session.sessionId, sessionToken: session.sessionToken }) });
      if (!response.ok) throw new Error("The research session could not be started.");
      router.push("/study/chat");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start."); }
    finally { setBusy(false); }
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
      <div className="form-actions right-only">{error ? <p role="alert">{error}</p> : null}<Button onClick={begin} disabled={busy} className="action-button">{busy ? "Starting..." : "Begin Ideation"} <ArrowRight /></Button></div>
    </section>
  );
}
