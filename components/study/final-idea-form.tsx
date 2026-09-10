"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FinalIdea } from "@/types/study";

const initial: FinalIdea = { topic: "Generative AI in University Education", problem: "", question: "", explanation: "" };

export function FinalIdeaForm() {
  const router = useRouter();
  const [idea, setIdea] = useState(initial);
  const [touched, setTouched] = useState(false);
  const complete = useMemo(() => idea.topic.trim() && idea.problem.trim() && idea.question.trim() && idea.explanation.trim(), [idea]);
  const update = (field: keyof FinalIdea, value: string) => { setTouched(true); setIdea((current) => ({ ...current, [field]: value })); };

  return (
    <section className="form-panel final-panel" aria-labelledby="final-title">
      <div className="panel-kicker"><CheckCircle2 /><span>Review your work</span></div>
      <h1 id="final-title">Your final research idea</h1>
      <p className="panel-intro">Shape your final direction in your own words. You can return to the conversation if you need more time.</p>
      <form onSubmit={(event) => { event.preventDefault(); if (complete) router.push("/study/questionnaire"); }}>
        <div className="field-group"><label htmlFor="topic">Research topic</label><p>Keep this broad enough to show the area of study.</p><Input id="topic" value={idea.topic} onChange={(e) => update("topic", e.target.value)} /></div>
        <div className="field-group"><label htmlFor="problem">Research problem</label><p>Describe the specific issue or gap you want to understand.</p><Textarea id="problem" value={idea.problem} onChange={(e) => update("problem", e.target.value)} placeholder="What is happening, and why does it matter?" rows={3} /></div>
        <div className="field-group featured-field"><label htmlFor="question">Final research question</label><p>Write one focused question that could guide a study.</p><Textarea id="question" value={idea.question} onChange={(e) => update("question", e.target.value)} placeholder="How does…? What factors…? In what ways…?" rows={3} /></div>
        <div className="field-group"><label htmlFor="explanation">Short explanation</label><p>Explain why this question is worth investigating.</p><Textarea id="explanation" value={idea.explanation} onChange={(e) => update("explanation", e.target.value)} placeholder="In a few sentences…" rows={4} /></div>
        <div className="unsaved-note" role="status"><i className={touched ? "changed" : ""} />{touched ? "Changes are stored only for this mock session." : "No changes yet."}</div>
        <div className="split-actions"><Button asChild variant="ghost"><Link href="/study/chat"><ArrowLeft /> Return to Chat</Link></Button><Button type="submit" disabled={!complete} className="action-button">Submit Final Idea <ArrowRight /></Button></div>
      </form>
    </section>
  );
}
