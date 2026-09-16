"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { writeClientSession } from "@/src/study/client-session";

const agreements = [
  "I have read the study information.",
  "I understand that my interaction may be recorded for research.",
  "I agree to participate in this study.",
];

export function ConsentForm() {
  const router = useRouter();
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const complete = checked.every(Boolean);

  const continueToStudy = async () => {
    if (!complete || busy) return;
    setBusy(true); setError("");
    try {
      const start = await fetch("/api/study/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const session = await start.json() as { sessionId?: string; sessionToken?: string; sessionCode?: string; participantCode?: string; error?: string };
      if (!start.ok) {
        if (session.error === "supabase_not_configured") throw new Error("The research database is not configured on this server. Please contact the study coordinator.");
        throw new Error("The study session could not be created. Please try again.");
      }
      if (!session.sessionId || !session.sessionToken || !session.sessionCode || !session.participantCode) throw new Error("The study server returned an incomplete session. Please contact the study coordinator.");
      writeClientSession(session as { sessionId: string; sessionToken: string; sessionCode: string; participantCode: string });
      const consent = await fetch("/api/study/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent", sessionId: session.sessionId, sessionToken: session.sessionToken }) });
      if (!consent.ok) throw new Error("Your consent could not be recorded.");
      router.push("/study/instructions");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to start the study."); }
    finally { setBusy(false); }
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
        <p>{error || (complete ? "You're ready to continue." : "Confirm all three statements to continue.")}</p>
        <Button disabled={!complete || busy} onClick={continueToStudy} className="action-button">{busy ? "Starting..." : "Continue"} <ArrowRight /></Button>
      </div>
    </section>
  );
}
