import type { Metadata } from "next";
import { StudyShell } from "@/components/layout/study-shell";
import { QuestionnaireForm } from "@/components/study/questionnaire-form";

export const metadata: Metadata = { title: "Post-task Questionnaire" };
export default function QuestionnairePage() { return <StudyShell step={2}><QuestionnaireForm /></StudyShell>; }
