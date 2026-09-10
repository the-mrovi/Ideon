import type { Metadata } from "next";
import { StudyShell } from "@/components/layout/study-shell";
import { FinalIdeaForm } from "@/components/study/final-idea-form";

export const metadata: Metadata = { title: "Final Research Idea" };
export default function FinalPage() { return <StudyShell step={1}><FinalIdeaForm /></StudyShell>; }
