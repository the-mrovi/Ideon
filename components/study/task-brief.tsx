import Link from "next/link";
import { ArrowRight, Clock3, Goal, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TaskBrief() {
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
      <div className="form-actions right-only"><Button asChild className="action-button"><Link href="/study/chat">Begin Ideation <ArrowRight /></Link></Button></div>
    </section>
  );
}
