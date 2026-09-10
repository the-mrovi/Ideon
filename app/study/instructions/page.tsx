import type { Metadata } from "next";
import { StudyShell } from "@/components/layout/study-shell";
import { TaskBrief } from "@/components/study/task-brief";

export const metadata: Metadata = { title: "Study Instructions" };
export default function InstructionsPage() { return <StudyShell step={0}><TaskBrief /></StudyShell>; }
