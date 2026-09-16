"use client";

import { useState } from "react";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { writeClientSession } from "@/src/study/client-session";

const agreements = [
  "I have read the study information.",
  "I understand that my interaction may be recorded for research.",
  "I agree to participate in this study.",
];

interface SessionResponse {
  sessionId?: string;
  sessionToken?: string;
  sessionCode?: string;
  participantCode?: string;
  error?: string;
}

const sessionErrors: Record<string, string> = {
  supabase_not_configured: "The research database is not configured on this server. Add the Supabase environment variables and redeploy.",
  supabase_credentials_rejected: "The research database rejected the server credentials. Check the Supabase service-role key and redeploy.",
  database_schema_missing: "The research database is missing the Ideon study schema. Apply the Supabase migrations and try again.",
  database_unavailable: "The research database could not be reached. Please try again in a moment.",
  invalid_session: "The new study session could not be verified. Please try again.",
  invalid_request: "The study server rejected the request. Please refresh the page and try again.",
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
  if (!response.ok) {
    throw new Error(sessionErrors[payload.error ?? ""] ?? "The study session could not be created. Please try again.");
  }
  return payload;
}

export function ConsentForm() {
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("Starting...");
  const [error, setError] = useState("");
  const complete = checked.every(Boolean);

  const continueToStudy = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setProgress("Creating session...");
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const session = await requestSession({ action: "start" }, controller.signal);
      if (!session.sessionId || !session.sessionToken || !session.sessionCode || !session.participantCode) throw new Error("The study server returned an incomplete session. Please contact the study coordinator.");
      setProgress("Recording consent...");
      await requestSession({ action: "consent", sessionId: session.sessionId, sessionToken: session.sessionToken }, controller.signal);
      writeClientSession({ sessionId: session.sessionId, sessionToken: session.sessionToken, sessionCode: session.sessionCode, participantCode: session.participantCode });
      window.location.assign("/study/instructions");
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "AbortError"
        ? "The study server took too long to respond. Check the deployment configuration and try again."
        : cause instanceof Error ? cause.message : "Unable to start the study.");
      setBusy(false);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  return (
    <section className="form-panel consent-panel" aria-labelledby="consent-title">
      <div className="panel-kicker"><FileCheck2 aria-hidden="true" /><span>Before you begin</span></div>
      <h1 id="consent-title">Research consent</h1>
      <p className="panel-intro">Please review the study information and confirm each statement below.</p>
      <div className="consent-copy">
        <h2>Study information</h2>
        <p>Participation in this research session is voluntary. Ideon is being evaluated as a tool for supporting research ideation with university students.</p>
        <p>Your conversation and submitted responses may be recorded and analysed for research purposes. Please avoid entering names, contact details, or other unnecessary personal information.</p>
        <p>You may stop the session if required by the approved study protocol. This placeholder information will be replaced with the final ethics-approved wording before deployment.</p>
      </div>
      <fieldset className="consent-checks">
        <legend>Your agreement</legend>
        {agreements.map((agreement, index) => (
          <label key={agreement} className="consent-check">
            <Checkbox checked={checked[index]} onCheckedChange={(value) => setChecked((items) => items.map((item, i) => i === index ? value === true : item))} aria-label={agreement} />
            <span>{agreement}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        <p className={error ? "validation-message" : undefined} role={error ? "alert" : "status"}>{error || (complete ? "You're ready to continue." : "Confirm all three statements to continue.")}</p>
        <Button type="button" disabled={!complete || busy} onClick={continueToStudy} className="action-button">{busy ? progress : "Continue"} <ArrowRight /></Button>
      </div>
    </section>
  );
}
