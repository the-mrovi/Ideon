import type { Metadata } from "next";
import { StudyShell } from "@/components/layout/study-shell";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

export const metadata: Metadata = { title: "Research Ideation" };
export default function ChatPage() { return <StudyShell showProgress={false} variant="chat"><ChatWorkspace /></StudyShell>; }
