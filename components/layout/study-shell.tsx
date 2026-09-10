import { IdeonBrand } from "@/components/brand/ideon-brand";

const stages = ["Chat", "Final", "Survey"];

export function StudyProgress({ current = 0 }: { current?: number }) {
  return (
    <div className="study-progress" aria-label={`Study progress: step ${current + 1} of 3`}>
      {stages.map((stage, index) => (
        <div key={stage} className={index <= current ? "progress-step active" : "progress-step"}>
          <span>{index + 1}</span><small>{stage}</small>
        </div>
      ))}
    </div>
  );
}

export function StudyShell({ children, step, showProgress = true }: { children: React.ReactNode; step?: number; showProgress?: boolean }) {
  return (
    <main className="study-page">
      <div className="study-orb study-orb-one" /><div className="study-orb study-orb-two" />
      <header className="study-site-header"><IdeonBrand /><span>Research session</span></header>
      {showProgress && typeof step === "number" ? <StudyProgress current={step} /> : null}
      <div className="study-content">{children}</div>
      <footer className="study-footer"><span>Ideon Research Prototype</span><span>Your responses are used for approved research purposes.</span></footer>
    </main>
  );
}
