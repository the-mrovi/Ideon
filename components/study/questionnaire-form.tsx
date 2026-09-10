"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const sections = [
  { name: "Creativity", questions: ["The conversation helped me develop an original research direction.", "Ideon helped me consider ideas I may not have reached alone."] },
  { name: "Control & ownership", questions: ["I felt in control of the direction of the conversation.", "The final research idea feels like my own."] },
  { name: "Trust & reliance", questions: ["I trusted the suggestions provided by Ideon.", "I could judge when an AI suggestion was useful for my task."] },
  { name: "Effort & satisfaction", questions: ["The task required a manageable amount of mental effort.", "I am satisfied with the research direction I developed."] },
];
const questions = sections.flatMap((section) => section.questions);

function LikertScale({ question, value, onChange, index }: { question: string; value?: number; onChange: (value: number) => void; index: number }) {
  return (
    <fieldset className="likert-row"><legend><span>{String(index + 1).padStart(2, "0")}</span>{question}</legend>
      <div className="likert-options"><small>Strongly disagree</small><div className="likert-numbers">{[1,2,3,4,5].map((number) => <label key={number} className={value === number ? "selected" : ""}><input type="radio" name={`question-${index}`} value={number} checked={value === number} onChange={() => onChange(number)} /><span>{number}</span></label>)}</div><small>Strongly agree</small></div>
    </fieldset>
  );
}

export function QuestionnaireForm() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [attempted, setAttempted] = useState(false);
  const answered = Object.keys(answers).length;
  const percent = useMemo(() => Math.round(answered / questions.length * 100), [answered]);
  const submit = (event: React.FormEvent) => { event.preventDefault(); setAttempted(true); if (answered === questions.length) router.push("/study/complete"); };

  return (
    <section className="questionnaire-panel" aria-labelledby="questionnaire-title">
      <div className="questionnaire-heading"><div><div className="panel-kicker"><ClipboardCheck /><span>Post-task questionnaire</span></div><h1 id="questionnaire-title">Tell us about the experience</h1><p>Choose the response that best reflects your experience. There are no right or wrong answers.</p></div><div className="survey-count"><strong>{answered}/{questions.length}</strong><span>answered</span></div></div>
      <Progress value={percent} aria-label={`${percent}% complete`} className="survey-progress" />
      <form onSubmit={submit}>
        {sections.map((section) => <section className="survey-section" key={section.name}><h2>{section.name}</h2>{section.questions.map((question) => { const index = questions.indexOf(question); return <LikertScale key={question} question={question} index={index} value={answers[index]} onChange={(value) => setAnswers((items) => ({ ...items, [index]: value }))} />; })}</section>)}
        {attempted && answered !== questions.length ? <p className="validation-message" role="alert">Please answer all {questions.length} statements before submitting.</p> : null}
        <div className="survey-submit"><span>{answered === questions.length ? "All responses complete." : `${questions.length - answered} responses remaining.`}</span><Button type="submit" className="action-button">Submit Responses <ArrowRight /></Button></div>
      </form>
    </section>
  );
}
