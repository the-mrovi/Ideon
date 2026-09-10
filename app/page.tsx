import Link from "next/link";
import { ArrowRight, Lightbulb, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdeonMark } from "@/components/brand/ideon-brand";

export default function Home() {
  return (
    <main className="landing-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="site-header">
        <Link href="/" className="brand-lockup" aria-label="Ideon home"><IdeonMark /><span>Ideon</span></Link>
        <span className="prototype-label">Research prototype</span>
      </header>
      <section className="landing-grid">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Human–AI research ideation</p>
          <h1>Ideas become clearer through conversation.</h1>
          <p className="hero-summary">Develop, explore, and refine research ideas through a guided AI conversation.</p>
          <Button asChild size="lg" className="primary-cta"><Link href="/study/consent">Start Research Session <ArrowRight aria-hidden="true" /></Link></Button>
          <p className="quiet-note">Designed for a focused 15–25 minute session.</p>
        </div>
        <div className="chat-preview" aria-label="Preview of the Ideon conversation workspace">
          <div className="preview-topbar">
            <div className="preview-brand"><IdeonMark /><span>Ideon</span></div>
            <span className="status-pill"><i /> Session active</span>
          </div>
          <div className="preview-task"><span>Research task</span><strong>Generative AI in University Education</strong></div>
          <div className="preview-messages">
            <div className="ai-preview">
              <span className="mini-mark"><Lightbulb size={14} /></span>
              <div><strong>Ideon</strong><p>What aspect of students’ experience with generative AI feels most worth understanding?</p></div>
            </div>
            <div className="user-preview">I’m interested in how it changes the way students approach difficult assignments.</div>
          </div>
          <div className="preview-composer">
            <MessageSquareText aria-hidden="true" /><span>Share what you’re thinking…</span>
            <button aria-label="Send message"><Send /></button>
          </div>
        </div>
      </section>
      <section className="process-strip" aria-label="How the session works">
        {[
          ["01", "Begin broadly", "Start with an area that interests you."],
          ["02", "Think together", "Develop ideas through focused conversation."],
          ["03", "Leave with direction", "Submit a clear final research question."],
        ].map(([number, title, copy]) => (
          <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{copy}</p></div></article>
        ))}
      </section>
    </main>
  );
}
