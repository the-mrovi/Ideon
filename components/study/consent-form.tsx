"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const agreements = [
  "I have read the study information.",
  "I understand that my interaction may be recorded for research.",
  "I agree to participate in this study.",
];

export function ConsentForm() {
  const router = useRouter();
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const complete = checked.every(Boolean);

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
        <p>{complete ? "You’re ready to continue." : "Confirm all three statements to continue."}</p>
        <Button disabled={!complete} onClick={() => router.push("/study/instructions")} className="action-button">Continue <ArrowRight /></Button>
      </div>
    </section>
  );
}
