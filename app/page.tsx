import Link from "next/link";
import { ArrowRight, Lightbulb, MessageSquareText, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeonMark } from "@/components/brand/ideon-brand";

export default function Home() {
  return (
    <main className="landing-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="site-header">
        <Link href="/" className="brand-lockup" aria-label="Ideon home"><IdeonMark /><span>Ideon</span></Link>
        <span className="prototype-label"><i /> Research prototype</span>
      </header>

      <section className="landing-grid">
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles /> Human–AI research ideation</p>
          <h1>Find the idea worth following.</h1>
          <p className="hero-summary">A focused conversation that helps you move from a broad interest to a research question you can call your own.</p>
          <Button asChild size="lg" className="primary-cta"><Link href="/study/consent">Enter the conversation <ArrowRight aria-hidden="true" /></Link></Button>
          <p className="quiet-note"><span /> Private session · approximately 20 minutes</p>
        </div>

        <div className="experience-stage">
          <div className="intelligence-orb" aria-hidden="true"><i /><i /><i /><span /></div>
          <div className="chat-preview" aria-label="Preview of the Ideon conversation workspace">
            <div className="preview-topbar"><div className="preview-brand"><IdeonMark /><span>Ideon</span></div><span className="status-pill"><i /> Present</span></div>
            <div className="preview-task"><span>Current inquiry</span><strong>Generative AI in University Education</strong></div>
            <div className="preview-messages">
              <div className="ai-preview"><span className="mini-mark"><Lightbulb size={14} /></span><div><strong>Ideon</strong><p>Which part of students’ experience with generative AI feels most worth understanding?</p></div></div>
              <div className="user-preview">I’m curious about what happens to independent problem-solving.</div>
            </div>
            <div className="preview-composer"><MessageSquareText aria-hidden="true" /><span>Share what you’re thinking…</span><button aria-label="Send message"><Send /></button></div>
          </div>
        </div>
      </section>

      <section className="process-strip" aria-label="How the session works">
        {[["01", "Open the space", "Begin with the tension or topic that interests you."], ["02", "Follow the signal", "Compare possibilities, reject dead ends, and go deeper."], ["03", "Name the direction", "Leave with a focused question written in your words."]].map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{copy}</p></div></article>)}
      </section>
    </main>
  );
}
