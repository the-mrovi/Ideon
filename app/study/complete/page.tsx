import type { Metadata } from "next";
import { StudyShell } from "@/components/layout/study-shell";
import { CompletionCard } from "@/components/study/completion-card";

export const metadata: Metadata = { title: "Session Complete" };
export default function CompletePage() { return <StudyShell step={2}><CompletionCard /></StudyShell>; }
